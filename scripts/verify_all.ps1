param(
    [switch]$SkipFrontend,
    [switch]$SkipBackend,
    [switch]$SkipBuild,
    [switch]$SkipBrokerless,
    [switch]$SkipM2DemoSample,
    [switch]$SkipModelReadiness
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$FrontendRoot = Join-Path $ProjectRoot "frontend"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

Push-Location $ProjectRoot
try {
    if (-not $SkipBackend) {
        Write-Step "Running backend unit tests"
        python -m unittest tests.test_deployment_config tests.test_mqtt_broker_demo tests.test_embedded_mqtt_broker_demo tests.test_demo_engine tests.test_dataset_manifest tests.test_dair_dataset_discovery tests.test_mini_split_evaluation tests.test_model_readiness tests.test_yolo_image_inference tests.test_yolo_detection_evaluation tests.test_yolo_detection_script tests.test_stgnn_predictor tests.test_stgnn_model tests.test_stgnn_training_data tests.test_stgnn_training_script tests.test_stgnn_checkpoint_evaluation tests.test_algorithm_pipeline -v

        Write-Step "Verifying Docker Compose deployment contract"
        python scripts\verify_docker_compose_config.py

        if (-not $SkipBrokerless) {
            Write-Step "Verifying brokerless MQTT three-agent flow"
            python scripts\verify_inmemory_mqtt_demo.py --scenario heavy --frames 80 --verify-fallback
        }

        if (-not $SkipM2DemoSample) {
            Write-Step "Verifying M2 DAIR-style demo sample evaluation loop"
            python scripts\verify_m2_demo_sample.py --frames 60 --horizon 30
        }

        if (-not $SkipModelReadiness) {
            Write-Step "Checking YOLO/ST-GNN model environment readiness"
            python scripts\verify_model_readiness.py
        }
    }

    if (-not $SkipFrontend) {
        Write-Step "Running frontend checks"
        Push-Location $FrontendRoot
        try {
            npm run test:unit
            npm run lint
            if (-not $SkipBuild) {
                npm run build
            }
        } finally {
            Pop-Location
        }
    }

    Write-Host ""
    Write-Host "Verification commands completed." -ForegroundColor Green
} finally {
    Pop-Location
}
