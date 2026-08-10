# Night Intersection Visual Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the previously implemented dark night intersection presentation while retaining the current realtime WebSocket, fallback, 16-scenario, and dynamic-object behavior.

**Architecture:** Keep the existing `sceneRealtimeAdapter` and payload contracts as the data boundary. Centralize night palette and render defaults in `sceneVisuals.ts`, let `scene.ts` own static scene/lights/render-loop integration, and let `SceneObjectPool` own target state, display interpolation, finite prediction, TTL, and model lifecycle. The React page keeps its existing data panels and receives only restrained dark-theme token and refresh changes.

**Tech Stack:** React 18, TypeScript, Three.js 0.164, EffectComposer/UnrealBloomPass, Vitest, Vite.

---

## File map before implementation

- Modify `frontend/src/pages/zhiluwujie/sceneVisuals.ts`: night palette, material defaults, building/window/road/signal materials, and layered actor model details.
- Modify `frontend/src/pages/zhiluwujie/sceneCoordinates.ts`: map world velocity vectors into scene axes for finite display prediction.
- Modify `frontend/src/pages/zhiluwujie/sceneObjectPool.ts`: target/display state separation, frame-time interpolation, bounded prediction, and cleanup.
- Modify `frontend/src/pages/zhiluwujie/scene.ts`: night camera/lighting/background, render quality defaults, pool advancement, and night-colored static effects.
- Modify `frontend/src/pages/zhiluwujie/ZhiluWujiePage.module.css`: dark HUD tokens, panels, boot screen, scanlines, and contrast.
- Modify `frontend/src/pages/zhiluwujie/ZhiluWujiePage.tsx`: night mode accent tokens and deterministic throughput bars.
- Modify `frontend/src/pages/zhiluwujie/sceneVisuals.test.ts`: night palette and actor material assertions.
- Modify `frontend/src/pages/zhiluwujie/sceneObjectPool.test.ts`: interpolation, heading smoothing, bounded prediction, and lifecycle assertions.
- Modify `frontend/src/pages/zhiluwujie/sceneRealtimeAdapter.test.ts`: velocity-vector mapping regression coverage.

No new 3D asset, texture package, API endpoint, MQTT topic, WebSocket type, STGNN code, or backend file is required.

## Task 1: Lock the night-style and coordinate regressions with failing tests

**Files:**
- Modify: `frontend/src/pages/zhiluwujie/sceneVisuals.test.ts`
- Modify: `frontend/src/pages/zhiluwujie/sceneObjectPool.test.ts`
- Modify: `frontend/src/pages/zhiluwujie/sceneRealtimeAdapter.test.ts`

- [ ] **Step 1: Replace daylight style assertions with the approved night baseline.**

Update the existing style test to assert the values that the implementation will expose:

```ts
it('exports the approved restrained night scene style', () => {
  expect(DEFAULT_SCENE_STYLE.background).toBe(0x030712);
  expect(DEFAULT_SCENE_STYLE.bloomStrength).toBeCloseTo(0.16);
  expect(DEFAULT_SCENE_STYLE.scanlineOpacity).toBeCloseTo(0.018);
  expect(DEFAULT_SCENE_STYLE.palette.road).toBe(0x080c16);
  expect(DEFAULT_SCENE_STYLE.palette.ground).toBe(0x0d1721);
  expect(DEFAULT_SCENE_STYLE.palette.windowGlow).toBe(0xb09a72);
});
```

- [ ] **Step 2: Add a vector-mapping regression test.**

Extend the coordinate test with the road-axis mapping required by object prediction:

```ts
it('maps world velocity into the same scene axes as road points', () => {
  expect(mapRoadVector([3, 2], {
    originX: 0,
    originZ: 0,
    scale: 2,
    rotationDeg: 0,
  })).toEqual([4, 6]);
});
```

The import must include `mapRoadVector` from `./sceneCoordinates`.

- [ ] **Step 3: Add a failing object-pool interpolation test.**

Use the existing injected `createModel` test seam and assert that a second payload does not teleport the model:

