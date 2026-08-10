# 半写实交通路口场景 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/zhiluwujie` 的 Three.js 视觉从霓虹赛博背景改为参考图风格的白天半写实交通路口，同时保持实时数据、16 个场景和现有 HUD 业务不变。

**Architecture:** 新增一组纯 Three.js 视觉工厂，集中生成道路、标线、建筑、树木、信号灯和可辨识交通参与者；`ZhiluWujieScene` 只负责生命周期、场景装配、相机和实时状态更新。`SceneObjectPool` 继续管理实时对象，但通过已有的 `createModel` 注入点使用半写实对象工厂，不改变对象池的数据接口。

**Tech Stack:** React + TypeScript, Three.js, `MeshStandardMaterial`, `DirectionalLight`/阴影, Vitest, Vite。

---

### Task 1: 建立半写实视觉工厂和几何单元

**Files:**
- Create: `frontend/src/pages/zhiluwujie/sceneVisuals.ts`
- Test: `frontend/src/pages/zhiluwujie/sceneVisuals.test.ts`

- [ ] **Step 1: 写视觉工厂的失败测试**

创建纯 Node/Vitest 可运行的工厂测试，验证输出是可复用的 Three.js 组，而不是依赖 WebGL renderer：

```ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createBuilding,
  createIntersectionLayout,
  createRealtimeActorModel,
  createTree,
  createTrafficSignal,
} from './sceneVisuals';

describe('semi-realistic scene visuals', () => {
  it('creates a road layout with road, sidewalks, markings and crosswalks', () => {
    const layout = createIntersectionLayout();
    expect(layout.getObjectByName('road-surface')).toBeTruthy();
    expect(layout.getObjectByName('sidewalk-north')).toBeTruthy();
    expect(layout.getObjectByName('lane-markings')).toBeTruthy();
    expect(layout.getObjectByName('crosswalk-north')).toBeTruthy();
  });

  it('creates recognizable actor geometry by class', () => {
    const car = createRealtimeActorModel({ class: 'car', modelType: 'vehicle' } as never);
    const person = createRealtimeActorModel({ class: 'person', modelType: 'person' } as never);
    const bicycle = createRealtimeActorModel({ class: 'bicycle', modelType: 'bicycle' } as never);
    expect(car.getObjectByName('vehicle-body')).toBeTruthy();
    expect(person.getObjectByName('person-head')).toBeTruthy();
    expect(bicycle.getObjectByName('bicycle-wheel-front')).toBeTruthy();
  });

  it('builds daylight facilities with semantic names', () => {
    expect(createBuilding(12, 18, 14).name).toBe('building');
    expect(createTree().name).toBe('street-tree');
    expect(createTrafficSignal('green').name).toBe('traffic-signal');
  });
});
```

- [ ] **Step 2: 运行测试确认当前工厂不存在**

Run from `frontend`:

```powershell
npx vitest run src/pages/zhiluwujie/sceneVisuals.test.ts --pool=threads --no-file-parallelism --maxWorkers=1
```

Expected: FAIL because `sceneVisuals.ts` and the named factories do not exist yet。

- [ ] **Step 3: 实现最小视觉工厂**

在 `sceneVisuals.ts` 实现以下导出和固定语义名称：

```ts
export interface ActorVisualState {
  class: string;
  modelType: 'person' | 'bicycle' | 'vehicle' | 'generic';
}

export function createIntersectionLayout(): THREE.Group;
export function createBuilding(width: number, height: number, depth: number): THREE.Group;
export function createTree(): THREE.Group;
export function createTrafficSignal(active: 'red' | 'yellow' | 'green'): THREE.Group;
export function createRealtimeActorModel(state: ActorVisualState): THREE.Group;
```

实现约束：道路组包含两条相交的深灰 `PlaneGeometry`、浅灰人行道和路缘；标线用白/黄 `MeshBasicMaterial` 的窄平面；建筑是带窗格的灰色 `BoxGeometry`；树木是圆柱树干加低面数球冠；信号灯是黑色杆件、灯箱和三个低强度发光灯；车辆由车身、车窗、四个轮子和前后灯组成；行人由头、躯干和四肢组成；自行车由两个轮子、车架和骑手组成。每个工厂返回的根组和关键子网格都使用测试中的语义名称。

