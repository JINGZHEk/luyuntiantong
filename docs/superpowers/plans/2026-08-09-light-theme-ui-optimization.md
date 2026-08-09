# 路云天瞳浅色主题与控制台 UI 二次优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留现有 V2X 实时监控功能、路由、Mock/Live 数据流和深色指挥中心风格的前提下，重构浅色主题的视觉基础，并统一应用壳层、数据卡片、图表、状态反馈、响应式和可访问性。

**Architecture:** 采用“成对主题”设计：深色模式保持低光态势指挥风格，浅色模式改为高可读的数据分析控制台。所有页面继续复用现有 React、Ant Design、Zustand、ECharts 和 CSS Modules 边界；先统一颜色/表面/字体/间距 token，再改应用壳层和共享组件，最后逐页做视觉收敛与截图验收。UI 目标只修改前端表现，不改变 MQTT、Cloud STGNN、感知协议或业务计算逻辑。

**Tech Stack:** React 18, TypeScript, Vite, Ant Design 5, Zustand, ECharts, React Three Fiber, CSS Modules, Vitest, Testing Library。

---

## 1. Design system decision

本计划使用 `ui-ux-pro-max` 的设计系统结果作为基线：产品类型为实时运营/IoT 监控控制台，桌面端数据密度为中高，采用 4/8px 间距节奏，正常文本对比度不低于 4.5:1，交互元素保留可见焦点和明确按下状态。

### 1.1 双主题定位

| 主题 | 定位 | 视觉策略 |
| --- | --- | --- |
| Dark | Mission Control | 深空背景、低量青色辉光、关键状态高亮、保留 3D 态势感 |
| Light | Analytical Console | Slate/blue 中性色、白色表面分层、细边框、低阴影、减少装饰噪音 |

浅色模式不能继续使用“深色主题去掉文字阴影后的剩余样式”。它需要自己的表面层级和语义颜色，但不另起一套组件结构。

### 1.2 浅色主题目标 token

```text
background       #F8FAFC
surface          #FFFFFF
surface-subtle   #F1F5F9
surface-raised   #FFFFFF
text-primary     #0F172A
text-secondary   #334155
text-muted       #64748B
border           #CBD5E1
border-strong    #93C5FD
primary          #1E40AF
accent           #2563EB
success          #15803D
warning          #B45309
danger           #B91C1C
purple           #6D28D9
```

`#64748B` 作为普通次级文字，`#B45309` 作为警告文字，禁止继续使用对浅色背景对比度不足的 `#8C8C8C`、`#BFBFBF`、`#52C41A` 和 `#D89614` 作为小字号文本色。

### 1.3 非目标

- 不修改 YOLO、DeepSORT、STGNN、MQTT、SQLite 和 WebSocket 逻辑。
- 不删除现有 Mock fallback、回放页、评估页和 Presentation 路由。
- 不把所有页面改成纯白营销站；保留监控平台的技术感和数据密度。
- 不在没有实测性能证据时增加复杂动画、粒子或新的第三方 UI 库。

## 2. Execution gate and archive boundary

这部分是 UI Goal 的前置门槛，不能与当前 PC 感知 → Cloud STGNN 目标混合提交。

### Task 0: Archive the current PC-cloud goal before starting UI work

**Files:**
- Verify only: current PC-cloud implementation files and tests
- Exclude from this archive: `docs/superpowers/plans/2026-08-09-light-theme-ui-optimization.md`

- [ ] **Step 1: Confirm the current goal is complete.**

在当前目标线程中完成其 focused tests、后端全量回归、算法环境就绪检查、前端构建和 UI 测试。只有所有必需检查有明确结果后，才能进入 UI Goal。

- [ ] **Step 2: Review the current diff before staging.**

运行：

```powershell
git status --short
git diff --stat
git diff --check
```

确认本次归档不包含 UI 二次优化的前端源码改动；当前 UI 规划文档可以暂时保持未暂存，后续由 UI Goal 自己提交。

- [ ] **Step 3: Create one archive commit for the completed PC-cloud goal.**

按当前 PC-cloud 目标的文件清单显式 `git add`，禁止使用 `git add .` 把未来 UI 改动、临时截图或构建产物带入归档。提交信息固定为：