```ts
it('moves toward a new target between payload frames', () => {
  const group = new THREE.Group();
  const pool = new SceneObjectPool({ group, predictionWindowMs: 0 });

  pool.upsert('node-1', {
    ...objectPayload('car'),
    world_pos: [0, 0],
  }, 1000);
  const model = group.children[0];

  pool.upsert('node-1', {
    ...objectPayload('car'),
    world_pos: [0, 10],
  }, 1100);
  pool.advance(0.05);

  expect(model.position.x).toBeGreaterThan(0);
  expect(model.position.x).toBeLessThan(10);

  pool.advance(1);
  expect(model.position.x).toBeCloseTo(10, 1);
});
```

- [ ] **Step 4: Add a failing bounded-prediction and cleanup test.**

Use a non-zero velocity and a large render delta to prove prediction is capped, then clear the pool and assert all display state is removed:

```ts
it('caps velocity prediction and clears display state with the target', () => {
  const group = new THREE.Group();
  const pool = new SceneObjectPool({ group, predictionWindowMs: 250 });

  pool.upsert('node-1', {
    ...objectPayload('car'),
    world_pos: [0, 0],
    velocity: [100, 0],
  }, 1000);
  const model = group.children[0];
  pool.advance(2);

  expect(model.position.z).toBeLessThanOrEqual(5);
  pool.clear();
  expect(pool.size).toBe(0);
  expect(group.children).toHaveLength(0);
});
```

- [ ] **Step 5: Run the focused tests and confirm the new expectations fail for the current daylight/jump implementation.**

Run from `E:\路云天瞳\luyuntiantong\frontend`:

```powershell
npm run test:ui -- src/pages/zhiluwujie/sceneVisuals.test.ts src/pages/zhiluwujie/sceneObjectPool.test.ts src/pages/zhiluwujie/sceneRealtimeAdapter.test.ts
```

Expected: the existing daylight color assertions and the new interpolation/vector assertions fail. Do not change production code in this task.

- [ ] **Step 6: Commit the regression tests.**

```powershell
git add frontend/src/pages/zhiluwujie/sceneVisuals.test.ts frontend/src/pages/zhiluwujie/sceneObjectPool.test.ts frontend/src/pages/zhiluwujie/sceneRealtimeAdapter.test.ts
git commit -m "test: define night scene and motion smoothing behavior"
```

## Task 2: Add road-vector mapping and smooth target/display state to the object pool

**Files:**
- Modify: `frontend/src/pages/zhiluwujie/sceneCoordinates.ts`
- Modify: `frontend/src/pages/zhiluwujie/sceneObjectPool.ts`
- Test: `frontend/src/pages/zhiluwujie/sceneObjectPool.test.ts`
- Test: `frontend/src/pages/zhiluwujie/sceneRealtimeAdapter.test.ts`

- [ ] **Step 1: Add `mapRoadVector` beside `mapRoadPoint`.**

The function must apply the same axis swap, scale, and rotation as points without applying the origin:

```ts
export function mapRoadVector(
  [worldX, worldY]: [number, number],
  config: SceneCoordinateConfig = DEFAULT_SCENE_COORDINATES,
): [number, number] {
  const x = worldY * config.scale;
  const z = worldX * config.scale;
  const angle = (config.rotationDeg * Math.PI) / 180;
  return [
    x * Math.cos(angle) - z * Math.sin(angle),
    x * Math.sin(angle) + z * Math.cos(angle),
  ];
}
```

- [ ] **Step 2: Add explicit pool motion options and display state.**

Extend `SceneObjectPoolOptions` with `smoothingRate?: number` and `predictionWindowMs?: number`. Use defaults of `12` and `250`. Add a private `displayStates` map keyed by the same `${nodeId}:${trackId}` key, storing `{ position: THREE.Vector3; heading: number }`.

- [ ] **Step 3: Store mapped velocity and initialize only new models immediately.**

