param(
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 3000,
    [double]$Fps = 10.0,
    [ValidateSet("light", "moderate", "heavy")]
    [string]$Scenario = "moderate",
    [switch]$NoBrowser,
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$FrontendRoot = Join-Path $ProjectRoot "frontend"
$LogRoot = Join-Path $ProjectRoot "logs"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-V2XCloudApi {
    param(
        [string]$Url,
        [int]$TimeoutSec = 2
    )

    try {
        $health = Invoke-RestMethod -Uri $Url -Method GET -TimeoutSec $TimeoutSec
        return (
            $health.status -eq "ok" -and
            $null -ne $health.timestamp -and
            $null -ne $health.clients
        )
    } catch {
        return $false
    }
}

function Wait-V2XCloudApi {
    param(
        [string]$Url,
        [int]$Seconds = 30
    )

    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-V2XCloudApi -Url $Url -TimeoutSec 2) {
            return $true
        }
        Start-Sleep -Milliseconds 700
    }
    return $false
}

function Test-V2XFrontend {
    param(
        [string]$Url,
        [int]$TimeoutSec = 2
    )

    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec
        return (
            $response.StatusCode -ge 200 -and
            $response.StatusCode -lt 300 -and
            $response.Content.Contains("brand-mark.svg") -and
            $response.Content.Contains("/src/main.tsx")
        )
    } catch {
        return $false
    }
}

function Wait-V2XFrontend {
    param(
        [string]$Url,
        [int]$Seconds = 30
    )

    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-V2XFrontend -Url $Url -TimeoutSec 2) {
            return $true
        }
        Start-Sleep -Milliseconds 700
    }
    return $false
}

function Get-RequiredCommand {
    param(
        [string]$Name,
        [string]$InstallHint
    )

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "Missing command '$Name'. $InstallHint"
    }
    return $command.Source
}

