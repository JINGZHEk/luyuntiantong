# End-to-End Demo Loop Design

## Goal

Build a real, browser-visible V2X demo loop: the backend generates a synthetic ghost-probe scene, persists frames/events, broadcasts live messages over WebSocket, and the frontend consumes those real messages with local mock data kept only as fallback.

## Scope

This iteration focuses on a reliable demo path. YOLO/ST-GNN model replacement, Mosquitto-dependent distributed startup, Docker hardening, and hardware deployment remain follow-up work.

## Backend Design

Add `src/cloud_twin/demo_engine.py`.

- `generate_demo_frame(frame_index, timestamp, scene_id)` returns perception, vehicle status, decision, and optional event payloads.
- `DemoEngine.step_once()` stores the frame in `DataStore`, stores the event when present, and broadcasts `perception`, `vehicle_status`, `decision`, and `event`.
- `DemoEngine.start(fps)`, `stop()`, and `status()` manage a single asyncio loop task.

Extend `src/cloud_twin/api.py` with:

- `POST /api/v1/demo/start`
- `POST /api/v1/demo/stop`
- `POST /api/v1/demo/step`
- `GET /api/v1/demo/status`

Also add the missing `DataStore.store_event()` method because `CloudAgent` already expects it and the demo loop needs event persistence.

## Frontend Design

Keep the current Ant Design operations-console UI.

- Add `frontend/src/services/demoApi.ts` for demo start/stop/step/status.
- Extend `websocketService.ts` with connection-state subscriptions.
- Update `useMockRealtime()` so real WebSocket messages update dashboard and monitor state, while mock timers remain fallback only.
- Add demo controls and a live/mock connection badge to the realtime monitor page.

## Data Flow

1. The user opens the frontend.
2. The frontend connects to `ws://localhost:8000/api/v1/realtime/ws`.
3. The user clicks "Start demo".
4. The backend generates a synthetic ghost-probe scene at 10 FPS.
5. Frames and events are persisted, recent messages fill, and WebSocket messages stream.
6. Dashboard and monitor pages update from real backend data.
7. Replay/events APIs can query the generated data.

## Error Handling

- Starting the demo twice returns the current running status.
- Stopping when idle returns idle status.
- Demo task exceptions are logged and mark the task stopped.
- Frontend control failures are shown with Ant Design messages.
- If WebSocket disconnects, local mock data resumes so the interface stays active.

## Acceptance Criteria

- `POST /api/v1/demo/start` starts a scenario without Mosquitto or YOLO.
- `GET /api/v1/demo/status` reports running state and current frame.
- `GET /api/v1/messages/recent` fills with generated messages.
- `GET /api/v1/events` shows high-risk events during the scenario.
- The frontend can start/stop/step the demo and visibly updates from WebSocket data.
