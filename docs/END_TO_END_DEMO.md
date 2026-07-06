# End-to-End Demo Loop

This document describes the runnable V2X demo loop added on 2026-07-06.

## What It Does

The demo loop runs inside the Cloud API process and does not require Mosquitto,
YOLO, PyTorch, or physical devices. It generates a deterministic ghost-probe
scene:

1. A roadside node detects a parked car and an occluded pedestrian.
2. The ego vehicle approaches the crossing area.
3. TTC drops into warning/danger/emergency windows.
4. The backend stores frames and ghost-probe events.
5. The backend broadcasts perception, vehicle status, decision, and event
   messages to frontend WebSocket clients.

## One-Click Start on Windows

```powershell
cd E:\路云天瞳\luyuntiantong
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start_demo.ps1
```

Use `-NoBrowser` to keep the browser closed, or `-BackendPort` /
`-FrontendPort` when the default ports are occupied. Use `-Scenario light`,
`-Scenario moderate`, or `-Scenario heavy` to pick the ghost-probe intensity.
When `start_demo.ps1` launches the frontend dev server, it injects
`VITE_CLOUD_API_BASE_URL=http://localhost:<BackendPort>/api/v1`, so custom
backend ports work without a manual settings change. If the frontend was
already running, use `/settings` to confirm the Cloud API Base URL.

## Start Backend

```powershell
cd E:\路云天瞳\luyuntiantong
python -m uvicorn src.cloud_twin.api:app --host 0.0.0.0 --port 8000
```

## Start Frontend

```powershell
cd E:\路云天瞳\luyuntiantong\frontend
npm run dev -- --host 0.0.0.0
```

Open:

- Frontend monitor page: http://localhost:3000/monitor
- Frontend replay page: http://localhost:3000/replay
- API docs: http://localhost:8000/docs

## Demo API

```powershell
Invoke-WebRequest http://localhost:8000/api/v1/demo/status
Invoke-WebRequest "http://localhost:8000/api/v1/demo/start?fps=10&scenario=heavy" -Method POST
Invoke-WebRequest "http://localhost:8000/api/v1/demo/step?scenario=light" -Method POST
Invoke-WebRequest http://localhost:8000/api/v1/demo/stop -Method POST
```

Useful verification endpoints:

```powershell
Invoke-WebRequest http://localhost:8000/api/v1/health
Invoke-WebRequest http://localhost:8000/api/v1/messages/recent?limit=5
Invoke-WebRequest http://localhost:8000/api/v1/events?limit=5
```

## Frontend Controls

Open `http://localhost:3000/monitor`.

The top control bar shows:

- Demo running/idle state
- Current frame index
- Scene id
- Start demo
- Stop
- Step once
- Refresh status

The connection panel shows whether the UI is using live Cloud API WebSocket
data or local mock fallback data.

The frontend derives its REST and WebSocket endpoints from the configurable
Cloud API Base URL in `/settings`. The default is
`http://localhost:8000/api/v1`, which maps to
`ws://localhost:8000/api/v1/realtime/ws`.

## Real Event Replay

Open `http://localhost:3000/replay`.

The replay page now loads real events from:

```powershell
Invoke-WebRequest http://localhost:8000/api/v1/events?limit=100
```

When an event is selected, it loads persisted replay frames from:

```powershell
Invoke-WebRequest http://localhost:8000/api/v1/events/<event_id>
```

The frontend maps the backend `replay_frames` payload into the existing
`ReplayFrame` model so the Three.js intersection replay can show the ego
vehicle, pedestrian, parked vehicle, TTC curve, risk score, and braking state.
If the backend has no events or is unavailable, the page falls back to local
mock replay data.

## Verification Performed

```powershell
python -m unittest tests.test_demo_engine -v
cd frontend
npm run build
```

The backend was also manually verified with:

- `GET /api/v1/demo/status`
- `POST /api/v1/demo/start?fps=10`
- `GET /api/v1/messages/recent?limit=8`
- `GET /api/v1/events?limit=5`
- `GET /api/v1/health` reporting `clients: 1` after the frontend connected
- `GET /api/v1/events/{event_id}` returning 41 `replay_frames` for `evt_demo_0054`

## MQTT Three-Agent Demo

For the M1 Roadside Agent -> MQTT -> Vehicle Agent -> MQTT -> Cloud Agent
loop, use:

```powershell
cd E:\路云天瞳\luyuntiantong
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start_mqtt_demo.ps1
```

This path requires Mosquitto or Docker. It uses `localhost:1883` for MQTT and
`localhost:8000` for the Cloud API by default. If `-ApiPort` is changed, update
the frontend Cloud API Base URL in `/settings` to match.

When no external broker is available, run the brokerless verification harness:

```powershell
python scripts\verify_inmemory_mqtt_demo.py --scenario heavy --frames 80 --verify-fallback
```

It uses an in-process MQTT bus to validate Roadside -> Vehicle -> Cloud topic
flow, merged frame persistence, ghost-probe event generation, and the vehicle
fallback transition from `cooperative` to `degraded` to `recovering`.

For a stronger local check without installing Mosquitto or Docker, run the
embedded TCP Broker harness from the algorithm environment:

```powershell
& 'D:\Anaconda\envs\v2x-ghost-algorithm\python.exe' -m pip install amqtt
& 'D:\Anaconda\envs\v2x-ghost-algorithm\python.exe' scripts\verify_embedded_mqtt_broker_demo.py --frames 80 --fps 10 --verify-fallback --min-complete-frames 20
```

This starts an `amqtt` Broker on a free local TCP port and runs the actual
Roadside Agent -> TCP MQTT Broker -> Vehicle Agent -> TCP MQTT Broker -> Cloud
Agent path. On this machine it has been verified with `complete_frames=80`,
`event_count=1`, and `fallback_verified=true`. It is a real network check, but
it does not replace the external Mosquitto/Docker Broker validation.

GitHub Actions also installs Mosquitto on the Ubuntu backend runner and runs:

```powershell
python scripts\verify_mqtt_broker_demo.py --frames 80 --fps 10 --verify-fallback
```

That CI step validates the external Mosquitto Broker path even when the local
Windows workstation does not have Mosquitto or Docker installed.

The repository also includes `.github/workflows/algorithm.yml` for manual and
weekly algorithm validation. It creates the `environment-algorithm.yml` Conda
environment, requires YOLO/ST-GNN packages, runs the real YOLO image inference
smoke test, and executes `verify_algorithm_pipeline.py --real-stgnn` for a
small ST-GNN training/checkpoint evaluation loop. This validates the algorithm
runtime path, but it is still not a real DAIR-V2X benchmark result.

## DAIR-V2X Mini Split Entry

First verify whether a real DAIR-V2X style dataset is present:

```powershell
python scripts\verify_dair_dataset.py --search-root E:\路云天瞳
python scripts\verify_dair_dataset.py --search-root E:\路云天瞳 --require-real
```

The script looks for `infrastructure-side/image` and
`infrastructure-side/label`, reports image/label counts, and marks generated
`demo_dair_sample` directories separately from real candidates. On this machine
the scan currently finds only generated demo samples, so `--require-real`
correctly exits non-zero with `real_candidate_count=0`.

When the real DAIR-V2X dataset is not available on the current machine, generate
a DAIR-style ghost-probe sample and run the same build/evaluate path:

```powershell
python scripts\build_dair_mini_split.py --demo-sample --output data\mini_split --max-frames 60 --scene-id demo_dair_001
python scripts\evaluate_mini_split.py --clip data\mini_split\replay\clip_001.json --output data\mini_split\evaluation.json --horizon 30
```

This demo sample is only for smoke-testing the M2 engineering loop and feeding
the frontend evaluation page; it is not a substitute for real DAIR-V2X results.
The verification harness also writes `stgnn_evaluation.json` and
`yolo_detection.json` dry-run reports so the frontend report selector can be
checked without torch, ultralytics, or real DAIR-V2X data.

