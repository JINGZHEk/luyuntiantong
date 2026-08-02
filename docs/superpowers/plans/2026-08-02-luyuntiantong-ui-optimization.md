# 路云天瞳 UI 优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 React + Ant Design + Three.js 前端收敛为可读、可操作、可演示的 V2X 实时感知控制台，并完成任务书中的 UI、交互、主题和验证要求。

**Architecture:** 保留现有路由、Zustand store、服务层和 Three.js 组件边界；用 token + CSS 变量统一颜色/排版/间距，用 CSS Modules 承载核心组件状态样式，用 `PageHeader` 统一业务页面结构。先建立视觉基础，再改应用壳层、核心数据组件、页面组合和 3D 场景，最后补状态反馈与自动化验证。

**Tech Stack:** React 18, TypeScript, Vite, Ant Design 5, Zustand, ECharts, React Three Fiber, `@react-three/postprocessing`, Vitest, Testing Library。

---

## 文件地图

| 文件 | 责任 | 计划动作 |
| --- | --- | --- |
| `frontend/src/constants/design-tokens.ts` | 尺寸/排版/动效 token | 补齐语义与 CSS 变量映射 |
| `frontend/src/constants/colors.ts` | 颜色和主题映射 | 统一渐变、状态色和 light/dark 值 |
| `frontend/src/app/styles/global.css` | 全局 reset、变量、Ant 覆盖、动效 | 重构主题选择器、响应式、焦点和 reduced-motion |
| `frontend/src/app/styles/theme.ts` | Ant Design token | 与平台 token 对齐 |
| `frontend/src/app/layout/MainLayout.tsx` | 应用壳层 | 统一侧边栏、顶部状态栏、主题入口、响应式 |
| `frontend/src/shared/components/PageHeader.tsx` | 页面标题区 | 支持所有业务页并去除动态 inline 样式 |
| `frontend/src/shared/components/*.module.css` | 共享组件样式 | 建立状态、焦点、响应式样式边界 |
| `frontend/src/widgets/kpi-bar/KpiBar.tsx` | KPI 指标带 | sparkline、趋势百分比、语义色和无障碍标签 |
| `frontend/src/widgets/risk-list/RiskList.tsx` | 实时风险列表 | CSS hover、critical 状态、键盘操作 |
| `frontend/src/widgets/log-stream/LogStream.tsx` | 实时日志 | 终端布局、过滤、自动滚动和无 `any` |
| `frontend/src/entities/charts/*` | ECharts 包装器 | 主题、tooltip、渐变和稳定 option |
| `frontend/src/features/three-scene/*` | 3D 场景 | 路网、车辆传感器、交通灯、粒子、Bloom、镜头 |
| `frontend/src/pages/*` | 五个业务页面 + 演示页 | 统一头部、栅格、空/错/加载状态 |
| `frontend/src/store/*` | 状态和数据选择器 | 修复连接动作，减少无关重渲染 |
| `frontend/tests/*` | 组件/服务验证 | 增加核心组件行为测试 |

## Task 1: 建立统一主题基础

**Files:**
- Modify: `frontend/src/constants/design-tokens.ts`
- Modify: `frontend/src/constants/colors.ts`
- Modify: `frontend/src/app/styles/global.css`
- Modify: `frontend/src/app/styles/theme.ts`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/index.html`

- [ ] **Step 1: 统一 token 命名和主题变量**

在 `design-tokens.ts` 保留现有导出名，并新增可直接用于 CSS 的语义键：

```ts
export const CSS_VAR = {
  bg: '--color-bg',
  surface: '--color-surface',
  surfaceRaised: '--color-surface-raised',
  border: '--color-border',
  accent: '--color-accent',
  success: '--color-success',
  warning: '--color-warning',
  danger: '--color-danger',
  text: '--color-text',
  textSecondary: '--color-text-secondary',
} as const;
```

在 `colors.ts` 中确保 `THEME_COLORS.dark` 和 `THEME_COLORS.light` 都包含 `bg`、`cardBg`、`cardBorder`、`headerBg`、`siderBg`、`text`、`textSecondary`、`accent`、`success`、`warning`、`danger`，并以 `SEMANTIC_COLORS` 作为风险/连接状态的唯一来源。

- [ ] **Step 2: 让主题属性作用于根节点**

将 `App.tsx` 的主题容器改为：

```tsx
<div className="app-shell" data-theme={theme}>
  <RealtimeProvider>
    <RouterProvider router={router} />
  </RealtimeProvider>
