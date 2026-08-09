param(
    [int]$ApiPort = 8000,
    [int]$MqttPort = 1883,
    [double]$Fps = 10.0,
    [string]$ScenarioId = "GP-01",
    [switch]$UseScenarioLibrary,
    [switch]$Loop,
    [switch]$NoBrowser,
    [switch]$NoBrokerStart
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$LogRoot = Join-Path $ProjectRoot "logs"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-PortListening {
    param([int]$Port)

    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne(700, $false)) {
            return $false
        }
        $client.EndConnect($async)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Wait-Http {
    param(
        [string]$Url,
        [int]$Seconds = 30
    )

    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return $true
            }
        } catch {
            Start-Sleep -Milliseconds 700
        }
    }
    return $false
}

function Start-BrokerIfPossible {
    if (Test-PortListening -Port $MqttPort) {
        Write-Step "MQTT Broker already listening on $MqttPort"
        return
    }

    if ($NoBrokerStart) {
        throw "MQTT Broker is not listening on $MqttPort. Start Mosquitto first or omit -NoBrokerStart."
    }

    $mosquitto = Get-Command "mosquitto" -ErrorAction SilentlyContinue
    if ($mosquitto) {
        Write-Step "Starting local Mosquitto"
        Start-Process `
            -FilePath $mosquitto.Source `
            -ArgumentList @("-c", "deployment\mosquitto.conf") `
            -WorkingDirectory $ProjectRoot `
            -RedirectStandardOutput (Join-Path $LogRoot "mqtt_broker.log") `
            -RedirectStandardError (Join-Path $LogRoot "mqtt_broker.err.log") `
            -WindowStyle Hidden
        Start-Sleep -Seconds 2
        if (Test-PortListening -Port $MqttPort) {
            return
        }
    }

    $dockerCompose = Get-Command "docker-compose" -ErrorAction SilentlyContinue
    $docker = Get-Command "docker" -ErrorAction SilentlyContinue
    if ($dockerCompose) {
        Write-Step "Starting Mosquitto with docker-compose"
        & $dockerCompose.Source up -d mosquitto
    } elseif ($docker) {
        Write-Step "Starting Mosquitto with docker compose"
        & $docker.Source compose up -d mosquitto
    }

    Start-Sleep -Seconds 4
    if (-not (Test-PortListening -Port $MqttPort)) {
        throw "MQTT Broker is not available on $MqttPort. Install Mosquitto or Docker, then rerun this script."
    }
}

function Start-Agent {
    param(
        [string]$Name,
        [string[]]$Arguments
    )

    $stdout = Join-Path $LogRoot "$Name.log"
    $stderr = Join-Path $LogRoot "$Name.err.log"
    Write-Step "Starting $Name"
    Start-Process `
        -FilePath "python" `
        -ArgumentList $Arguments `
        -WorkingDirectory $ProjectRoot `
        -RedirectStandardOutput $stdout `
        -RedirectStandardError $stderr `
        -WindowStyle Hidden
}

New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null

Write-Host "V2X MQTT Three-Agent Launcher" -ForegroundColor Green
Write-Host "Project: $ProjectRoot"

if (-not (Get-Command "python" -ErrorAction SilentlyContinue)) {
    throw "Missing python command. Install Python 3.10+ and add it to PATH."
}

Start-BrokerIfPossible

if (Test-PortListening -Port $ApiPort) {
    throw "API port $ApiPort is already in use. Stop the current Cloud API first, or pass another -ApiPort for API-only verification."
}

Start-Agent -Name "mqtt_cloud_agent" -Arguments @(
    "-m", "src.cloud_twin.cloud_agent",
    "--api-host", "0.0.0.0",
    "--api-port", "$ApiPort"
)

$healthUrl = "http://127.0.0.1:$ApiPort/api/v1/health"
if (-not (Wait-Http -Url $healthUrl -Seconds 35)) {
    throw "CloudAgent API did not become ready on $ApiPort. Check logs\mqtt_cloud_agent.err.log"
}

if ($UseScenarioLibrary) {
    $scenarioPublisherArguments = @(
        "-m", "src.scenario_library.mqtt_publisher",
        "--scenario-id", "$ScenarioId",
        "--database-path", "data/v2x_cloud.db",
        "--broker-host", "127.0.0.1",
        "--broker-port", "$MqttPort",
        "--scene-id", "scene_001",
        "--fps", "$Fps"
    )
    if ($Loop) {
        $scenarioPublisherArguments += "--loop"
    }
    Start-Agent -Name "mqtt_scenario_publisher" -Arguments $scenarioPublisherArguments
} else {
    Start-Agent -Name "mqtt_vehicle_agent" -Arguments @("-m", "src.vehicle_decision.vehicle_agent")
    Start-Sleep -Seconds 1
    Start-Agent -Name "mqtt_replay_engine" -Arguments @("-m", "src.roadside_perception.replay_engine", "--fps", "$Fps")
}

$monitorUrl = "http://localhost:3000/monitor"
$apiDocsUrl = "http://localhost:$ApiPort/docs"

Write-Host ""
Write-Host "MQTT demo agents are starting." -ForegroundColor Green
Write-Host "MQTT Broker: 127.0.0.1:$MqttPort"
Write-Host "Cloud API:   $apiDocsUrl"
Write-Host "Monitor UI:  $monitorUrl"
Write-Host "Logs:        $LogRoot"
if ($UseScenarioLibrary) {
    Write-Host "Scenario:    $ScenarioId (SQLite scenario library)"
} else {
    Write-Host "Scenario:    legacy replay engine"
}
Write-Host ""
Write-Host "Verify with:"
Write-Host "Invoke-WebRequest http://127.0.0.1:$ApiPort/api/v1/messages/recent?limit=10"
Write-Host "Invoke-WebRequest http://127.0.0.1:$ApiPort/api/v1/events?limit=5"

if (-not $NoBrowser) {
    Start-Process $apiDocsUrl
}