In `upsert`, replace the raw `finitePair` assignment with `mapRoadVector(finitePair(object.velocity), this.coordinateConfig)`. Keep `PooledObjectState.position` and `velocity` as the latest data target. For a newly created model, initialize its display state and transform immediately. For an existing model, update metadata and opacity but do not overwrite its current transform.

The model factory, key format, object classification, confidence, occlusion level, predicted trajectory, and snapshot shape must remain unchanged.

- [ ] **Step 4: Add `advance(deltaSeconds: number)` with bounded prediction and shortest-path heading interpolation.**

Use this exact behavior:

```ts
advance(deltaSeconds: number): void {
  const dt = Math.max(0, Math.min(deltaSeconds, 1));
  const blend = 1 - Math.exp(-this.smoothingRate * dt);
  const predictionSeconds = Math.min(this.predictionWindowMs / 1000, dt);

  for (const [key, state] of this.states) {
    const model = this.models.get(key);
    const display = this.displayStates.get(key);
    if (!model || !display) continue;

    const targetX = state.position.x + state.velocity[0] * predictionSeconds;
    const targetZ = state.position.z + state.velocity[1] * predictionSeconds;
    display.position.x += (targetX - display.position.x) * blend;
    display.position.y = state.position.y;
    display.position.z += (targetZ - display.position.z) * blend;

    const headingDelta = Math.atan2(
      Math.sin(state.heading - display.heading),
      Math.cos(state.heading - display.heading),
    );
    display.heading += headingDelta * blend;
    model.position.copy(display.position);
    model.rotation.y = display.heading;
  }
}
```

Clamp the prediction to the configured 250 ms window and never advance a removed target.

- [ ] **Step 5: Remove display state when models expire, change class, or clear.**

Update `remove`, the class-change branch in `upsert`, and `clear` so that `displayStates.delete(key)` happens with model disposal. Keep the existing geometry/material disposal behavior.

- [ ] **Step 6: Run the focused tests and confirm all pool/coordinate tests pass.**

```powershell
npm run test:ui -- src/pages/zhiluwujie/sceneObjectPool.test.ts src/pages/zhiluwujie/sceneRealtimeAdapter.test.ts
```

Expected: PASS, including the target interpolation, bounded prediction, TTL, class replacement, and coordinate mapping tests.

- [ ] **Step 7: Commit the data-display motion layer.**

```powershell
git add frontend/src/pages/zhiluwujie/sceneCoordinates.ts frontend/src/pages/zhiluwujie/sceneObjectPool.ts frontend/src/pages/zhiluwujie/sceneObjectPool.test.ts frontend/src/pages/zhiluwujie/sceneRealtimeAdapter.test.ts
git commit -m "feat: smooth realtime scene object motion"
```

## Task 3: Restore the night palette and improve procedural actor materials

**Files:**
- Modify: `frontend/src/pages/zhiluwujie/sceneVisuals.ts`
- Test: `frontend/src/pages/zhiluwujie/sceneVisuals.test.ts`

- [ ] **Step 1: Replace daylight constants with one exported semantic night style.**

Use this shape so `scene.ts` can consume the same palette without duplicating colors:

```ts
export const DEFAULT_SCENE_STYLE = {
  background: 0x030712,
  bloomStrength: 0.16,
  scanlineOpacity: 0.018,
  fogNear: 120,
  fogFar: 320,
  toneMappingExposure: 1.05,
  maxPixelRatio: 1.5,
  shadowMapSize: 1024,
  palette: {
    ground: 0x0d1721,
    road: 0x080c16,
    curb: 0x24303a,
    sidewalk: 0x111d28,
    marking: 0xb9b4a3,
    yellowMarking: 0x8b7545,
    building: 0x0d151d,
    window: 0x6e624d,
    windowGlow: 0xb09a72,
    treeTrunk: 0x211b18,
    treeCanopy: 0x13251f,
    metal: 0x334351,
    glass: 0x273c4e,
    person: 0x607789,
    bicycle: 0x4e8f83,
    vehicle: 0x3c5669,
    generic: 0x657080,
    cyan: 0x72cbd0,
    blue: 0x6e86ad,
    red: 0xd56f72,
    green: 0x76a889,
    orange: 0xb4975f,
  },
} as const;
```