```powershell
git commit -m "feat: complete pc perception cloud stgnn loop"
```

- [ ] **Step 4: Verify the archive boundary.**

运行：

```powershell
git log -1 --oneline
git status --short
```

提交成功后再创建下面定义的 UI Goal；UI Goal 的 objective 固定为：

```text
执行 docs/superpowers/plans/2026-08-09-light-theme-ui-optimization.md，完成路云天瞳前端浅色主题、应用壳层、数据卡片、图表、响应式和可访问性二次优化；保留深色主题、Mock/Live 数据流、现有路由和三维场景功能；完成 frontend 的构建、UI 测试、主题对比度检查和 375/768/1024/1440 宽度验收。
```

## 3. File map

| File | Responsibility | Planned change |
| --- | --- | --- |
| `frontend/src/constants/colors.ts` | JS/Ant theme colors | Make dark/light semantic tokens single-source and contrast-safe |
| `frontend/src/constants/design-tokens.ts` | Spacing/radius/type tokens | Add surface, type, control-size and motion tokens without breaking exports |
| `frontend/src/app/styles/global.css` | CSS variables and global primitives | Replace light override patch with a complete light surface system |
| `frontend/src/app/styles/theme.ts` | Ant Design theme | Align Layout/Card/Table/Input/Select/Button tokens with CSS variables |
| `frontend/src/app/layout/MainLayout.tsx` | App shell information hierarchy | Remove duplicate/hardcoded status, enlarge icon hit targets |
| `frontend/src/app/layout/MainLayout.module.css` | Sidebar/header shell | Create deliberate light sidebar, header, menu and focus states |
| `frontend/src/shared/components/PageHeader.module.css` | Shared page header | Improve type scale, divider, icon treatment and mobile wrapping |
| `frontend/src/widgets/kpi-bar/*` | Realtime KPI strip | Make metric hierarchy readable in both themes and reduce neon effects |
| `frontend/src/widgets/metric-cards/*` | Evaluation metrics | Use semantic status colors and tabular readable values |
| `frontend/src/widgets/perception-cards/*` | Perception/Cloud status | Keep YOLO/DeepSORT/STGNN chips readable and non-color-only |
| `frontend/src/widgets/connection-panel/*` | Connection controls | Improve action states, focus, disabled and error feedback |
| `frontend/src/widgets/log-stream/*` | Live log list | Improve density, contrast and selected/filter states |
| `frontend/src/widgets/event-table/*` | Event table | Improve table header/row/selection contrast and keyboard affordance |
| `frontend/src/constants/echarts-theme.ts` | ECharts theme | Replace light chart colors and tooltip surfaces with the new palette |
| `frontend/src/entities/charts/*` | Chart wrappers | Ensure theme switch refreshes options without layout jumps |
| `frontend/src/pages/*/*.module.css` | Page-specific layout | Remove leftover neon-only overrides and preserve responsive hierarchy |
| `frontend/tests/themeTokens.ui.test.ts` | Token/accessibility tests | Assert light tokens and semantic contrast floors |
| `frontend/tests/lightTheme.ui.test.tsx` | UI behavior tests | Assert light-mode labels, status chips and accessible controls |

## 4. Implementation tasks

### Task 1: Freeze the theme contract with failing contrast tests

**Files:**
- Modify: `frontend/src/constants/colors.ts`
- Modify: `frontend/src/constants/design-tokens.ts`
- Create: `frontend/tests/themeTokens.ui.test.ts`

- [ ] **Step 1: Write the failing token test.**

新增测试，先锁定浅色主题的关键值和对比度下限。测试使用本地纯函数，不调用浏览器 API：

