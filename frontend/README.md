# 路云天瞳 Web 前端

路云天瞳前端是比赛作品的主要线上展示入口。它将 Cloud Agent 的感知、预测、决策、事件和健康数据组织为实时仪表盘、三维路口和可回放的算法评估页面。线上提交能够完整展示 Web 界面和算法流程；开发板摄像头、无线网络、温度、功耗及物理吞吐属于硬件实测内容，无法仅通过浏览器完整呈现。

## 技术栈

- React 18 + TypeScript + Vite
- Three.js、`@react-three/fiber` 和 Drei：三维路口、目标和轨迹
- ECharts：性能、风险和算法指标图表
- Ant Design：表格、表单和状态控件
- Zustand：仪表盘、回放、评估和设置状态
- WebSocket + REST：实时消息与历史数据访问

## 页面与展示重点

| 路径 | 页面 | 评审时可观察的内容 |
|---|---|---|
| `/` | 综合仪表盘 | 系统状态、目标数量、风险等级、近期事件和核心 KPI |
| `/monitor` | 实时监控 | topic 消息、节点状态、连接状态、日志和订阅管理 |
| `/replay` | 历史回放 | 场景选择、事件时间线、逐帧回放和目标轨迹 |
| `/evaluation` | 算法评估 | ADE、FDE、Miss Rate、样本口径和评估报告 |
| `/settings` | 运行设置 | Cloud API、场景和允许在线修改的算法参数 |
| `/presentation` | 全屏演示 | 适合投屏或录制视频的集中式展示布局 |
| `/zhiluwujie` | 知路无界 | 三维路口、遮挡区、历史轨迹、未来预测和实时性能 |

## “知路无界”实时大屏

该页面是本次作品的核心可视化页面：

1. 通过 `node_id:track_id` 作为目标键，避免多个路口或节点的同号目标互相覆盖。
2. 历史位置使用实线，STGNN 未来 2 秒轨迹使用虚线，轨迹时间步带有相对 `t`。
3. 预测置信度从红色过渡到绿色，帮助评审快速识别低置信度目标。
4. 页面显示目标类别、速度、遮挡等级、风险状态和预测状态。
5. 后端有真值对齐时计算 ADE/FDE，并保留最近 100 个样本做滑动平均。
6. 性能面板从 `/health` 读取模型加载状态、最近推理耗时、GPU 显存和 SQLite 状态。
7. Cloud 尚未连接或真值不足时显示 fallback/stale/`--`，不会用 mock 数值伪装在线结果。

## 实时数据契约

前端连接：

```text
WebSocket: /api/v1/realtime/ws
REST:      /api/v1/health
           /api/v1/metrics
           /api/v1/replay/{scene_id}
           /api/v1/events
           /api/v1/evaluation
```

WebSocket 客户端可订阅：

```json
{
  "action": "subscribe",
  "topics": [
    "perception",
    "prediction",
    "decision",
    "event",
    "vehicle_status",
    "heartbeat"
  ]
}
```

预测消息中的核心结构：

```json
{
  "type": "prediction",
  "data": {
    "node_id": "rsu-01",
    "run_id": "run-001",
    "timestamp": 1710000000000,
    "predictions": [
      {
        "track_id": 7,
        "future_traj": [
          {"x": 12.8, "y": 3.1, "t": 0.1},
          {"x": 13.2, "y": 3.1, "t": 0.2}
        ],
        "confidence": 0.91
      }
    ]
  }
}
```

预测推送默认按 10Hz 限频。每个客户端使用独立有界队列；当客户端处理过慢时只丢弃该客户端最旧消息，不阻塞 Cloud 推理和其他订阅者。

## 数据源与降级状态

前端优先使用 Cloud REST/WebSocket 的真实数据。设置页可以修改 Cloud API 地址，也可通过 `VITE_CLOUD_API_BASE_URL` 注入运行时地址，WebSocket 地址由同一地址推导。

当 Cloud 不可用、模型尚未加载、历史长度不足或缺少可对齐真值时，页面会区分显示：

- `connecting`：正在建立连接。
- `stale`：已有数据但超过更新时间阈值。
- `fallback`：预测使用常速度基线或服务处于降级状态。
- `deferred`：历史帧不足，暂不产生 STGNN 预测。
- `--`：该指标当前没有可靠真实数据。

仓库中的 `src/mock` 仅服务于前端局部开发和组件回归，不作为线上性能指标来源。

## 本地启动

在项目根目录先启动 Cloud API，再启动前端：

```powershell
python -m uvicorn src.cloud_twin.api:app --host 127.0.0.1 --port 8000
```

另开终端：

```powershell
cd frontend
npm install
npm run dev
```

默认地址为 `http://localhost:3000`。也可以从根目录直接运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start_demo.ps1
```

## 构建、测试与规范检查

```powershell
npm run build
npm run test:unit
npm run lint
```

构建命令会先执行 TypeScript 类型检查，再生成 Vite 生产资源。单元测试覆盖运行时配置、设置接口、评估接口、数据源、Three.js 场景适配、轨迹对象池和场景目录。

## 前端目录约定

```text
src/
├─ app/                  # 路由、布局、全局主题
├─ pages/                # 页面级容器
├─ features/three-scene/ # 路口、道路、目标、遮挡区和轨迹组件
├─ widgets/              # 指标卡、事件表、消息流、风险列表等复用组件
├─ services/             # REST、WebSocket、运行时配置
├─ store/                # Zustand 状态与数据源选择
├─ types/                # Cloud、感知、预测、指标和事件类型
├─ mock/                 # 仅用于局部开发和测试的静态数据
└─ test/                 # 测试环境初始化
```

## 比赛演示建议

打开 `/zhiluwujie` 后启动一个 GP 场景，先观察遮挡目标出现，再切换到预测视图，说明实线/虚线、置信度和未来时间轴。随后进入 `/monitor` 展示 prediction topic 和健康数据，进入 `/replay` 回放同一风险事件，最后使用 `/evaluation` 说明 ADE/FDE 的数据口径。开发板物理交互和性能请结合单独上传的演示视频及硬件迁移文档说明。

接口字段和兼容规则详见根目录 [docs/API_SPEC.md](../docs/API_SPEC.md)，系统架构详见 [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)。
