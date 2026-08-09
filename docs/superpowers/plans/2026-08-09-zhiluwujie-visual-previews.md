# 路云天瞳视觉预览 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不修改正式大屏源码的前提下，提供一个可在浏览器中切换 A/B/C 三套视觉方向的独立预览页面。

**Architecture:** 预览放在 `frontend/public/design-previews/`，由 Vite 作为静态资源提供。单个 HTML 负责复用当前页面的功能文案和状态结构，CSS 通过 `data-variant` 切换三套布局和视觉令牌，JS 负责模式、风险状态和方案切换；不依赖 React、Three.js 或后端。

**Tech Stack:** HTML、CSS、原生 JavaScript、Vite 静态资源服务。

---

### Task 1: 创建独立预览页面骨架

**Files:**
- Create: `frontend/public/design-previews/index.html`

- [ ] **Step 1: 创建预览页面结构**

  页面必须包含：方案选择器、正常/预警/制动状态切换、顶部系统状态、左侧指标和模式菜单、中间路口场景占位、右侧风险卡、底部事件时间线。所有文本使用当前大屏已有术语，不引入新的业务功能。

- [ ] **Step 2: 预留三套方案状态钩子**

  根节点使用 `data-variant="a"`、`data-variant="b"`、`data-variant="c"`，风险状态使用 `data-risk="normal"`、`data-risk="warn"`、`data-risk="brake"`，让同一套结构可以比较不同视觉方案。

### Task 2: 实现三套视觉方案

**Files:**
- Create: `frontend/public/design-previews/styles.css`

- [ ] **Step 1: 定义共用视觉令牌**

  使用深黑、石墨灰、米白、暖金作为基础色；黄色只表示预警，红色只表示危险。面板使用低对比度边界和有限阴影，禁止全屏扫描线和紫色大面积光晕。

- [ ] **Step 2: 实现方案 A**

  采用大留白、轻量侧栏、单一风险卡和细时间线，突出中心场景。

- [ ] **Step 3: 实现方案 B**

  采用三栏指挥中心网格，保留较多指标和日志，但降低面板透明度、圆角和边框装饰；作为当前功能的推荐迁移方向。

- [ ] **Step 4: 实现方案 C**

  采用大标题、事件叙事和底部阶段时间线，减少辅助卡片，适合汇报展示。

- [ ] **Step 5: 添加响应式和无障碍细节**

  在宽度低于 1100px 时收窄面板；在 `prefers-reduced-motion: reduce` 下关闭车辆漂移和面板动画；按钮和选项保留可见焦点样式。

### Task 3: 添加预览交互

**Files:**
- Create: `frontend/public/design-previews/preview.js`

- [ ] **Step 1: 实现方案切换**

  点击 A/B/C 后更新根节点 `data-variant` 和按钮选中状态，不改变当前风险或模式状态。

- [ ] **Step 2: 实现风险状态切换**

  点击正常、预警、制动后同步更新风险标签、TTC、风险百分比、阶段名称、事件日志和场景强调色。

- [ ] **Step 3: 实现模式菜单切换**

  点击单车聚焦、全路网流量、V2I 基础设施、算法参数时，只切换预览中的说明卡标题和辅助指标，确保四个现有模式都能在视觉稿中验证。

### Task 4: 验证预览入口

**Files:**
- Modify: none under `frontend/src/`

- [ ] **Step 1: 构建前端**

  Run: `npm run build` in `frontend/`

  Expected: Vite build succeeds without changing React source files.

- [ ] **Step 2: 启动静态预览**

  Run: `npm run dev -- --host 0.0.0.0 --port 5173` in `frontend/`

  Expected: `http://localhost:5173/design-previews/` returns the comparison page.

- [ ] **Step 3: 验证三套方案和状态切换**

  Check: A/B/C、正常/预警/制动、四个模式按钮均可点击；页面在 1920×1080 视口下不出现横向滚动条；正式大屏组件文件没有改动。