```ts
import { THEME_COLORS } from '@/constants/colors';

function contrastRatio(foreground: string, background: string): number {
  const channel = (hex: string, offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex: string) => (
    0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5)
  );
  const light = luminance(foreground);
  const dark = luminance(background);
  return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
}

describe('light theme contract', () => {
  it('uses the analytical-console surface palette', () => {
    expect(THEME_COLORS.light.bg).toBe('#F8FAFC');
    expect(THEME_COLORS.light.cardBg).toBe('#FFFFFF');
    expect(THEME_COLORS.light.text).toBe('#0F172A');
    expect(THEME_COLORS.light.textSecondary).toBe('#334155');
    expect(THEME_COLORS.light.textMuted).toBe('#64748B');
  });

  it('keeps normal text and semantic text above the AA floor', () => {
    const colors = THEME_COLORS.light;
    expect(contrastRatio(colors.text, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.textSecondary, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.textMuted, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.accent, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.success, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.warning, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.danger, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails against the current palette.**

运行：

```powershell
cd frontend
npm run test:ui -- --reporter=dot tests/themeTokens.ui.test.ts
```

Expected: the current `#F0F2F5`/`#1F1F1F`/`#8C8C8C` contract assertions fail before implementation.

- [ ] **Step 3: Update the theme constants without changing export names.**

`THEME_COLORS.light` 改为第 1.2 节的值；`SEMANTIC_COLORS` 的 light-safe 状态值和 `RISK_COLORS` 必须使用同一组语义颜色。 `GRADIENTS` 只保留深色态势页面需要的渐变，浅色页面禁止直接引用深色霓虹渐变。

在 `design-tokens.ts` 增加但不删除现有 token：

```ts
export const UI_TOKENS = {
  controlHeight: 40,
  touchTarget: 44,
  cardRadius: 10,
  pageGap: 24,
  sectionGap: 16,
  bodyFontSize: 14,
  labelFontSize: 12,
} as const;
```

- [ ] **Step 4: Run the token test and TypeScript check.**

运行：

```powershell
npm run test:ui -- --reporter=dot tests/themeTokens.ui.test.ts
npm run build
```

Expected: token test and TypeScript/Vite build pass；此时尚未要求页面视觉完全完成。

### Task 2: Replace the light-theme override patch with a surface system

**Files:**
- Modify: `frontend/src/app/styles/global.css`
- Modify: `frontend/src/app/styles/theme.ts`
- Modify: `frontend/src/app/layout/MainLayout.module.css`
- Modify: `frontend/src/shared/components/PageHeader.module.css`

- [ ] **Step 1: Write the light surface rules.**

在 `global.css` 的浅色主题根选择器中一次性定义背景、表面、边框、文字和阴影，不再依赖后文的多组 `!important` 补丁：

```css
[data-theme='light'] {
  color-scheme: light;
  --color-bg: #f8fafc;
  --color-surface: #ffffff;
  --color-surface-solid: #ffffff;
  --color-surface-raised: #ffffff;
  --color-surface-subtle: #f1f5f9;
  --color-border: #cbd5e1;
  --color-border-strong: #93c5fd;
  --color-text: #0f172a;
  --color-text-secondary: #334155;
  --color-text-muted: #64748b;
  --shadow-card: 0 1px 2px rgb(15 23 42 / 0.06), 0 4px 12px rgb(15 23 42 / 0.04);
  --shadow-card-hover: 0 4px 16px rgb(15 23 42 / 0.10);
  --app-background: linear-gradient(180deg, #f8fafc 0%, #eef4fb 100%);
}
```

- [ ] **Step 2: Make cards readable without glass artifacts.**

浅色 `.glass-card` 使用实色白色表面、可见边框和低阴影；关闭 `backdrop-filter`、顶部霓虹线和伪元素渐变。普通数据卡片 hover 只改变边框/阴影，不做 `translateY`，避免光标移动造成布局抖动：

```css
[data-theme='light'] .glass-card {
  background: var(--color-surface) !important;
  border-color: var(--color-border) !important;
  backdrop-filter: none !important;
  box-shadow: var(--shadow-card) !important;
  transform: none;
}

[data-theme='light'] .glass-card:hover {
  border-color: var(--color-border-strong) !important;
  box-shadow: var(--shadow-card-hover) !important;
  transform: none;
}
```

- [ ] **Step 3: Align Ant Design tokens with the CSS surface system.**

在 `theme.ts` 的 `token` 中同时配置 `colorBgLayout`、`colorBgContainer`、`colorFillAlter`、`colorTextTertiary`、`colorBorder`、`controlHeight` 和 `borderRadius`；Card、Table、Input、Select、Button 使用 `colors` 对象，不再硬编码 `#fafafa`、`#f5f8ff` 等浅色值。Light Table header、row hover 和 selected row 必须使用 `surface-subtle` 和 `border-strong` 的语义值。

