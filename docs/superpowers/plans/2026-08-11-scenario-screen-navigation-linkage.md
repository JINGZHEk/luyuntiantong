# 16-Scenario 3D Screen Navigation and Visual Linkage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the 16-scenario demo flow behave as one linked experience: starting a scenario from Monitor opens the 3D screen on that exact scenario, and the 3D screen can switch scenarios while keeping the backend demo, URL, description, and visual cues aligned.

**Architecture:** Add one frontend scenario catalog that preserves the backend scenario IDs and descriptions. Monitor uses the catalog for navigation. The 3D page reads and writes `scenario` and `loop` query parameters, restarts the existing demo API on selection changes, and passes a visual context into the existing data-driven Three.js scene. WebSocket payloads and dynamic object pooling remain the source of live object positions.

**Tech Stack:** React, React Router, TypeScript, Three.js, Vitest, existing FastAPI demo API and WebSocket service.

---

## Task 1: Create the shared scenario catalog

**Files:**
- Create `frontend/src/pages/zhiluwujie/scenarioCatalog.ts`
- Create `frontend/src/pages/zhiluwujie/scenarioCatalog.test.ts`
- Modify `frontend/src/types/realtime.ts`

1. Write a failing test covering all 16 IDs, exact user-facing descriptions, visual cue metadata, fallback lookup, and URL construction.
2. Run `npm run test:ui -- --run src/pages/zhiluwujie/scenarioCatalog.test.ts` and confirm it fails because the catalog does not exist.
3. Implement the catalog with the 16 backend IDs, names, descriptions, environment/visual context, and `buildZhiluWujieUrl(scenarioId, loop)`.
4. Add only the optional realtime type fields needed to carry scenario descriptions, layout/context, and object subtypes.
5. Re-run the focused test and the existing scenario/realtime tests.

## Task 2: Link Monitor start to the 3D screen

**Files:**
- Modify `frontend/src/pages/monitor/MonitorPage.tsx`
- Create `frontend/src/pages/monitor/MonitorPage.navigation.test.tsx`

1. Write a failing test that starts a selected scenario and expects navigation to `/zhiluwujie?scenario=<id>&loop=<value>` only after `demoApi.start` succeeds.
2. Run the focused test and confirm the navigation assertion fails.
3. Use the shared catalog in the Monitor selector, keep legacy compatibility options, and navigate after a successful start without changing existing stop/step behavior.
4. Re-run the focused Monitor test and the existing Monitor/demo API tests.

## Task 3: Add scenario-specific visual context to the 3D scene

**Files:**
- Modify `frontend/src/pages/zhiluwujie/scene.ts`
- Modify `frontend/src/pages/zhiluwujie/sceneVisuals.ts`
- Modify `frontend/src/pages/zhiluwujie/sceneObjectPool.ts`
- Modify related scene tests

1. Add failing tests for applying a scenario context: occluder cues, night/infrared cue, signal state, merge/turn lane cue, and object subtype propagation.
2. Implement a small scene-context group driven by catalog metadata. It must use restrained road geometry and existing materials, not replace the realistic scene or WebSocket object pool.
3. Make person/bicycle/vehicle model details respond to supported subtypes such as delivery rider, child, and e-bike.
4. Keep fallback rendering and live rendering behavior intact; switching a scenario must not clear or fabricate live payloads beyond the existing fallback rules.
5. Re-run focused scene tests and TypeScript/lint checks.

## Task 4: Add a linked scenario selector and description on the 3D screen

**Files:**
- Modify `frontend/src/pages/zhiluwujie/ZhiluWujiePage.tsx`
- Modify `frontend/src/pages/zhiluwujie/ZhiluWujiePage.module.css`
- Modify `frontend/src/pages/zhiluwujie/zhiluwujieRealtime.ui.test.tsx` or the existing page test file

1. Write a failing page test that loads a scenario query, renders its description, and changes the native selector to another scenario while calling `demoApi.start` and updating the query string.
2. Implement a restrained HUD selector centered in the existing 3D layout. It must show scenario ID, name, description, and a short visual cue without removing the current telemetry panels.
3. On selection, update the URL, update scene context immediately, and restart the same demo API with the current loop setting. Keep the current WebSocket and fallback behavior.
4. Preserve preview skin A/B/C overrides; when no explicit skin is supplied, derive the scene preset from the selected scenario.
5. Re-run page tests and inspect the page in the browser at the real routes.

## Task 5: End-to-end verification

1. Run `npm run test:ui -- --run` for the focused UI suite, `npm run lint`, `npm run build`, and `git diff --check`.
2. Open `http://127.0.0.1:3011/monitor`, select at least one GP, NM, and IC scenario, click `启动演示`, and verify the browser navigates to the matching 3D URL.
3. In the 3D screen, switch to another scenario and verify the URL, description, backend demo status, and visual cue change together.
4. Confirm the existing preview route still works with `skin=a`, `skin=b`, and `skin=c`, and that current live/fallback telemetry remains visible.
