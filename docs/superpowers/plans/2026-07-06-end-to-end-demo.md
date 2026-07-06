# End-to-End Demo Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real V2X demo loop that can be started from the frontend and streams synthetic ghost-probe data through the backend WebSocket.

**Architecture:** A focused backend `DemoEngine` generates canonical perception, vehicle, decision, and event payloads and reuses `DataStore` plus `broadcast_to_clients`. The frontend adds a small demo-control API service and keeps mock realtime data only as a fallback.

**Tech Stack:** Python 3 / FastAPI / unittest, React 18 / TypeScript / Ant Design / Zustand.

---

## File Structure

- Create `src/cloud_twin/demo_engine.py`: synthetic scenario generation and async demo loop.
- Modify `src/cloud_twin/data_store.py`: add `store_event()`.
- Modify `src/cloud_twin/api.py`: create and expose demo engine endpoints.
- Create `tests/test_demo_engine.py`: backend behavior tests.
- Create `frontend/src/services/demoApi.ts`: REST client for demo controls.
- Modify `frontend/src/services/websocketService.ts`: connection-state listeners and monitor transformations.
- Modify `frontend/src/shared/hooks/useMockRealtime.ts`: live updates plus fallback handling.
- Modify `frontend/src/store/monitorStore.ts`: live connection/source state and data update actions.
- Modify `frontend/src/pages/monitor/MonitorPage.tsx`: demo controls.
- Modify `frontend/src/widgets/connection-panel/ConnectionPanel.tsx`: live backend connection display.

## Tasks

### Task 1: Backend Demo Engine Tests

- [ ] Create `tests/test_demo_engine.py` with tests for frame generation, event generation, `DataStore.store_event()`, and `DemoEngine.step_once()`.
- [ ] Run `python -m unittest tests.test_demo_engine -v` and verify it fails because `src.cloud_twin.demo_engine` and `store_event()` do not exist.

### Task 2: Backend Demo Engine Implementation

- [ ] Implement `src/cloud_twin/demo_engine.py`.
- [ ] Add `DataStore.store_event()` to `src/cloud_twin/data_store.py`.
- [ ] Run `python -m unittest tests.test_demo_engine -v` and verify all tests pass.

### Task 3: Demo API Endpoints

- [ ] Add `/api/v1/demo/start`, `/api/v1/demo/stop`, `/api/v1/demo/step`, and `/api/v1/demo/status` to `src/cloud_twin/api.py`.
- [ ] Run backend import smoke tests: `python -c "from src.cloud_twin.api import app; print('ok')"`.

### Task 4: Frontend Live Controls

- [ ] Add `frontend/src/services/demoApi.ts`.
- [ ] Extend `websocketService.ts` with connection-state subscriptions.
- [ ] Extend `monitorStore.ts` with live source state and update actions.
- [ ] Update `useMockRealtime()` to update monitor cards from real WebSocket payloads.
- [ ] Add start/stop/step/status controls to `MonitorPage.tsx`.
- [ ] Update `ConnectionPanel.tsx` to display Cloud API WebSocket state.

### Task 5: Verification

- [ ] Run `python -m unittest tests.test_demo_engine -v`.
- [ ] Run `npm run build` from `frontend`.
- [ ] Start backend and verify `GET /api/v1/demo/status`.
- [ ] Start demo and verify `GET /api/v1/messages/recent` and `GET /api/v1/events` return generated data.