- [ ] **Step 4: Simplify shell and page-header decoration in light mode.**

`MainLayout.module.css` 的浅色侧边栏使用 `#F8FAFC`，选中菜单使用低饱和蓝色背景和左侧 3px 指示线；header 使用 `#FFFFFF` 和底部边框，不使用大面积 blur。 `PageHeader.module.css` 的图标盒、分割线和 eyebrow 使用统一 token，保留一个轻微品牌色，不保留灰色渐变线堆叠。

- [ ] **Step 5: Run the focused build and inspect the surface hierarchy.**

运行：

```powershell
cd frontend
npm run build
```

Expected: build pass；手动检查浅色 Dashboard、Monitor、Settings：页面背景、卡片、抬升区域和选中菜单至少能被边界/阴影区分。

### Task 3: Normalize typography, density and shell information hierarchy

**Files:**
- Modify: `frontend/src/app/styles/global.css`
- Modify: `frontend/src/app/layout/MainLayout.tsx`
- Modify: `frontend/src/app/layout/MainLayout.module.css`
- Modify: `frontend/src/shared/components/PageHeader.module.css`
- Modify: `frontend/src/pages/settings/SettingsPage.module.css`

- [ ] **Step 1: Set readable type tiers.**

全局正文使用 14–16px，页面标题使用 22–24px，卡片标题使用 13–14px，状态/辅助文字使用至少 12px；仅允许时间戳、track ID、模型路径等数据型文本使用 11px。减少浅色模式对 Orbitron 的依赖：Orbitron 只保留在关键数值，普通标签使用 `Inter` 与中文系统字体。

- [ ] **Step 2: Remove duplicated and fake status information.**

`StatusArea` 不再展示固定的 `12ms`。保留真实可得的连接状态和数据源；顶部 header 保留页面状态、数据源、当前时间和主题切换中的必要信息，避免同时展示两组相同的 WebSocket 状态。若没有实际 latency 字段，显示“未采集”，不得显示伪造数值。

示例结构：

```tsx
<div className={styles.statusMeta}>
  <span>CONNECTION</span>
  <strong>{connected ? 'ONLINE' : 'OFFLINE'}</strong>
</div>
<div className={styles.statusMeta}>
  <span>DATA SOURCE</span>
  <strong className={source === 'live' ? styles.liveText : styles.mockText}>
    {source.toUpperCase()}
  </strong>
</div>
```

- [ ] **Step 3: Fix interactive target sizes and focus states.**

`themeButton` 和 `mobileMenuButton` 的视觉图标可以保持 18–20px，但按钮 hit area 必须达到 44×44px；主题按钮继续保留 `aria-label`、`aria-pressed` 或等价状态。设置页主题预览按钮、连接按钮和筛选控件保留清晰的 focus ring。

- [ ] **Step 4: Run static accessibility scans.**

运行：

```powershell
rg -n "font-size:\s*(9|10|11)px|width:\s*30px|height:\s*30px|12ms" frontend/src --glob '*.css' --glob '*.tsx'
rg -n "aria-label|focus-visible|prefers-reduced-motion" frontend/src
```

Expected: 9–11px 只出现在数据型标签或图表轴；不再存在固定 `12ms`；主题按钮和移动菜单都有无障碍标签，焦点和 reduced-motion 规则仍存在。

### Task 4: Make status colors and data components readable in both themes

**Files:**
- Modify: `frontend/src/widgets/kpi-bar/KpiBar.module.css`
- Modify: `frontend/src/widgets/metric-cards/MetricCards.module.css`
- Modify: `frontend/src/widgets/perception-cards/PerceptionCards.module.css`
- Modify: `frontend/src/widgets/perception-cards/PerceptionCards.tsx`
- Modify: `frontend/src/widgets/connection-panel/ConnectionPanel.module.css`
- Modify: `frontend/src/widgets/log-stream/LogStream.module.css`
- Modify: `frontend/src/widgets/event-table/EventTable.module.css`

