# V2X 遮挡行人主动安全防御平台（前端演示版）

车路云一体化 V2X Ghost Probe 主动安全防御平台前端 UI 演示系统。

## 技术栈

- React 18 + TypeScript
- Vite 5
- Ant Design 5
- Zustand（状态管理）
- React Router 6（路由）
- ECharts 5（图表）
- Three.js + React Three Fiber（3D 可视化）

## 快速启动

```bash
cd frontend
npm install
npm run dev
```

开发服务器将在 http://localhost:3000 启动。

## 构建

```bash
npm run build
npm run preview
```

## 说明

- 本项目为纯前端 UI 演示版本，所有数据使用本地 mock 数据 + 定时器驱动
- 已预留后端 API 接口结构与 MQTT 连接状态管理
- 可直接作为答辩演示系统使用