Update `COLORS` to reference this palette instead of retaining a second daylight palette.

- [ ] **Step 2: Update materials without changing semantic object names.**

Keep all names already asserted by tests (`vehicle-body`, `vehicle-windows`, wheel names, person limbs, bicycle frame, and generic label anchor). Set vehicle body materials to roughness `0.68` and metalness `0.18`, window materials to dark blue glass with a small `windowGlow` emissive value, and head/tail lights to low-intensity emissive materials. Do not use a large emissive value on the whole vehicle body.

- [ ] **Step 3: Add restrained actor detail.**

Add front/rear bumper strips and side-window geometry to the existing car factory, preserve the current truck and bus scale differences, and keep the existing person/bicycle hierarchy. All new geometry must be created once per model and disposed through the existing pool lifecycle.

- [ ] **Step 4: Set the night signal/material limits.**

Active signal lamps may use `emissiveIntensity: 0.45`; inactive lamps must stay at `0.03`. Risk overlays and coverage surfaces remain transparent and use the palette’s red/cyan values rather than full-screen saturated neon.

- [ ] **Step 5: Update visual tests for the night materials and run them.**

Add assertions that the road material uses `DEFAULT_SCENE_STYLE.palette.road`, a window material has a non-zero but bounded emissive value, and the existing actor semantic names and truck/bus proportions remain present.

```powershell
npm run test:ui -- src/pages/zhiluwujie/sceneVisuals.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the palette and actor material layer.**

```powershell
git add frontend/src/pages/zhiluwujie/sceneVisuals.ts frontend/src/pages/zhiluwujie/sceneVisuals.test.ts
git commit -m "feat: restore night traffic scene materials"
```

## Task 4: Restore the night scene, lighting, static traffic, and render defaults

**Files:**
- Modify: `frontend/src/pages/zhiluwujie/scene.ts`
- Test: `frontend/src/pages/zhiluwujie/sceneVisuals.test.ts`

- [ ] **Step 1: Consume `DEFAULT_SCENE_STYLE` in renderer initialization.**

Replace the daylight values in `init` with:

```ts
this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, DEFAULT_SCENE_STYLE.maxPixelRatio));
this.renderer.toneMappingExposure = DEFAULT_SCENE_STYLE.toneMappingExposure;
this.scene.background = new THREE.Color(DEFAULT_SCENE_STYLE.background);
this.scene.fog = new THREE.Fog(
  DEFAULT_SCENE_STYLE.background,
  DEFAULT_SCENE_STYLE.fogNear,
  DEFAULT_SCENE_STYLE.fogFar,
);
```

Keep antialiasing, ACES tone mapping, EffectComposer, and OrbitControls enabled.

- [ ] **Step 2: Replace daylight lights with a cool night rig.**

Use a low-intensity cool hemisphere fill, a low-intensity blue-gray ambient light, and one warm-gray directional moon light. The directional light remains the only shadow caster and uses `DEFAULT_SCENE_STYLE.shadowMapSize` instead of a hard-coded `2048`:

```ts
this.scene.add(new THREE.HemisphereLight(0x49617a, 0x02050a, 0.62));
this.scene.add(new THREE.AmbientLight(0x26384d, 0.28));
const dir = new THREE.DirectionalLight(0xa5b0bd, 1.15);
dir.position.set(55, 105, 35);
dir.castShadow = true;
dir.shadow.mapSize.set(DEFAULT_SCENE_STYLE.shadowMapSize, DEFAULT_SCENE_STYLE.shadowMapSize);
```

Keep the existing shadow camera bounds so the road intersection remains covered.

- [ ] **Step 3: Apply the semantic palette to ground and streetscape.**

In `buildGround`, use `DEFAULT_SCENE_STYLE.palette.ground` for the large receiving plane. Ensure the intersection layout uses the palette road, sidewalk, curb, markings, and yellow lane colors through `sceneVisuals.ts`. Rename the static streetscape group from `daylight-streetscape` to `night-streetscape` and preserve its two buildings and two trees.

- [ ] **Step 4: Rebalance static effects for the screenshot composition.**

Use the night cyan/blue/red values for RSU rings, V2X lines, risk planes, and trajectories. Reduce particle count to the existing 24-object budget, use dark blue-gray particles with opacity no greater than `0.12`, and keep trajectories hidden unless `shouldShowTrajectory` enables them. The road, crosswalk, signals, and event target must remain visually dominant.

- [ ] **Step 5: Advance realtime pool state before rendering.**

In `start`, after `updateTrafficLights` and before `composer.render()`, call:

```ts
this.realtimePool?.advance(delta);
```

Do not call `advance` from the React UI tick. Keep WebSocket handlers as data ingestion only and preserve the existing `setDataMode` behavior that hides fallback actors in live mode and clears live objects in fallback mode.

- [ ] **Step 6: Run scene and adapter tests.**

```powershell
npm run test:ui -- src/pages/zhiluwujie/sceneVisuals.test.ts src/pages/zhiluwujie/sceneObjectPool.test.ts src/pages/zhiluwujie/sceneRealtimeAdapter.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the night scene and render integration.**