function Resolve-V2XPython {
    if ($env:V2X_PYTHON) {
        if (-not (Test-Path -LiteralPath $env:V2X_PYTHON)) {
            throw "V2X_PYTHON does not point to an executable: $env:V2X_PYTHON"
        }
        return (Resolve-Path -LiteralPath $env:V2X_PYTHON).Path
    }

    $candidatePaths = @()
    if ($env:CONDA_PREFIX) {
        $condaRoot = Split-Path -Parent $env:CONDA_PREFIX
        $candidatePaths += Join-Path $condaRoot "v2x-ghost-algorithm\python.exe"
    }

    $pythonCommand = Get-Command "python" -ErrorAction SilentlyContinue
    if ($pythonCommand) {
        $pythonRoot = Split-Path -Parent (Split-Path -Parent $pythonCommand.Source)
        $candidatePaths += Join-Path $pythonRoot "envs\v2x-ghost-algorithm\python.exe"
    }

    $candidatePaths += "D:\Anaconda\envs\v2x-ghost-algorithm\python.exe"
    foreach ($candidatePath in ($candidatePaths | Select-Object -Unique)) {
        if (Test-Path -LiteralPath $candidatePath) {
            return (Resolve-Path -LiteralPath $candidatePath).Path
        }
    }

    return Get-RequiredCommand -Name "python" -InstallHint "Install Python 3.10+ and add it to PATH, or set V2X_PYTHON to the project environment executable."
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

New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null

Write-Host "V2X Ghost-Probe Demo Launcher" -ForegroundColor Green
Write-Host "Project: $ProjectRoot"

$PythonExe = Resolve-V2XPython
$NpmExe = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
if ($NpmExe) {
    $NpmExe = $NpmExe.Source
} else {
    $NpmExe = Get-RequiredCommand -Name "npm" -InstallHint "Install Node.js 18+ and add npm to PATH."
}

if (-not (Test-Path (Join-Path $FrontendRoot "package.json"))) {
    throw "Frontend package.json not found at $FrontendRoot"
}

if (-not $SkipInstall -and -not (Test-Path (Join-Path $FrontendRoot "node_modules"))) {
    Write-Step "Installing frontend dependencies"
    Push-Location $FrontendRoot
    try {
        & $NpmExe install
    } finally {
        Pop-Location
    }
}

$backendCheckUrl = "http://127.0.0.1:$BackendPort"
$frontendCheckUrl = "http://127.0.0.1:$FrontendPort"
$backendUrl = "http://localhost:$BackendPort"
$frontendUrl = "http://localhost:$FrontendPort"
$frontendApiBaseUrl = "$backendUrl/api/v1"
$backendHealthUrl = "$backendCheckUrl/api/v1/health"
$demoStartUrl = "$backendCheckUrl/api/v1/demo/start?fps=$Fps&scenario=$Scenario"

$startedBackend = $false
$startedFrontend = $false

if (Wait-V2XCloudApi -Url $backendHealthUrl -Seconds 8) {
    Write-Step "V2X Cloud API already running on port $BackendPort"
} elseif (Test-PortListening -Port $BackendPort) {
    throw "Port $BackendPort is already in use by another service. $backendHealthUrl did not return the V2X Cloud API health contract. Stop that process or pass -BackendPort."
} else {
    Write-Step "Starting Cloud API on port $BackendPort"
    $backendLog = Join-Path $LogRoot "demo_backend.log"
    $backendErr = Join-Path $LogRoot "demo_backend.err.log"
    Start-Process `
        -FilePath $PythonExe `
        -ArgumentList @("-m", "uvicorn", "src.cloud_twin.api:app", "--host", "0.0.0.0", "--port", "$BackendPort") `
        -WorkingDirectory $ProjectRoot `
        -RedirectStandardOutput $backendLog `
        -RedirectStandardError $backendErr `
        -WindowStyle Hidden
    $startedBackend = $true
}

if (-not (Wait-V2XCloudApi -Url $backendHealthUrl -Seconds 35)) {
    throw "Cloud API did not become ready. Check logs\demo_backend.err.log"
}

Write-Step "Starting $Scenario demo loop at $Fps FPS"
Invoke-WebRequest -Uri $demoStartUrl -Method POST -UseBasicParsing | Out-Null

if (Wait-V2XFrontend -Url $frontendCheckUrl -Seconds 8) {
    Write-Step "V2X frontend already running on port $FrontendPort"
} elseif (Test-PortListening -Port $FrontendPort) {
    throw "Port $FrontendPort is already in use by another service. $frontendCheckUrl did not return the V2X frontend marker. Stop that process or pass -FrontendPort."
} else {
    Write-Step "Starting frontend dev server on port $FrontendPort"
    $frontendLog = Join-Path $LogRoot "demo_frontend.log"
    $frontendErr = Join-Path $LogRoot "demo_frontend.err.log"
    $previousCloudApiBaseUrl = $env:VITE_CLOUD_API_BASE_URL
    $env:VITE_CLOUD_API_BASE_URL = $frontendApiBaseUrl
    try {
        Start-Process `
            -FilePath $NpmExe `
            -ArgumentList @("run", "dev", "--", "--host", "0.0.0.0", "--port", "$FrontendPort") `
            -WorkingDirectory $FrontendRoot `
            -RedirectStandardOutput $frontendLog `
            -RedirectStandardError $frontendErr `
            -WindowStyle Hidden
    } finally {
        $env:VITE_CLOUD_API_BASE_URL = $previousCloudApiBaseUrl
    }
    $startedFrontend = $true
}

if (-not (Wait-V2XFrontend -Url $frontendCheckUrl -Seconds 45)) {
    throw "Frontend dev server did not become ready. Check logs\demo_frontend.err.log"
}

$monitorUrl = "$frontendUrl/monitor"
$replayUrl = "$frontendUrl/replay"
$apiDocsUrl = "$backendUrl/docs"

Write-Host ""
Write-Host "Demo is ready." -ForegroundColor Green
Write-Host "Monitor: $monitorUrl"
Write-Host "Replay:  $replayUrl"
Write-Host "API:     $apiDocsUrl"
Write-Host ""
Write-Host "Started backend in this run:  $startedBackend"
Write-Host "Started frontend in this run: $startedFrontend"
Write-Host "Scenario: $Scenario"
Write-Host "Frontend Cloud API: $frontendApiBaseUrl"
Write-Host "Logs: $LogRoot"

if (-not $NoBrowser) {
    Start-Process $monitorUrl
}