When a local DAIR-V2X dataset directory is available, generate a project
manifest and replay clip with:

```powershell
python scripts\build_dair_mini_split.py --dair-root E:\datasets\DAIR-V2X --output data\mini_split --max-frames 100
```

This scans `infrastructure-side/image` and `infrastructure-side/label`, writes
`manifest.json`, and creates `replay/clip_001.json` in the frame format consumed
by `ReplayEngine`.

Generate an offline evaluation artifact from that replay clip with:

```powershell
python scripts\evaluate_mini_split.py --clip data\mini_split\replay\clip_001.json --output data\mini_split\evaluation.json --horizon 30
```

Evaluate all replay clips in the directory and write one aggregate report with:

```powershell
python scripts\evaluate_mini_split.py --replay-dir data\mini_split\replay --output data\mini_split\evaluation.json --horizon 30
```

The evaluator currently uses an annotation-driven constant velocity trajectory
baseline. It reports frontend-compatible `precision`, `recall`, `f1Score`,
`ade`, `fde`, `avgLatency`, `e2eLatency`, `leadTime`, and `fps`, plus M2 occlusion metrics
`occAde` and `occAcc`. `leadTime` is the early-warning interval in seconds
from first occluded roadside sighting to target reveal. Directory-level reports also include `clip_count` and a
`clips` summary for per-clip inspection. Reports include `targetStatus`, which
marks each M2 goal metric as `pass`, `fail`, or `unknown` against the thresholds
defined in `GOAL.md`.

`GET /api/v1/evaluation` reads `data/mini_split/evaluation.json` first when the
file exists. Set `V2X_EVALUATION_REPORT` to point at another report path when
testing a custom split.

`GET /api/v1/evaluation/reports` lists the available offline reports. The
frontend evaluation page can switch between the mini split trajectory baseline,
the ST-GNN checkpoint report, and the YOLO Detection Offline report when their
JSON artifacts exist under `data/mini_split`.

## YOLO Image Inference Check

After creating the Python 3.11 algorithm environment, verify that the real YOLO
image path works with:

```powershell
& 'D:\Anaconda\envs\v2x-ghost-algorithm\python.exe' scripts\verify_yolo_image_inference.py --min-detections 1
```

The default image is the real `bus.jpg` asset packaged with ultralytics, and the
default model is `yolov8n`. The script uses the project `Detector(mode="yolo")`
code path, caches weights under `data/model_cache`, and prints a JSON summary
with `model_loaded`, `detection_count`, `classes`, and detections. On this
machine it produced four detections across `bus` and `person`. This is an
inference smoke test, not a DAIR-V2X dataset metric.

## YOLO Detection Offline Report

After `data/mini_split/manifest.json` exists, generate a detection report with a
dry-run detector first:

```powershell
python scripts\evaluate_yolo_detection.py --manifest data\mini_split\manifest.json --output data\mini_split\yolo_detection.json --dry-run --max-frames 20
```

Dry-run mode uses annotations as perfect detections. It verifies manifest
loading, label parsing, IoU matching, report shape, and frontend report
selection, but it is not a real YOLO metric.

Run real YOLO batch detection from the algorithm environment with:

```powershell
& 'D:\Anaconda\envs\v2x-ghost-algorithm\python.exe' scripts\evaluate_yolo_detection.py --manifest data\mini_split\manifest.json --output data\mini_split\yolo_detection.json --max-frames 20
```

The report contains precision, recall, F1, average detection latency, FPS,
TP/FP/FN counts, per-class statistics, and per-frame summaries. Once
`data/mini_split/yolo_detection.json` exists, `GET /api/v1/evaluation/reports`
exposes it as `YOLO Detection Offline`, and the frontend `/evaluation` page can
select it.

The current machine still has `real_candidate_count=0` for real DAIR-V2X data,
so the real YOLO command is ready but must be rerun after a real DAIR-V2X
directory is available.