- [ ] **Step 4: 运行测试确认工厂通过**

Run the same Vitest command。Expected: 3 tests PASS。

- [ ] **Step 5: 提交视觉工厂**

```powershell
git add frontend/src/pages/zhiluwujie/sceneVisuals.ts frontend/src/pages/zhiluwujie/sceneVisuals.test.ts
git commit -m "feat: add semi-realistic traffic scene primitives"
```

### Task 2: 用半写实道路和设施替换基础场景

**Files:**
- Modify: `frontend/src/pages/zhiluwujie/scene.ts:90-285`
- Test: `frontend/src/pages/zhiluwujie/sceneVisuals.test.ts`

- [ ] **Step 1: 写场景装配约束测试**

在视觉工厂测试中增加一个组合测试，确认默认布局包含至少 4 个交通信号灯、4 个斑马线组和 4 个建筑/街景占位组：

```ts
it('provides a complete intersection baseline for the scene manager', () => {
  const layout = createIntersectionLayout();
  expect(layout.getObjectByName('traffic-signals')?.children.length).toBe(4);
  expect(layout.getObjectByName('crosswalks')?.children.length).toBe(4);
  expect(layout.getObjectByName('streetscape')?.children.length).toBeGreaterThanOrEqual(4);
});
```

- [ ] **Step 2: 运行测试确认组合约束失败**

Run the focused Vitest command。Expected: the new test FAIL until the layout factory includes all four groups。

- [ ] **Step 3: 修改 `scene.ts` 的初始化和 `buildGround`**

导入 `createIntersectionLayout`, `createBuilding`, `createTree`, `createTrafficSignal`，将 `buildGround()` 的 `GridHelper`、青色道路边缘线和紫色覆盖面替换为：

```ts
this.scene.background = new THREE.Color(0xc8d0cc);
this.scene.fog = new THREE.Fog(0xc8d0cc, 140, 360);
this.renderer.shadowMap.enabled = true;
this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
this.scene.add(createIntersectionLayout());
```

使用一盏暖白 `HemisphereLight`、一盏带阴影的 `DirectionalLight` 和少量环境补光；`UnrealBloomPass` 强度设置为 `0.05`，阈值设置为 `0.9`，保留后处理管线但不再让 Bloom 主导画面。道路默认材质颜色为 `0x252a2b`，人行道为 `0xb8beb8`，标线为 `0xf4f0dc`/`0xd5b35a`。

- [ ] **Step 4: 替换建筑、交通灯、RSU 和覆盖区域的视觉表现**

将 `buildBuildings()` 改为调用 `createBuilding` 和 `createTree` 组成四个路口街区；将 `buildTrafficLights()` 改为装配四组 `createTrafficSignal()`，状态仍由 `getTrafficSignalData()` 计算；将 RSU 的强发光圆环/锥体改为杆顶设备、浅色覆盖圆和低透明度边界；将 `buildCoverage()` 的紫色覆盖面替换为淡灰蓝半透明区域，只在 `v2i` 模式下显示。

- [ ] **Step 5: 运行类型检查和视觉工厂测试**

```powershell
npx vitest run src/pages/zhiluwujie/sceneVisuals.test.ts --pool=threads --no-file-parallelism --maxWorkers=1
npx tsc --noEmit
```

Expected: all focused tests PASS and TypeScript exits with code 0。

- [ ] **Step 6: 提交基础道路场景**

```powershell
git add frontend/src/pages/zhiluwujie/scene.ts frontend/src/pages/zhiluwujie/sceneVisuals.test.ts
git commit -m "feat: build daylight intersection scene"
```

### Task 3: 替换静态车辆、行人和实时对象模型

**Files:**
- Modify: `frontend/src/pages/zhiluwujie/scene.ts:280-470`
- Modify: `frontend/src/pages/zhiluwujie/sceneObjectPool.ts:20-160`
- Test: `frontend/src/pages/zhiluwujie/sceneVisuals.test.ts`

