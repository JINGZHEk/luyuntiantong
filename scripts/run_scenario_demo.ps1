param(
    [ValidateSet(
        "GP-01", "GP-02", "GP-03", "GP-04", "GP-05", "GP-06", "GP-07", "GP-08",
        "NM-01", "NM-02", "NM-03", "NM-04",
        "IC-01", "IC-02", "IC-03", "IC-04"
    )]
    [string]$ScenarioId = "GP-01",
    [double]$Fps = 10.0,
    [switch]$Loop,
    [string]$DatabasePath = "data/v2x_cloud.db",
    [int]$ApiPort = 8000,
    [int]$FrontendPort = 3000,
    [int]$MqttPort = 1883,
    [switch]$InMemory,
    [switch]$DryRun,
    [switch]$NoBrowser,
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$FrontendRoot = Join-Path $ProjectRoot "frontend"
$LogRoot = Join-Path $ProjectRoot "logs"
$DatabaseFile = if ([IO.Path]::IsPathRooted($DatabasePath)) {
    $DatabasePath
} else {
    Join-Path $ProjectRoot $DatabasePath
}
$ManagedProcesses = @()

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
        [int]$Seconds = 35
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

function Start-ManagedProcess {
    param(
        [string]$Name,
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$WorkingDirectory = $ProjectRoot
    )

    $stdout = Join-Path $LogRoot "$Name.log"
    $stderr = Join-Path $LogRoot "$Name.err.log"
    Write-Step "Starting $Name"
    $process = Start-Process `
        -FilePath $FilePath `
        -ArgumentList $Arguments `
        -WorkingDirectory $WorkingDirectory `
        -RedirectStandardOutput $stdout `
        -RedirectStandardError $stderr `
        -WindowStyle Hidden `
        -PassThru
    $script:ManagedProcesses += [PSCustomObject]@{
        Name = $Name
        Id = $process.Id
    }
    return $process
}

function Stop-ManagedProcesses {
    foreach ($entry in @($ManagedProcesses | Sort-Object -Property Name -Descending)) {
        try {
            $process = Get-Process -Id $entry.Id -ErrorAction Stop
            if (-not $process.HasExited) {
                Write-Host "Stopping $($entry.Name) (PID $($entry.Id))" -ForegroundColor DarkYellow
                Stop-Process -Id $entry.Id -Force -ErrorAction SilentlyContinue
            }
        } catch {
            # The process already exited or the PID is no longer valid.
        }
    }
}

function Print-ScenarioTopics {
    param([string]$SelectedScenarioId)

    Write-Host "Scenario: $SelectedScenarioId"
    Write-Host "Database: $DatabaseFile"
    Write-Host "MQTT topics:"
    Write-Host "  v2x/scene_001/roadside/mock-roadside-001/perception"
    Write-Host "  v2x/scene_001/vehicle/vehicle_001/status"
    Write-Host "  v2x/scene_001/vehicle/vehicle_001/decision"
    Write-Host "  v2x/scene_001/cloud/event"
}

New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $DatabaseFile) | Out-Null

if ($DryRun) {
    Write-Host "V2X SQLite Scenario Demo (dry run)" -ForegroundColor Green
    Print-ScenarioTopics -SelectedScenarioId $ScenarioId
    Write-Host "FPS: $Fps; Loop: $Loop; API: $ApiPort; MQTT: $MqttPort"
    exit 0
}

if ($env:V2X_PYTHON) {
    if (-not (Test-Path $env:V2X_PYTHON)) {
        throw "V2X_PYTHON does not point to an executable: $env:V2X_PYTHON"
    }
    $PythonExe = (Resolve-Path $env:V2X_PYTHON).Path
} else {
    $PythonCommand = Get-Command "python" -ErrorAction SilentlyContinue
    if (-not $PythonCommand) {
        throw "Missing python command. Install Python 3.10+ and add it to PATH."
    }
    $PythonExe = $PythonCommand.Source
}

if ($InMemory) {
    Write-Host "InMemory mode is test-only; running the representative MQTT fixture." -ForegroundColor Yellow
    & $PythonExe -m unittest tests.test_scenario_e2e -v
    exit $LASTEXITCODE
}

$NpmCommand = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
if (-not $NpmCommand) {
    $NpmCommand = Get-Command "npm" -ErrorAction SilentlyContinue
}
if (-not $NpmCommand) {
    throw "Missing npm command. Install Node.js 18+ and add npm to PATH."
}
$NpmExe = $NpmCommand.Source

if (-not $SkipInstall -and -not (Test-Path (Join-Path $FrontendRoot "node_modules"))) {
    Write-Step "Installing frontend dependencies"
    Push-Location $FrontendRoot
    try {
        & $NpmExe install
    } finally {
        Pop-Location
    }
}

try {
    if (-not (Test-PortListening -Port $MqttPort)) {
        $Mosquitto = Get-Command "mosquitto" -ErrorAction SilentlyContinue
        if (-not $Mosquitto) {
            throw "MQTT Broker is not listening on $MqttPort. Install Mosquitto or start one before running this script."
        }
        Start-ManagedProcess `
            -Name "scenario_mqtt_broker" `
            -FilePath $Mosquitto.Source `
            -Arguments @("-p", "$MqttPort")
        $brokerDeadline = (Get-Date).AddSeconds(8)
        while (-not (Test-PortListening -Port $MqttPort) -and (Get-Date) -lt $brokerDeadline) {
            Start-Sleep -Milliseconds 500
        }
        if (-not (Test-PortListening -Port $MqttPort)) {
            throw "Mosquitto did not become ready on $MqttPort. Check logs\scenario_mqtt_broker.err.log"
        }
    } else {
        Write-Step "MQTT Broker already listening on $MqttPort"
    }

    if (Test-PortListening -Port $ApiPort) {
        throw "API port $ApiPort is already in use. Stop the current Cloud API or pass another -ApiPort."
    }
    if (Test-PortListening -Port $FrontendPort) {
        throw "Frontend port $FrontendPort is already in use. Stop the current frontend or pass another -FrontendPort."
    }

    Start-ManagedProcess `
        -Name "scenario_cloud_agent" `
        -FilePath $PythonExe `
        -Arguments @(
            "-m", "src.cloud_twin.cloud_agent",
            "--database-path", "$DatabaseFile",
            "--api-host", "0.0.0.0",
            "--api-port", "$ApiPort"
        )

    $healthUrl = "http://127.0.0.1:$ApiPort/api/v1/health"
    if (-not (Wait-Http -Url $healthUrl -Seconds 35)) {
        throw "CloudAgent API did not become ready on $ApiPort. Check logs\scenario_cloud_agent.err.log"
    }

    $previousCloudApiBaseUrl = $env:VITE_CLOUD_API_BASE_URL
    $env:VITE_CLOUD_API_BASE_URL = "http://localhost:$ApiPort/api/v1"
    try {
        Start-ManagedProcess `
            -Name "scenario_frontend" `
            -FilePath $NpmExe `
            -Arguments @("run", "dev", "--", "--host", "0.0.0.0", "--port", "$FrontendPort") `
            -WorkingDirectory $FrontendRoot
    } finally {
        $env:VITE_CLOUD_API_BASE_URL = $previousCloudApiBaseUrl
    }

    $frontendUrl = "http://127.0.0.1:$FrontendPort"
    if (-not (Wait-Http -Url $frontendUrl -Seconds 45)) {
        throw "Frontend dev server did not become ready. Check logs\scenario_frontend.err.log"
    }

    $publisherArgs = @(
        "-m", "src.scenario_library.mqtt_publisher",
        "--scenario-id", $ScenarioId,
        "--database-path", "$DatabaseFile",
        "--broker-host", "127.0.0.1",
        "--broker-port", "$MqttPort",
        "--scene-id", "scene_001",
        "--fps", "$Fps"
    )
    if ($Loop) {
        $publisherArgs += "--loop"
    }
    Start-ManagedProcess `
        -Name "scenario_publisher" `
        -FilePath $PythonExe `
        -Arguments $publisherArgs

    $pidFile = Join-Path $LogRoot "scenario_demo.pids.json"
    $ManagedProcesses | ConvertTo-Json | Set-Content -Path $pidFile -Encoding UTF8

    Write-Host ""
    Write-Host "SQLite scenario demo is ready." -ForegroundColor Green
    Write-Host "Monitor: http://localhost:$FrontendPort/monitor"
    Write-Host "Replay:  http://localhost:$FrontendPort/replay"
    Write-Host "API:     http://localhost:$ApiPort/docs"
    Write-Host "Scenario: $ScenarioId at $Fps FPS (Loop=$Loop)"
    Write-Host "Database: $DatabaseFile"
    Write-Host "Managed PIDs: $pidFile"
    Write-Host "Logs: $LogRoot"

    if (-not $NoBrowser) {
        Start-Process "http://localhost:$FrontendPort/monitor"
    }
} catch {
    Stop-ManagedProcesses
    throw
}