</div>
```

在 `global.css` 中以 `[data-theme='dark']` 与 `[data-theme='light']` 写变量，避免 `.light-theme body` 因 body 不在该节点内而失效。为 body、Ant Layout、Card、Input、Select、Table、Button、Modal、Dropdown、Tooltip 添加变量覆盖。

- [ ] **Step 3: 补齐全局基础规则**

加入以下规则并保留现有类名兼容性：

```css
:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.app-shell,
.app-shell .ant-layout,
.app-shell .ant-layout-content {
  min-height: 100%;
  color: var(--color-text);
  background: var(--color-bg);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
```

将 `.glass-card`、`.tech-border`、`.scan-line`、`.fade-in`、`.fade-in-stagger`、`.number-flip` 的颜色和时长改为 CSS 变量，并增加 `@media (max-width: 900px)` 的单列布局辅助类。

- [ ] **Step 4: 对齐 Ant Design 主题和浏览器标题**

在 `theme.ts` 中使用 `colors.warning`/`colors.danger` 和 token 字体，不再重复硬编码。将 `index.html` 的标题改为 `路云天瞳 · V2X 数字孪生感知平台`，把 favicon 替换为 inline data URL 或仓库现有品牌 SVG，不再显示默认 Vite 图标。

- [ ] **Step 5: 验证主题基础**

运行：

```powershell
cd frontend
node .\node_modules\typescript\bin\tsc --noEmit --pretty false
```

Expected: exit code 0；在代码扫描中能找到 `[data-theme='light']` 和 `:focus-visible`。

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/constants/design-tokens.ts frontend/src/constants/colors.ts frontend/src/app/styles/global.css frontend/src/app/styles/theme.ts frontend/src/app/App.tsx frontend/index.html
git commit -m "feat: establish v2x theme foundation"
```

## Task 2: 重做应用壳层与统一页面头部

**Files:**
- Modify: `frontend/src/app/layout/MainLayout.tsx`
- Modify: `frontend/src/app/layout/Breadcrumbs.tsx`
- Modify: `frontend/src/shared/components/PageHeader.tsx`
- Create: `frontend/src/app/layout/MainLayout.module.css`
- Create: `frontend/src/shared/components/PageHeader.module.css`

- [ ] **Step 1: 定义壳层样式边界**

在 `MainLayout.module.css` 定义 `.layout`、`.sider`、`.brand`、`.menu`、`.statusArea`、`.header`、`.headerLeft`、`.headerRight`、`.content` 和 `.mobileMenuButton`；默认侧边栏 220px、头部 64px、内容 padding 20px，`@media (max-width: 900px)` 隐藏侧边栏并显示菜单按钮。

- [ ] **Step 2: 将品牌、菜单、状态和头部从 inline style 移入 class**

保留现有雷达盾牌 SVG 与 `NAV_ITEMS`，但改用 CSS Module。菜单选中项必须包含左侧 3px 青色状态线，悬浮时只改变背景和状态线透明度；状态区显示 `SYSTEM ONLINE`、API latency 和主题按钮。顶部右侧显示 live/mock、WebSocket 状态、当前时间和主题切换按钮。

主题按钮使用 `useSettingsStore(s => s.setTheme)`，操作代码固定为：

```tsx
<button
  type="button"
  className={styles.themeButton}
  aria-label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
>
  {theme === 'dark' ? <SunOutlined /> : <MoonOutlined />}
</button>
```

- [ ] **Step 3: 统一 PageHeader API 和视觉层级**

保持 `PageHeaderProps` 的 `title`、`subtitle`、`icon`、`extra`，补充可选 `eyebrow`，并使用 `<header>` 语义元素。标题、描述和操作区分别使用 class，不把固定字号/颜色写在 JSX 中。

- [ ] **Step 4: 给所有业务页面接入 PageHeader**

在 Dashboard、Monitor、Replay、Evaluation、Settings 中分别传入页面标题、描述、图标和已有操作区；Presentation 保留独立标题栏。Breadcrumbs 的页面标题由同一 `routeTitles` 配置驱动，不重复维护字符串。

- [ ] **Step 5: 验证壳层响应式和无障碍**

运行 TypeScript 检查，并扫描：

```powershell
rg -n "PageHeader" frontend/src/pages
rg -n "aria-label|focus-visible" frontend/src/app frontend/src/shared
```

Expected: 五个业务页面各有一个 `PageHeader`，主题按钮有 `aria-label`，壳层样式在 CSS Module 中定义。

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/app/layout frontend/src/shared/components/PageHeader.tsx frontend/src/shared/components/PageHeader.module.css
git commit -m "feat: brand the application shell and page headers"
```

## Task 3: 升级 KPI、风险榜和日志流

**Files:**
- Modify: `frontend/src/widgets/kpi-bar/KpiBar.tsx`
- Create: `frontend/src/widgets/kpi-bar/KpiBar.module.css`
- Modify: `frontend/src/widgets/risk-list/RiskList.tsx`
- Create: `frontend/src/widgets/risk-list/RiskList.module.css`
- Modify: `frontend/src/widgets/log-stream/LogStream.tsx`
- Create: `frontend/src/widgets/log-stream/LogStream.module.css`
- Modify: `frontend/src/shared/components/Sparkline.tsx`

- [ ] **Step 1: 定义 KPI 纯函数和展示类型**

在 `KpiBar.tsx` 中新增可测试的 helper：

```ts
export type TrendDirection = 'up' | 'down' | 'stable';

export function getTrendDirection(current: number, previous?: number): TrendDirection {
  if (previous === undefined || current === previous) return 'stable';
  return current > previous ? 'up' : 'down';
}

export function getTrendPercent(current: number, previous?: number): number | null {
  if (previous === undefined || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
```

四个 KPI 使用 `SEMANTIC_COLORS`/`THEME_COLORS`，底部显示 sparkline、趋势箭头和一位小数的变化百分比；趋势说明通过 `aria-label` 暴露给读屏器。

- [ ] **Step 2: 抽离 KPI CSS Module**

将卡片内容拆为 `.cardContent`、`.metricHead`、`.metricValue`、`.sparklineRow`、`.trendUp`、`.trendDown`，卡片继承 `.glass-card`，不要把 `marginBottom`、`gap`、字体和颜色继续写在 JSX。

- [ ] **Step 3: 把风险榜 hover 和 critical 状态改成 CSS**

保留自定义列表结构，新增 `role="list"`/`role="listitem"`，行 class 根据 `isCritical` 和 `riskLevel` 组合；用 `.row:hover`、`.critical`、`.riskLine` 表达状态，删除 `onMouseEnter`/`onMouseLeave` 直接修改 style 的逻辑。排序按钮使用 `aria-pressed`。

- [ ] **Step 4: 完成日志流状态栏和自动滚动**

为 `LogStreamProps` 增加可选 `autoScroll?: boolean` 与 `onAutoScrollChange?: (value: boolean) => void`；默认开启。日志到达时仅在开启状态下滚动到顶部，底部显示过滤级别和总条数。用 `React.CSSProperties & { '--scan-height'?: string }` 替代 `as any`。

- [ ] **Step 5: 验证核心交互**

运行：

```powershell
cd frontend
node .\node_modules\typescript\bin\tsc --noEmit --pretty false
```

Expected: exit code 0；`rg -n "onMouseEnter|onMouseLeave|as any" frontend/src/widgets/kpi-bar frontend/src/widgets/risk-list frontend/src/widgets/log-stream` 不返回结果。

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/widgets/kpi-bar frontend/src/widgets/risk-list frontend/src/widgets/log-stream frontend/src/shared/components/Sparkline.tsx
git commit -m "feat: refine realtime metrics risk list and logs"
```

## Task 4: 统一 ECharts 主题和图表展示

**Files:**
- Modify: `frontend/src/constants/echarts-theme.ts`
- Modify: `frontend/src/entities/charts/BaseChart.tsx`
- Modify: `frontend/src/entities/charts/LineChart.tsx`
- Modify: `frontend/src/entities/charts/BarChart.tsx`
- Modify: `frontend/src/entities/charts/GaugeChart.tsx`

- [ ] **Step 1: 移除主题注册的 `any` 逃逸**

将 `V2X_THEME` 标注为 `Parameters<typeof echarts.registerTheme>[1]` 可接受的结构，若 ECharts 类型无法表达 `extraCssText`，只对该字段使用局部类型交叉，而不是整对象 `as any`。保证注册函数只执行一次。

- [ ] **Step 2: 给 BaseChart 提供稳定 option 和按需更新**

将合并逻辑固定为 `useMemo`，默认 grid、textStyle、background 和 tooltip 由主题提供；传给 `ReactEChartsCore` 的 props 包含 `notMerge: true`、`lazyUpdate: true` 和 `opts={{ renderer: 'canvas', devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2) }}`。主题切换时重新初始化图表实例。

- [ ] **Step 3: 完成折线、柱状图和仪表盘视觉**

LineChart 使用平滑线、面积渐变、隐藏普通数据点和青色阈值虚线；BarChart 使用顶部圆角和纵向渐变；Gauge 去掉指针，以风险色进度弧 + Orbitron 大数字展示，并对 min/max 相同的输入使用 `max + 1` 防止除零。

- [ ] **Step 4: 验证图表编译和主题引用**

运行 TypeScript 检查，并确认 `rg -n "registerTheme|v2x-dark|lazyUpdate" frontend/src/entities frontend/src/constants` 命中预期文件。

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/constants/echarts-theme.ts frontend/src/entities/charts
git commit -m "feat: unify v2x chart styling"
```

## Task 5: 完成 Three.js 场景的视觉与性能层

**Files:**
- Modify: `frontend/src/features/three-scene/Road.tsx`
- Modify: `frontend/src/features/three-scene/Vehicle.tsx`
- Modify: `frontend/src/features/three-scene/IntersectionScene.tsx`
- Modify: `frontend/src/features/three-scene/TrafficLight.tsx`
- Modify: `frontend/src/features/three-scene/BuildingWireframe.tsx`
- Modify: `frontend/src/features/three-scene/OcclusionZone.tsx`
- Modify: `frontend/src/features/three-scene/DataFlowParticles.tsx`
- Create if absent: `frontend/src/features/three-scene/SensorCone.tsx`

- [ ] **Step 1: 完成道路和路口材质**

路面使用 `MeshStandardMaterial`：`color='#1a1a2e'`、`emissive='#0a0e1a'`、`emissiveIntensity=0.1`、`roughness=0.8`、`metalness=0.2`；车道线、停止线、人行横道和道路边线使用透明的 `MeshBasicMaterial`/`LineBasicMaterial`，所有尺寸和颜色集中在文件顶部常量。

- [ ] **Step 2: 完成车辆传感器和风险反馈**

自车添加白/绿车灯、`SensorCone`（半透明、`depthWrite={false}`）、传感器环和风险环；风险环颜色来自 `RISK_COLORS`，critical 使用 `useFrame` 做 0.8–1.2 的缩放呼吸。轮子旋转量由速度驱动，缺少速度时使用低速静态动画。

- [ ] **Step 3: 完成交通灯、线框建筑和盲区**

四角交通灯显示 red/yellow/green 三灯，仅当前灯产生 PointLight；建筑用极暗实体 + 青色 wireframe + 少量窗灯；`OcclusionZone` 使用红色透明实体和 `EdgesGeometry` 轮廓，脉冲范围保持在 0.03–0.07。

- [ ] **Step 4: 完成粒子、Bloom 和镜头模式**

`DataFlowParticles` 将粒子数量设为 160，70% 青色、30% 绿色，y 到 20 后循环；`IntersectionScene` 使用 `EffectComposer` + `Bloom`，保持 `orbit`/`follow`/`cinematic` props，灯光和雾色随主题切换。

- [ ] **Step 5: 运行 3D 编译与启动冒烟检查**

运行：

```powershell
cd frontend
node .\node_modules\typescript\bin\tsc --noEmit --pretty false
```

Expected: exit code 0；代码中 `Bloom`、`cameraMode`、`OcclusionZone`、`DataFlowParticles` 均有实际渲染引用。

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/features/three-scene
git commit -m "feat: enhance v2x intersection scene"
```

## Task 6: 统一五个业务页面与演示模式

**Files:**
- Modify: `frontend/src/pages/dashboard/DashboardPage.tsx`
- Modify: `frontend/src/pages/monitor/MonitorPage.tsx`
- Modify: `frontend/src/pages/replay/ReplayPage.tsx`
- Modify: `frontend/src/pages/evaluation/EvaluationPage.tsx`
- Modify: `frontend/src/pages/settings/SettingsPage.tsx`
- Modify: `frontend/src/pages/presentation/PresentationPage.tsx`
- Modify: `frontend/src/widgets/event-table/EventTable.tsx`
- Modify: `frontend/src/widgets/metric-cards/MetricCards.tsx`
- Modify: `frontend/src/shared/components/EmptyState.tsx`
- Modify: `frontend/src/shared/components/Skeleton.tsx`

- [ ] **Step 1: 重排 Dashboard 视觉层级**

删除页面级重复圆角/padding inline style，使用页面 CSS class；3D 场景保持中心列，风险榜放左列，三个趋势图放右列，日志铺满底部；页面根节点加 `fade-in`，卡片容器加 `fade-in-stagger`。

- [ ] **Step 2: 统一 Monitor 和 Replay 的状态反馈**

Monitor 的 Demo 控制区使用统一状态徽标并在 API 错误时显示可重试 Result；Replay 顶部添加 PageHeader，未选事件、无帧数据和加载状态改用 `EmptyState`/`Skeleton`，播放控制器和场景使用相同的 panel spacing。

- [ ] **Step 3: 重做 Evaluation 的指标与表格层级**

Evaluation 顶部显示报告来源、样本帧、高危事件和最低 TTC，并明确 mock 时显示“演示数据”。达标状态改为自定义列表（指标/当前值/目标/状态），消融详情仍可用 Table 但使用主题 row/header 样式；保留导出报告动作。

- [ ] **Step 4: 重排 Settings 分组和反馈**

每个设置卡片采用“标签 + 描述 + 控件”结构；主题切换使用两个可视预览按钮；云端同步、导入、导出均使用一致的成功/失败消息；控件宽度在窄屏变为 100%。

- [ ] **Step 5: 收敛 Presentation 布局**

将标题栏、场景、右侧风险/趋势、底部事件时间轴改为 CSS class，保留 `/presentation` 独立路由；窄屏使用纵向滚动而不是固定 65%/35% 造成横向溢出。

- [ ] **Step 6: 验证所有路由入口**

运行 TypeScript 检查，并扫描：

```powershell
rg -n "<PageHeader" frontend/src/pages
rg -n "暂无数据|暂无风险数据|加载帧数据中" frontend/src/pages frontend/src/widgets
```

Expected: 五个业务页均使用 `PageHeader`；剩余空状态文案只存在于 `EmptyState` 的默认文案或明确的第三方控件 fallback 中。

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/pages frontend/src/widgets/event-table frontend/src/widgets/metric-cards frontend/src/shared/components/EmptyState.tsx frontend/src/shared/components/Skeleton.tsx
git commit -m "feat: unify business page layouts and states"
```

## Task 7: 修复连接状态、数据选择器和通知行为

**Files:**
- Modify: `frontend/src/widgets/connection-panel/ConnectionPanel.tsx`
- Modify: `frontend/src/store/monitorStore.ts`
- Modify: `frontend/src/services/websocketService.ts`
- Modify: `frontend/src/shared/components/Toast.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/shared/hooks/useMockRealtime.ts`

- [ ] **Step 1: 修复连接面板动作**

重连按钮调用 `wsService.connect()`，断开按钮调用 `wsService.disconnect()`；按钮只有在相应异步动作进行时 disabled，默认重连按钮不再永久 disabled。连接状态使用 online/offline/connecting 三色语义。

- [ ] **Step 2: 让 monitorStore 的 toggleConnection 真实驱动服务**

实现：

```ts
toggleConnection: () => {
  const connected = get().connected;
  if (connected) wsService.disconnect();
  else wsService.connect();
  set({ connected: !connected });
}
```

如果服务事件随后返回更准确状态，由 websocket service 的事件回调覆盖 optimistic 状态。

- [ ] **Step 3: 保证 Toast 挂载一次并支持风险事件**

Toast 组件使用 `role="status"`/`role="alert"`，保留 3 秒自动消失；`router.tsx` 中只在壳层根节点挂载一次。mock/实时更新收到 critical 风险时调用 `showToast('检测到高危遮挡事件', 'error')`，普通日志不弹窗。

- [ ] **Step 4: 用细粒度选择器减少更新**

将 Dashboard、Presentation 和核心 widgets 从无选择器解构改为 `useStore(s => s.metrics)` 等细粒度选择器，避免不相关字段变化触发重渲染；保持 store API 名称不变。

- [ ] **Step 5: 验证状态动作**

运行现有单元测试：

```powershell
cd frontend
npm run test:unit
```

Expected: existing runtime config、settings、evaluation、dashboard data source tests 全部 PASS。

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/widgets/connection-panel frontend/src/store/monitorStore.ts frontend/src/services/websocketService.ts frontend/src/shared/components/Toast.tsx frontend/src/app/router.tsx frontend/src/shared/hooks/useMockRealtime.ts
git commit -m "fix: wire realtime connection and alert states"
```

## Task 8: 增加组件行为测试和构建检查

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/tests/KpiBar.test.tsx`
- Create: `frontend/tests/RiskList.test.tsx`
- Create: `frontend/tests/LogStream.test.tsx`
- Create: `frontend/tests/GaugeChart.test.tsx`

- [ ] **Step 1: 安装测试依赖并配置脚本**

增加 `vitest`、`jsdom`、`@testing-library/react`、`@testing-library/jest-dom`，并把 package script 改为：

```json
"test:ui": "vitest run",
"test:unit": "tsc -p tsconfig.test.json && node .tmp-tests/tests/runtimeConfig.test.js && node .tmp-tests/tests/settingsApi.test.js && node .tmp-tests/tests/evaluationApi.test.js && node .tmp-tests/tests/dashboardDataSource.test.js && vitest run"
```

`vitest.config.ts` 使用 `environment: 'jsdom'`、`setupFiles: ['./src/test/setup.ts']` 和 `resolve.alias` 与 Vite 相同；setup 文件导入 `@testing-library/jest-dom/vitest`。

- [ ] **Step 2: 写 KPI 和风险榜行为测试**

测试至少覆盖：KPI 标签/数值/趋势可见；风险榜按风险分默认降序，点击 TTC 后按 TTC 升序，critical 行有可识别的状态 class。

- [ ] **Step 3: 写日志和仪表盘行为测试**

测试至少覆盖：日志过滤只显示选中级别；空日志显示 EmptyState 文案；Gauge 接收 min/max/value 后渲染 ECharts 容器且不因 min===max 抛错。

- [ ] **Step 4: 运行完整验证**

运行：

```powershell
cd frontend
npm run lint
npm run test:unit
npm run build
```

Expected: 三条命令均 exit code 0，`dist/` 生成，并且没有 TypeScript、ESLint 或 chunk 生成错误。

- [ ] **Step 5: Commit**

```powershell
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/src/test frontend/tests
git commit -m "test: verify core v2x ui interactions"
```

## Task 9: 最终视觉审计与交付

**Files:**
- Modify only files that fail the audit in Tasks 1–8.
- Verify: `frontend/dist/` and running app routes.

- [ ] **Step 1: 启动预览并检查路由**

运行 `npm run dev -- --host 127.0.0.1`，逐页检查 `/`、`/monitor`、`/replay`、`/evaluation`、`/settings`、`/presentation`。

- [ ] **Step 2: 检查主题和响应式**

在暗色/浅色主题、桌面宽度和 900px 以下宽度检查：无横向滚动、标题/卡片不重叠、状态颜色可读、键盘焦点可见、`prefers-reduced-motion` 下无持续动画。

- [ ] **Step 3: 对照任务书验收表**

用以下扫描作为静态证据：

```powershell
rg -n "<PageHeader" frontend/src/pages
rg -n "#faad14|#ff4d4f|#00d4ff|#00ff88" frontend/src/widgets frontend/src/pages
rg -n "as any|style=\{" frontend/src/widgets frontend/src/pages frontend/src/app
```

把仍然合理的动态尺寸 inline style 限制在场景/图表外壳，并确保风险/连接色统一从 `colors.ts`/CSS 变量获取。

- [ ] **Step 4: 运行最终命令并记录结果**

```powershell
cd frontend
npm run lint
npm run test:unit
npm run build
git status --short --branch
```

Expected: lint、测试、构建全部通过；工作区只包含本次 UI 优化的已提交变更。

- [ ] **Step 5: Commit any audit fixes**

```powershell
git add frontend/src frontend/tests frontend/package.json frontend/package-lock.json
git commit -m "chore: finalize luyuntiantong ui audit"
```

## Plan self-review

- **Spec coverage:** 设计系统由 Task 1 覆盖；应用壳层和统一头部由 Task 2 覆盖；KPI/Risk/Log 由 Task 3 覆盖；ECharts 由 Task 4 覆盖；道路/车辆/交通灯/建筑/盲区/粒子/Bloom 由 Task 5 覆盖；五个业务页和 Presentation 由 Task 6 覆盖；连接、Toast、store 选择器由 Task 7 覆盖；组件测试、lint、build 和路由审计由 Task 8–9 覆盖。
- **Placeholder scan:** 计划中的每个代码任务都给出具体文件、实现内容和预期命令。
- **Type consistency:** 趋势类型、主题选择器、`PageHeader` props、Toast 状态和 `toggleConnection` 依赖现有项目名称；新增 `autoScroll` props 为可选，不破坏现有调用方。
- **Scope check:** 任务按共享主题 → 壳层 → 核心组件 → 图表 → 3D → 页面 → 状态 → 测试顺序串联；每一组都能在 TypeScript 检查或行为测试后独立提交。