- [ ] **Step 1: Add semantic status text and icon treatment.**

状态不能只靠绿色/红色。KPI、连接状态、感知卡片和事件表至少同时显示文字或图标；颜色从 `var(--color-success)` 等 token 获取。浅色模式不使用荧光色作为小字号文字，不使用 `currentColor` 生成强 glow。

- [ ] **Step 2: Remove component-level neon leakage.**

清理 light mode 仍然可见的 `text-shadow`、`drop-shadow`、彩色外发光和 hover `translate`。保留最多一个轻微重点阴影；交互卡片的 hover 只修改 `border-color` 和 `box-shadow`，不改变尺寸和布局位置。

- [ ] **Step 3: Normalize status chips and perception metadata.**

`PerceptionCards` 保留 `YOLO + DeepSORT`、`STGNN Cloud`、`Fallback`、`坐标无效` 等状态文案；为每类状态定义文字、图标和颜色的组合。无实时预测元数据时显示“未声明/等待数据”，不能把 Mock 消息显示为真实 STGNN ready。

- [ ] **Step 4: Add focused UI tests before implementation completion.**

创建 `frontend/tests/lightTheme.ui.test.tsx`，覆盖以下行为：

```tsx
it('shows a readable live processing chain in light mode', () => {
  useSettingsStore.setState({ theme: 'light' });
  useMonitorStore.getState().updateFromPerception(livePayload);
  render(<PerceptionCards />);

  expect(screen.getByText('YOLO + DeepSORT')).toBeInTheDocument();
  expect(screen.getByText('STGNN Cloud')).toBeInTheDocument();
  expect(screen.getByText('Fallback')).toBeInTheDocument();
  expect(screen.getByText('坐标无效')).toBeInTheDocument();
});
```

测试数据必须包含 `prediction.status`、`source.detector`、`source.tracker` 和一个 `invalid_coordinate` 对象，确保状态文案来自协议字段而不是静态假数据。

- [ ] **Step 5: Run focused UI tests.**

运行：

```powershell
cd frontend
npm run test:ui -- --reporter=dot tests/themeTokens.ui.test.ts tests/lightTheme.ui.test.tsx tests/monitorPrediction.ui.test.tsx
```

Expected: all focused tests pass；失败时优先修正 token/状态映射，不通过增加更亮的颜色掩盖对比度问题。

### Task 5: Rebuild the light ECharts theme and chart containers

**Files:**
- Modify: `frontend/src/constants/echarts-theme.ts`
- Modify: `frontend/src/entities/charts/BaseChart.tsx`
- Modify: `frontend/src/entities/charts/LineChart.tsx`
- Modify: `frontend/src/entities/charts/BarChart.tsx`
- Modify: `frontend/src/entities/charts/GaugeChart.tsx`
- Modify: `frontend/src/widgets/metric-cards/MetricCards.module.css`

- [ ] **Step 1: Write the light chart palette.**

`V2X_LIGHT_THEME` 使用蓝色主线、绿色成功、紫色辅助、橙色警告和红色风险，但每种颜色只承担一种语义；轴线/网格使用 slate 边界，禁止使用 `#D9D9D9` 与 `#8C8C8C` 的低对比组合。Tooltip 使用白色表面、`#CBD5E1` 边框、`#0F172A` 文本和低阴影。

推荐结构：

```ts
const V2X_LIGHT_THEME = {
  color: ['#1D4ED8', '#15803D', '#6D28D9', '#B45309', '#B91C1C'],
  backgroundColor: 'transparent',
  textStyle: { color: '#334155', fontSize: 12 },
  legend: { textStyle: { color: '#334155', fontSize: 12 } },
  tooltip: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    textStyle: { color: '#0F172A', fontSize: 12 },
  },
  categoryAxis: { axisLabel: { color: '#475569', fontSize: 11 } },
  valueAxis: { axisLabel: { color: '#475569', fontSize: 11 } },
};
```

- [ ] **Step 2: Keep chart theme switching stable.**

`BaseChart` 继续使用 `key={theme}`、`notMerge` 和 `lazyUpdate`，并保证 `useMemo` 的依赖包含主题颜色；主题切换只重建图表实例，不改变卡片高度。图表容器预留固定高度，避免主题或数据更新造成 CLS。