```powershell
git add frontend/src/pages/zhiluwujie/scene.ts frontend/src/pages/zhiluwujie/sceneVisuals.test.ts
git commit -m "feat: restore night intersection rendering"
```

## Task 5: Restore the dark HUD and remove avoidable UI animation noise

**Files:**
- Modify: `frontend/src/pages/zhiluwujie/ZhiluWujiePage.module.css`
- Modify: `frontend/src/pages/zhiluwujie/ZhiluWujiePage.tsx`
- Test: `frontend/tests/zhiluwujieRealtime.ui.test.tsx`

- [ ] **Step 1: Replace daylight CSS tokens with the approved dark HUD tokens.**

Update the `.root` token block to:

```css
.root {
  --bg-dark: #030712;
  --neon-cyan: #72cbd0;
  --neon-blue: #6e86ad;
  --neon-green: #76a889;
  --neon-orange: #b4975f;
  --neon-red: #d56f72;
  --neon-purple: #7d6c91;
  --hud-text: #e7edf2;
  --hud-muted: #9daab5;
  --hud-subtle: #687989;
  background: var(--bg-dark);
}
```

Update `.panel`, `.scanlines`, `.bootScreen`, `.bootTitle`, and `.cyberBtn` so panels use `rgba(3, 11, 25, 0.76)`, borders use low-opacity blue-gray/cyan, and scanlines use a transparent dark-blue stripe. Keep panel placement, labels, buttons, and pointer behavior unchanged.

- [ ] **Step 2: Align React mode colors with the same palette.**

Change `MODE_COLORS` in `ZhiluWujiePage.tsx` to use the night accents:

```ts
const MODE_COLORS = {
  ego: { accent: '#72cbd0', rgb: '114, 203, 208' },
  traffic: { accent: '#76a889', rgb: '118, 168, 137' },
  v2i: { accent: '#6e86ad', rgb: '110, 134, 173' },
  algo: { accent: '#b4975f', rgb: '180, 151, 95' },
} satisfies Record<Mode, { accent: string; rgb: string }>;
```

- [ ] **Step 3: Make throughput bars deterministic.**

Replace the current per-tick `Math.random()` array assignment with a rolling sample from scene traffic data:

```ts
const history = sc.trafficMetrics.flowHistory;
const flowSample = history.length > 0 ? history[history.length - 1] : sc.metrics.fps;
setThroughputBars(prev => [
  ...prev.slice(1),
  Math.max(20, Math.min(100, 20 + flowSample * 2)),
]);
```

Keep the existing 100 ms HUD refresh cadence and all visible metric fields; only remove the unrelated random redraw noise.

- [ ] **Step 4: Run the realtime page test.**

```powershell
npm run test:ui -- tests/zhiluwujieRealtime.ui.test.tsx
```