- [ ] **Step 1: 写实时对象工厂接入测试**

在 `sceneVisuals.test.ts` 验证 `createRealtimeActorModel` 能处理现有分类和未知分类，并且不产生发光材质：

```ts
it('keeps realtime actor materials physically readable', () => {
  const model = createRealtimeActorModel({ class: 'truck', modelType: 'vehicle' } as never);
  const materials: THREE.Material[] = [];
  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.material && !Array.isArray(mesh.material)) materials.push(mesh.material);
  });
  expect(materials.some((material) => 'emissiveIntensity' in material && (material as THREE.MeshStandardMaterial).emissiveIntensity > 0.3)).toBe(false);
});
```

- [ ] **Step 2: 运行测试确认约束未满足**

Run the focused Vitest command。Expected: FAIL if the current generic model remains the default implementation。

- [ ] **Step 3: 将视觉工厂注入实时对象池**

在 `scene.ts` 创建 `SceneObjectPool` 时传入：

```ts
this.realtimePool = new SceneObjectPool({
  group: this.realtimeObjectsGroup,
  coordinateConfig: DEFAULT_SCENE_COORDINATES,
  ttlMs: 1000,
  createModel: (state) => createRealtimeActorModel(state),
});
```

保留 `SceneObjectPool` 的 `upsert`, `tick`, `clear`, `snapshot` 行为不变；只在类型层把 `createModel` 的输入限制收敛为视觉工厂需要的 `{ class, modelType }` 字段，避免实时协议扩展。

- [ ] **Step 4: 替换静态自车、遮挡车和 fallback 交通车**

`buildVehicles()` 使用同一组视觉工厂：自车使用轿车外观并保留小型感知顶盖；遮挡物根据 `truck`/`bus` 选择货车或公交外观；fallback 车流使用轿车、货车和公交的混合排列。危险状态只通过车底小范围地面标识、目标轮廓和 HUD 风险色表达，不恢复整车发光线框。

`buildPedestrian()` 使用 `createRealtimeActorModel({ class: 'person', modelType: 'person' })` 的外观作为 fallback 行人，并保留原有 `pedWarn` 地面提示。

- [ ] **Step 5: 运行实时适配器和前端测试**

```powershell
npx vitest run src/pages/zhiluwujie/sceneRealtimeAdapter.test.ts src/pages/zhiluwujie/sceneVisuals.test.ts --pool=threads --no-file-parallelism --maxWorkers=1
npx tsc --noEmit
```

Expected: all tests PASS and no TypeScript errors。

- [ ] **Step 6: 提交交通参与者模型**

```powershell
git add frontend/src/pages/zhiluwujie/scene.ts frontend/src/pages/zhiluwujie/sceneObjectPool.ts frontend/src/pages/zhiluwujie/sceneVisuals.ts frontend/src/pages/zhiluwujie/sceneVisuals.test.ts
git commit -m "feat: render readable traffic actors"
```

### Task 4: 收敛镜头、动态效果和 HUD 风格

**Files:**
- Modify: `frontend/src/pages/zhiluwujie/scene.ts:180-250, 580-780`
- Modify: `frontend/src/pages/zhiluwujie/ZhiluWujiePage.module.css:1-220, 250-1116`
- Test: `frontend/src/pages/zhiluwujie/sceneVisuals.test.ts`

- [ ] **Step 1: 写视觉默认值回归测试**

在纯配置导出中锁定默认风格，避免后续又回到霓虹默认值：

```ts
import { DEFAULT_SCENE_STYLE } from './sceneVisuals';

it('uses daylight as the default visual style', () => {
  expect(DEFAULT_SCENE_STYLE.background).toBe(0xc8d0cc);
  expect(DEFAULT_SCENE_STYLE.bloomStrength).toBeLessThanOrEqual(0.1);
  expect(DEFAULT_SCENE_STYLE.scanlineOpacity).toBeLessThanOrEqual(0.05);
});
```

- [ ] **Step 2: 实现默认镜头和材质配置**

