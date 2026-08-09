param(
    [int]$Frames = 60,
    [double]$Fps = 10.0,
    [ValidateSet("light", "moderate", "heavy")]
    [string]$Scenario = "moderate",
    [int]$ApiPort = 8000,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$LogRoot = Join-Path $ProjectRoot "logs"
$WorkDir = Join-Path $ProjectRoot "data\pc_cloud_validation"
$RoadsideConfig = Join-Path $ProjectRoot "configs\roadside.pc.yaml"
$CloudConfig = Join-Path $ProjectRoot "configs\cloud.pc.yaml"
$VideoPath = Join-Path $ProjectRoot "data\pc_demo\traffic.mp4"
$DatabasePath = Join-Path $WorkDir "pc_cloud.db"
$MqttPort = 1883

if ($Frames -lt 1) { throw "Frames must be greater than zero." }
if ($Fps -le 0) { throw "Fps must be greater than zero." }

$AlgorithmPython = "D:\Anaconda\envs\v2x-ghost-algorithm\python.exe"
if (-not (Test-Path $AlgorithmPython)) {
    $pythonCommand = Get-Command "python" -ErrorAction SilentlyContinue
    if (-not $pythonCommand) { throw "Python 3.11 algorithm environment was not found and python is not on PATH." }
    $AlgorithmPython = $pythonCommand.Source
}

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
        if (-not $async.AsyncWaitHandle.WaitOne(700, $false)) { return $false }
        $client.EndConnect($async)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Test-CloudHealth {
    param([int]$Port)
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/v1/health" -TimeoutSec 2
        return $health.status -eq "ok"
    } catch {
        return $false
    }
}

function Wait-CloudHealth {
    param([int]$Port, [int]$Seconds = 30)
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-CloudHealth -Port $Port) { return $true }
        Start-Sleep -Milliseconds 700
    }
    return $false
}

$StartedProcesses = @()
function Start-V2XProcess {
    param(
        [string]$Name,
        [string]$FilePath,
        [string[]]$ArgumentList
    )
    $stdout = Join-Path $LogRoot "$Name.log"
    $stderr = Join-Path $LogRoot "$Name.err.log"
    Write-Step "Starting $Name"
    $process = Start-Process `
        -FilePath $FilePath `
        -ArgumentList $ArgumentList `
        -WorkingDirectory $ProjectRoot `
        -RedirectStandardOutput $stdout `
        -RedirectStandardError $stderr `
        -WindowStyle Hidden `
        -PassThru
    $script:StartedProcesses += $process
    return $process
}

if ($DryRun) {
    [ordered]@{
        project_root = $ProjectRoot
        python = $AlgorithmPython
        scenario = $Scenario
        frames = $Frames
        fps = $Fps
        api_port = $ApiPort
        mqtt_port = $MqttPort
        roadside_config = $RoadsideConfig
        cloud_config = $CloudConfig
        video_path = $VideoPath
        database_path = $DatabasePath
        cloud_command = "python -m src.cloud_twin.cloud_agent --config configs/cloud.pc.yaml --database-path data/pc_cloud_validation/pc_cloud.db --api-port $ApiPort"
        pc_command = "python scripts/run_pc_perception.py --config configs/roadside.pc.yaml --max-frames $Frames --fps $Fps"
        note = "DryRun does not start Mosquitto, Cloud Agent, or the PC perception process."
    } | ConvertTo-Json -Depth 4
    exit 0
}

if (-not (Test-Path $RoadsideConfig)) { throw "Missing PC roadside config: $RoadsideConfig" }
if (-not (Test-Path $CloudConfig)) { throw "Missing PC cloud config: $CloudConfig" }
if (-not (Test-Path $VideoPath)) {
    throw "PC input video was not found: $VideoPath. Put a traffic video there or update configs/roadside.pc.yaml before running the real PC demo."
}

New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null

try {
    $brokerProcess = $null
    if (-not (Test-PortListening -Port $MqttPort)) {
        $mosquitto = Get-Command "mosquitto" -ErrorAction SilentlyContinue
        if (-not $mosquitto) {
            throw "MQTT broker is not listening on $MqttPort and Mosquitto was not found. Start Mosquitto or Docker first."
        }
        $brokerProcess = Start-V2XProcess `
            -Name "pc_cloud_mosquitto" `
            -FilePath $mosquitto.Source `
            -ArgumentList @("-c", (Join-Path $ProjectRoot "deployment\mosquitto.conf"))
        Start-Sleep -Seconds 2
        if (-not (Test-PortListening -Port $MqttPort)) {
            throw "Mosquitto did not become ready on $MqttPort. Check logs/pc_cloud_mosquitto.err.log"
        }
    } else {
        Write-Step "Using existing MQTT broker on $MqttPort"
    }

    if (Test-PortListening -Port $ApiPort -and -not (Test-CloudHealth -Port $ApiPort)) {
        throw "API port $ApiPort is already in use by a non-V2X service. Choose another -ApiPort."
    }

    $cloudProcess = Start-V2XProcess `
        -Name "pc_cloud_agent" `
        -FilePath $AlgorithmPython `
        -ArgumentList @(
            "-m", "src.cloud_twin.cloud_agent",
            "--config", $CloudConfig,
            "--database-path", $DatabasePath,
            "--api-host", "127.0.0.1",
            "--api-port", "$ApiPort"
        )
    if (-not (Wait-CloudHealth -Port $ApiPort -Seconds 35)) {
        throw "Cloud Agent API did not become ready. Check logs/pc_cloud_agent.err.log"
    }

    $pcProcess = Start-V2XProcess `
        -Name "pc_perception" `
        -FilePath $AlgorithmPython `
        -ArgumentList @(
            "scripts/run_pc_perception.py",
            "--config", $RoadsideConfig,
            "--max-frames", "$Frames",
            "--fps", "$Fps"
        )
    Wait-Process -Id $pcProcess.Id
    if ($pcProcess.ExitCode -ne 0) {
        throw "PC perception exited with code $($pcProcess.ExitCode). Check logs/pc_perception.err.log"
    }

    Write-Host ""
    Write-Host "PC -> MQTT -> Cloud STGNN demo completed." -ForegroundColor Green
    Write-Host "Scenario: $Scenario"
    Write-Host "Frames:   $Frames at $Fps FPS (config-controlled)"
    Write-Host "Database: $DatabasePath"
    Write-Host "API:      http://127.0.0.1:$ApiPort/docs"
} finally {
    for ($index = $StartedProcesses.Count - 1; $index -ge 0; $index--) {
        $process = $StartedProcesses[$index]
        try {
            if (-not $process.HasExited) {
                Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            }
        } catch {
            Write-Warning "Failed to stop child process $($process.Id): $($_.Exception.Message)"
        }
    }
}