- [ ] **Step 3: Check chart readability in both themes.**

浅色模式检查标题、坐标轴、图例、tooltip、阈值线和空数据状态；深色模式检查原有青色/绿色态势图没有被浅色 token 误覆盖。

- [ ] **Step 4: Run chart/build checks.**

运行：

```powershell
cd frontend
npm run build
npm run test:ui -- --reporter=dot
```

Expected: build 和全部 UI tests pass；图表测试不依赖网络字体或真实 Cloud API。

### Task 6: Make pages responsive and consistent without changing business behavior

**Files:**
- Modify: `frontend/src/pages/dashboard/DashboardPage.module.css`
- Modify: `frontend/src/pages/monitor/MonitorPage.module.css`
- Modify: `frontend/src/pages/evaluation/EvaluationPage.module.css`
- Modify: `frontend/src/pages/replay/ReplayPage.module.css`
- Modify: `frontend/src/pages/settings/SettingsPage.module.css`
- Modify: `frontend/src/pages/presentation/PresentationPage.module.css`
- Modify: corresponding page TSX only when a semantic wrapper or `aria` label is required

- [ ] **Step 1: Establish common page rhythm.**

所有业务页使用统一的 page padding、PageHeader bottom gap、section gap 和 card radius。页面内容区在 1440px 以上设置最大可读宽度，1024px 以下降低 grid 最小宽度，768px 以下单列，375px 下操作区纵向排列；禁止横向滚动。

- [ ] **Step 2: Set Dashboard focal hierarchy.**

Dashboard 以 3D 路口/态势图为主焦点，KPI 为次级快速读数，风险列表和日志为可扫描信息。浅色模式不让每个模块都发光；场景卡和风险告警可以有更强边界，其余卡片保持安静。

- [ ] **Step 3: Set Monitor and Settings density.**

Monitor 的 Demo 控制区把运行状态、场景和操作分成两组，移动端全部按纵向排列；Settings 的主题预览、API 输入、阈值和同步动作使用一致的 40px 控件高度和 16px 组间距。

- [ ] **Step 4: Preserve Replay/Evaluation/Presentation entry points.**

只调整布局和状态外观，不改变回放推进、报告导出、3D camera mode、Cloud API 请求和设置持久化。所有空状态、加载状态、失败状态提供文字和可恢复动作。

- [ ] **Step 5: Run responsive static checks.**

运行：

```powershell
rg -n "minmax\([^)]*420px|width:\s*65%|width:\s*35%|overflow-x" frontend/src/pages frontend/src/widgets
```

Expected: 可能造成窄屏溢出的固定布局被替换为响应式 grid/flex；必要的 3D 场景高度保留，但不让页面出现横向滚动。

### Task 7: Add theme/accessibility regression coverage

**Files:**
- Modify: `frontend/tests/themeTokens.ui.test.ts`
- Modify: `frontend/tests/lightTheme.ui.test.tsx`
- Modify: existing UI tests only when shared rendering setup changes
- Modify: `frontend/src/test/setup.ts` only when an accessibility matcher is required

- [ ] **Step 1: Test the theme switch contract.**

测试 `useSettingsStore.setTheme('light')` 后，根主题状态为 `light`，主题按钮 accessible name 与图标语义相反，且 `getAntdTheme('light')` 的 `colorPrimary`、`colorBgBase`、`colorText` 来自统一 `THEME_COLORS.light`。

- [ ] **Step 2: Test status semantics without relying on color.**

测试 Live、Mock、Fallback、坐标无效、WebSocket 断开分别有可读文本；断开状态提供按钮或重试入口，不能只显示红点。

- [ ] **Step 3: Test reduced motion and focus hooks statically.**

使用 `rg` 检查 `prefers-reduced-motion`、`:focus-visible`、`aria-label`、`aria-pressed`；对 icon-only button 使用 Testing Library 的 `getByRole('button', { name })` 验证 accessible name。

- [ ] **Step 4: Run all frontend checks.**

运行：

```powershell
cd frontend
npm run lint
npm run test:unit
npm run test:ui -- --reporter=dot
npm run build
```