Expected: PASS with `LIVE` changing to `FALLBACK` after the existing timeout and the scenario/run identifiers still visible.

- [ ] **Step 5: Commit the HUD restoration.**

```powershell
git add frontend/src/pages/zhiluwujie/ZhiluWujiePage.module.css frontend/src/pages/zhiluwujie/ZhiluWujiePage.tsx frontend/tests/zhiluwujieRealtime.ui.test.tsx
git commit -m "feat: restore dark night dashboard hud"
```

## Task 6: Run the complete automated verification suite

**Files:**
- Verify: `frontend/src/pages/zhiluwujie/sceneVisuals.test.ts`
- Verify: `frontend/src/pages/zhiluwujie/sceneObjectPool.test.ts`
- Verify: `frontend/src/pages/zhiluwujie/sceneRealtimeAdapter.test.ts`
- Verify: `frontend/tests/zhiluwujieRealtime.ui.test.tsx`

- [ ] **Step 1: Run all UI/unit tests.**

```powershell
npm run test:ui
```

Expected: Vitest exits with code 0 and no new failing test file.

- [ ] **Step 2: Run the TypeScript/Vite production build.**

```powershell
npm run build
```

Expected: `tsc` and `vite build` both complete successfully.

- [ ] **Step 3: Run lint.**

```powershell
npm run lint
```

Expected: ESLint exits with code 0 and no unused imports or hook warnings are introduced.

- [ ] **Step 4: Commit only if the verification suite is clean.**

```powershell
git status --short
git log -5 --oneline
```

Expected: only the intended night-scene files are modified and the latest commits correspond to the tasks above.

## Task 7: Browser acceptance against live and fallback data

**Files:**
- Verify: `http://127.0.0.1:3011/zhiluwujie`
- Verify: existing backend/WebSocket demo services

- [ ] **Step 1: Start the existing demo services without changing their configuration.**

Use the project’s existing startup flow and confirm the backend health endpoint responds before opening the page. Do not modify MQTT, WebSocket, or mock payload formats for this visual task.

- [ ] **Step 2: Verify the default composition.**

Confirm the first entered frame shows a dark blue-black sky, black-blue road, warm window lights, gold lane markings, readable white crosswalks, restrained panels, and the central intersection unobstructed. The screenshot target is the comparison reference.

- [ ] **Step 3: Verify dynamic target rendering across the 16 scenarios.**

Select and run the existing scenarios. Confirm that the number and classes of dynamic targets match the perception payload, risk overlays appear only for active risk targets, and target movement remains continuous between payload frames.

- [ ] **Step 4: Verify live/fallback switching.**

With WebSocket data flowing, confirm the HUD says `LIVE` and the realtime object pool is visible. Stop or disconnect the data stream, confirm the HUD says `FALLBACK`, confirm the fallback scene remains visible, and confirm no duplicate realtime/fallback actors remain.

- [ ] **Step 5: Verify interaction and performance.**

Test OrbitControls, the four mode buttons, the Bloom slider, scene selection, and the existing event/log panels. At 1920×1080, run for five minutes and confirm there is no white flash, black canvas, obvious actor jitter, accumulation of expired actors, or new browser-console error.

- [ ] **Step 6: Record the handoff result.**

Capture one night-mode screenshot and note the browser URL, selected scenario, data mode, and whether the automated suite/build/lint passed. This is the final verification evidence for the visual restoration.

## Plan self-review

- Spec coverage: night palette, composition, actors, realtime boundary, fallback, bounded smoothing, rendering performance, HUD, errors, tests, and browser acceptance are covered by Tasks 1–7.
- Placeholder scan: no unfinished-marker text, vague “appropriate handling”, or unassigned implementation step is used.
- Type consistency: `mapRoadVector`, `predictionWindowMs`, `smoothingRate`, `advance(deltaSeconds)`, `DEFAULT_SCENE_STYLE.palette`, and all referenced test paths are defined in the tasks before consumption.
- Scope: all changes stay within the existing `zhiluwujie` visual/data-display boundary; backend and protocol work is explicitly excluded.