在 `sceneVisuals.ts` 导出 `DEFAULT_SCENE_STYLE`，在 `init()` 中使用 `camera.position.set(82, 72, 86)`、`controls.target.set(0, 0, 0)`、`controls.maxPolarAngle = Math.PI / 2 - 0.15`，并将 `bloomStrength` 默认值改为 `0.05`。保留 `setMode()` 的四种模式，只将相机目标改为冲突点和路口设施。

- [ ] **Step 3: 运行时降低粒子、光束和轨迹装饰**

`buildParticles()` 改为极少量尘埃/环境点并使用低透明度灰白色；`buildTrajectories()` 只在 `traffic` 或 `algo` 模式显示，使用细的半透明黄/蓝线；`buildCoverage()` 只在 `v2i` 模式显示。移除默认的紫色光束和大面积透明扫描带，但不移除需要表达协同感知的细线/地面标记。

- [ ] **Step 4: 修改 HUD CSS**

将 `.panel` 的背景从 `rgba(3, 11, 25, 0.75)` 调整为 `rgba(30, 35, 34, 0.58)`，边框改为低对比度白灰色，阴影改为柔和黑色；将 `.scanlines` opacity 调整为 `0.03`；将默认 HUD 主色设为 `#dfe8e3`，状态青绿设为 `#39c7ad`，风险色保留黄/橙/红；减少标题字间距和发光阴影，让道路成为视觉主体。

- [ ] **Step 5: 运行前端构建**

```powershell
npm run build
```

Expected: TypeScript 检查和 Vite 构建均通过，输出 `dist/` 产物。

- [ ] **Step 6: 提交镜头和 HUD 收敛**

```powershell
git add frontend/src/pages/zhiluwujie/scene.ts frontend/src/pages/zhiluwujie/ZhiluWujiePage.module.css frontend/src/pages/zhiluwujie/sceneVisuals.ts frontend/src/pages/zhiluwujie/sceneVisuals.test.ts
git commit -m "feat: tune daylight scene camera and hud"
```

### Task 5: 启动演示并进行浏览器视觉验收

**Files:**
- Verify: `frontend/src/pages/zhiluwujie/scene.ts`
- Verify: `frontend/src/pages/zhiluwujie/sceneRealtimeAdapter.ts`
- Verify: `src/cloud_twin/api.py`
- Verify: `data/v2x_cloud.db`

- [ ] **Step 1: 启动后端和前端预览**

使用当前已验证的端口：Cloud API `8011`、Vite `3011`，将前端 Cloud API 配置设置为 `http://localhost:8011/api/v1`。

- [ ] **Step 2: 验证场景目录和实时链路**

```powershell
curl.exe -sS http://127.0.0.1:8011/api/v1/health
curl.exe -sS http://127.0.0.1:8011/api/v1/scenarios
curl.exe -sS -X POST "http://127.0.0.1:8011/api/v1/demo/start?scenario_id=GP-01&fps=10&loop=true"
```

Expected: health `status=ok`，场景目录 `total=16`，启动返回 `running=true` 和 `run_id`。

- [ ] **Step 3: 浏览器验收默认路口**

打开 `http://127.0.0.1:3011/zhiluwujie`，进入大屏后确认：默认画面是浅灰天空和日间道路；能看到四向路口、车道线、斑马线、建筑、树木和交通灯；HUD 不遮挡冲突点。

- [ ] **Step 4: 验收三个代表性场景**

依次从 `http://127.0.0.1:3011/monitor` 启动 `GP-01`、`NM-01`、`IC-01`，在大屏观察公交/货车遮挡、电动车横穿和路口车辆冲突。验证标准是对象数量、位置、航向和 `LIVE / TARGETS` 状态随 WebSocket 数据变化。

- [ ] **Step 5: 截图复核并清理无关装饰**

使用浏览器截图对照参考图，若道路不够突出，优先调节材质、光照、相机和 HUD 透明度；不通过增加霓虹、粒子或大面积光束解决视觉问题。

- [ ] **Step 6: 提交验收记录**

```powershell
git status --short
git log -5 --oneline
```

Expected: 工作树干净，最近提交包含视觉工厂、日间道路、交通参与者和 HUD/镜头四类改动。