Expected: lint、unit、UI、build 全部 exit code 0；允许已有明确记录的 warning，但不能有 TypeScript error、测试失败或构建失败。

### Task 8: Visual QA and final UI commit

**Files:**
- Verify: `frontend/src/**`, `frontend/tests/**`, `frontend/package.json`
- Do not commit: `frontend/dist/`、临时截图、浏览器缓存和本地 API 地址

- [ ] **Step 1: Start the frontend preview.**

运行：

```powershell
cd frontend
npm run dev -- --host 127.0.0.1
```

逐页检查 `/`、`/monitor`、`/replay`、`/evaluation`、`/settings`、`/presentation`。

- [ ] **Step 2: Complete the viewport matrix.**

在 375px、768px、1024px、1440px 宽度分别检查深色和浅色：

```text
[ ] 页面无横向滚动
[ ] 页面标题、副标题和操作区不重叠
[ ] 卡片表面有明确层级，不依赖发光区分
[ ] 正常文本和状态文本可读
[ ] 菜单、主题按钮、连接按钮可见且焦点清楚
[ ] 图表 tooltip、图例和坐标轴可读
[ ] Mock/Live/Fallback/坐标无效不依赖颜色单独表达
[ ] reduced-motion 下没有持续装饰动画
```

- [ ] **Step 3: Review the final diff for scope.**

运行：

```powershell
git diff --check
git diff --stat
git status --short
```

确认 diff 只包含前端视觉、主题、响应式、无障碍和对应测试，不包含算法、协议、数据库和硬件接入逻辑。

- [ ] **Step 4: Commit the UI Goal.**

运行：

```powershell
git add frontend/src frontend/tests frontend/package.json frontend/package-lock.json docs/superpowers/plans/2026-08-09-light-theme-ui-optimization.md
git commit -m "feat: refine v2x light theme and console ui"
```

- [ ] **Step 5: Verify the final archive.**

运行：

```powershell
git log -2 --oneline
git status --short --branch
```

Expected: 最近两次提交分别是 PC-cloud 闭环归档和 UI 二次优化归档；工作区没有由构建产生的未跟踪产物。

## 5. Final acceptance checklist

- [ ] Light mode uses one consistent token source for CSS and Ant Design。
- [ ] Light mode surface, border and text hierarchy is visually clear。
- [ ] Normal text and semantic status text meet the 4.5:1 AA target。
- [ ] Dark mode remains readable and keeps its intended mission-control identity。
- [ ] No hardcoded fake `12ms` status remains in the shell。
- [ ] No regular body text uses 9px/10px/11px as its primary size。
- [ ] Theme and mobile menu hit areas are at least 44×44px。
- [ ] Focus-visible and reduced-motion behavior remain available。
- [ ] Live/Mock/Fallback/invalid-coordinate states include text or icon semantics。
- [ ] 375/768/1024/1440 viewports do not horizontally scroll。
- [ ] `npm run lint` passes。
- [ ] `npm run test:unit` passes。
- [ ] `npm run test:ui -- --reporter=dot` passes。
- [ ] `npm run build` passes。
- [ ] PC-cloud archive and UI archive are separate commits。

## 6. Plan self-review

### Spec coverage

- 浅色主题丑的根因由 Tasks 1–2 覆盖：token 不统一、对比度不足、表面无层级、残留霓虹覆盖。
- 一般前端 UI 统一由 Tasks 3–6 覆盖：壳层、页面头部、数据卡片、连接/日志/事件、图表、响应式和 3D 页面容器。
- 可访问性和回归由 Task 7 覆盖：对比度、accessible name、颜色非唯一表达、焦点和 reduced-motion。
- 提交边界由 Task 0 和 Task 8 覆盖：当前 PC-cloud 目标先归档，UI Goal 单独提交。

### Placeholder scan

计划不使用未定义的实现占位；每个代码任务都给出目标文件、接口/样式结构、测试命令和预期结果。

### Type consistency

计划沿用现有 `THEME_COLORS`、`getAntdTheme`、`useSettingsStore`、`useMonitorStore`、`PerceptionCards`、`BaseChart` 和 CSS Module 文件边界；没有引入新的状态层、组件库或后端接口。



