# V2X Ghost-Probe Platform Goal Document

> 项目：分布式多智能体车路协同遮挡感知平台  
> 英文名：V2X Ghost-Probe Cooperative Perception Platform  
> 文档类型：项目目标总纲 / Goal Document  
> 对齐版本：v0.1  
> 生成日期：2026-07-06  
> 当前阶段：仿真阶段 MVP，M0 闭环已通，M1 三端联动进行中

---

## 1. 文档依据

本文档根据项目目录下已有文档综合整理，作为后续开发、答辩演示、验收评估和路线规划的统一目标文件。

主要依据：

| 文档 | 作用 |
|------|------|
| `项目介绍.md` | 项目背景、整体定位、模块说明 |
| `启动.md` | 启动方式、访问入口、运行验证 |
| `docs/MVP_REQUIREMENTS.md` | MVP 用户故事、功能需求、非功能需求、验收标准 |
| `docs/ARCHITECTURE.md` | 边-端-云总体架构、路侧/车端/云端模块设计 |
| `docs/API_SPEC.md` | MQTT Topic、REST API、WebSocket 接口规范 |
| `docs/DATA_MODEL.md` | DAIR-V2X 数据集、OccAware-STGNN 模型、评估指标 |
| `docs/implementation_plan_v1.md` | 仿真优先路线、阶段里程碑、场景设计 |
| `docs/END_TO_END_DEMO.md` | 当前已实现的端到端 demo、真实事件回放、验证方式 |
| `docs/superpowers/specs/2026-07-06-end-to-end-demo-design.md` | 端到端 demo 设计规格 |
| `docs/superpowers/plans/2026-07-06-end-to-end-demo.md` | 端到端 demo 实施计划 |

### 1.1 与项目介绍的对齐基线

本文档以 `E:\路云天瞳\项目介绍.md` 作为项目定位的主基线，并与仓库内 `项目介绍.md`、`docs/` 目录下的需求、架构、接口和数据模型文档交叉校准。

`GOAL.md` 需要始终对齐以下项目介绍要点：

| 对齐项 | 项目介绍中的定义 | 本文档中的承接方式 |
|--------|------------------|--------------------|
| 项目全称 | 分布式多智能体车路协同遮挡感知平台 | 作为项目总目标和交付边界 |
| 英文名 | V2X Ghost-Probe Cooperative Perception Platform | 作为平台英文标识 |
| 当前状态 | 仿真阶段 MVP，M0 闭环已通，M1 进行中 | 用阶段目标区分 M0/M1/M2/M3 |
| 核心链路 | 路侧先行感知 -> V2X 通信 -> 车端协同决策 -> 云端孪生可视化 | 作为系统主数据流和验收主线 |
| 核心场景 | 鬼探头 / pedestrian dart-out | 作为 MVP 和后续实验的主验证场景 |
| 预警价值 | 路侧感知比单车感知提前 1.5-3 秒 | 作为研究成功标准之一 |
| 风险可视化 | 云端 3D 孪生实时展示并支持回放 | 作为 Cloud Agent 与前端平台目标 |
| 平滑降级 | 通信中断时车端切换纯自车模式 | 作为 Vehicle Agent 非功能目标 |
| 低成本验证 | 仿真阶段零硬件成本，便于迁移实体平台 | 作为仿真优先路线依据 |

---

## 2. 项目愿景

本项目目标是构建一个面向自动驾驶遮挡危险场景的 **车路云协同主动安全防御平台**。

系统通过路侧感知提前发现单车视角无法看到的遮挡行人，将感知与轨迹预测结果通过 V2X 通信传递给车端；车端融合自车状态与路侧共享信息，完成 TTC 风险评估、碰撞概率估计和分级制动决策；云端孪生平台负责实时可视化、数据持久化、高危事件检索和历史回放。

最终希望证明：

1. **车路协同能突破单车感知遮挡盲区。**
2. **提前感知与轨迹预测能扩大车端决策窗口。**
3. **云端孪生能让高危事件可视化、可追溯、可复盘。**
4. **仿真优先路线能在低成本、低风险条件下验证系统闭环，再平滑迁移到 Jetson / 小车 / 真实路侧设备。**

---

## 3. 核心问题

### 3.1 场景问题

项目聚焦城市道路中的“鬼探头”场景：

- 行人被停放车辆、公交车、路边障碍物等遮挡。
- 自车摄像头/雷达因物理视线限制无法提前感知。
- 行人突然进入机动车道后，单车系统识别和制动窗口过短。
- 传统单车智能难以在极短时间内完成检测、预测、决策和制动。

### 3.2 系统问题

要解决该场景，系统必须同时满足：

- 路侧能提前看到遮挡目标。
- 路侧能输出目标位置、遮挡等级和未来轨迹。
- 通信链路能低延迟传递感知结果。
- 车端能在接收路侧信息后快速计算风险和制动策略。
- 通信异常时车端不能崩溃，必须平滑退化。
- 云端必须能实时展示态势，并支持事件回放与数据分析。

---

## 4. 总目标

### 4.1 一句话目标

在“鬼探头”场景下，路侧感知提前识别遮挡行人，通过 V2X 通信传递给车端完成主动制动，全过程在云端孪生平台实时可视化，并支持事件检索、历史回放和实验评估。

### 4.2 总体交付形态

最终系统应包含以下交付物：

| 类型 | 交付物 |
|------|--------|
| 后端服务 | FastAPI Cloud API、WebSocket 实时推送、事件与帧数据查询 |
| 路侧智能体 | 路侧检测、遮挡估计、轨迹预测、MQTT 发布 |
| 车端智能体 | 路侧消息订阅、TTC 风险评估、分级制动、降级状态机 |
| 云端孪生 | 数据持久化、事件检测、实时消息缓冲、历史回放接口 |
| 前端平台 | 总览大屏、实时监控、事件回放、模型评估、系统设置 |
| 仿真 demo | 不依赖硬件/YOLO/MQTT 的端到端鬼探头演示闭环 |
| 数据与模型 | DAIR-V2X 数据处理、OccAware-STGNN 轨迹预测目标方案 |
| 部署文档 | Windows / Docker / 手动启动指南 |
| 测试体系 | 后端单元测试、前端构建检查、接口手动验证清单 |

### 4.3 目标与代码入口对齐

为保证目标文档能直接指导后续开发，核心目标需要能映射到项目介绍中明确列出的代码入口、配置文件和运行组件。

| 目标域 | 主要入口 | 配置 / 支撑文件 | 目标说明 |
|--------|----------|-----------------|----------|
| 路侧感知 | `src/roadside_perception/roadside_agent.py` | `configs/roadside.yaml` | 完成检测、遮挡估计、轨迹预测和 perception 消息发布 |
| 目标检测 | `src/roadside_perception/detector.py` | `detection.mode`、YOLOv8 权重 / DAIR-V2X 标注 | 支持 `annotations` 标注直读和 `yolo` 推理两种模式 |
| 遮挡估计 | `src/roadside_perception/occlusion_estimator.py` | 遮挡区域、bbox 可见面积阈值 | 输出 occlusion_level 0-3 |
| 轨迹预测 | `src/roadside_perception/trajectory_predictor.py`、`src/roadside_perception/stgnn_model.py`、`src/roadside_perception/stgnn_predictor.py` | `prediction.backend`、`history_length`、`predict_steps`、`model_path` | 输出未来 30 步轨迹预测，支持常速度 baseline 与 ST-GNN checkpoint 接入 |
| 数据回放 | `src/roadside_perception/replay_engine.py` | DAIR-V2X clip / 合成场景 | 按固定帧率驱动路侧感知流程 |
| 车端决策 | `src/vehicle_decision/vehicle_agent.py` | `configs/vehicle.yaml` | 订阅路侧感知，输出车辆状态和制动决策 |
| 风险评估 | `src/vehicle_decision/risk_assessor.py` | TTC 阈值、风险等级配置 | 输出 SAFE/WARNING/DANGER/EMERGENCY |
| 制动控制 | `src/vehicle_decision/brake_controller.py` | 最大减速度、jerk 限制 | 输出分级 brake_decel |
| 平滑降级 | `src/vehicle_decision/fallback_manager.py` | 超时阈值、恢复时长 | 支持 cooperative/degraded/recovering |
| 通信协议 | `src/communication/mqtt_client.py`、`src/communication/protocol.py` | `configs/mqtt.yaml`、Mosquitto | 统一 MQTT Topic、JSON 消息和重连行为 |
| MQTT 配置覆盖 | `src/communication/mqtt_config.py` | `MQTT_HOST`、`MQTT_PORT` | 支持容器环境用服务名连接 Broker |
| 云端孪生 | `src/cloud_twin/cloud_agent.py` | `configs/cloud.yaml` | 汇聚 MQTT 数据、落库、推送 WebSocket、触发事件 |
| REST API | `src/cloud_twin/api.py` | FastAPI / CORS 配置 | 提供健康检查、帧查询、事件查询、回放和 demo 控制 |
| 运行配置 | `src/cloud_twin/runtime_config.py` | `data/runtime_config.json` | 持久化场景阈值、刷新频率和 Cloud API 地址 |
| 数据存储 | `src/cloud_twin/data_store.py` | SQLite WAL / `data/` | 存储 frames、events、metrics 并支撑历史回放 |
| 仿真闭环 | `src/cloud_twin/demo_engine.py` | 内置 ghost-probe 场景 | 在无硬件、无 MQTT、无 YOLO 条件下跑通端到端演示 |
| 前端平台 | `frontend/src/pages/`、`frontend/src/widgets/`、`frontend/src/store/` | React + TypeScript + Vite | 展示总览、监控、回放、评估和设置页面 |
| 部署启动 | `docker-compose.yml`、`deployment/mosquitto.conf`、`scripts/` | Docker / Windows PowerShell / Bash | 支持本地开发、Broker 启动和后续一键演示 |

---

## 5. 阶段目标

### M0：可运行端到端演示闭环

目标：让系统不依赖硬件、Mosquitto、YOLO、PyTorch，也能完整展示鬼探头数据流。

当前状态：**已基本完成**。

已实现能力：

- 后端 `DemoEngine` 生成确定性的 ghost-probe 场景。
- 后端可通过 `/api/v1/demo/start|stop|step|status` 控制演示。
- 后端向 WebSocket 推送 `perception`、`vehicle_status`、`decision`、`event`。
- 后端持久化 frames 和 events。
- 前端实时监控页可启动/停止/单步推进 demo。
- 前端默认连接真实 `ws://localhost:8000/api/v1/realtime/ws`，并可在 `/settings` 配置 Cloud API 地址以适配自定义后端端口。
- 后端提供 `/api/v1/config/{scene_id}` 运行配置 API，可持久化风险阈值、TTC 阈值、刷新频率和 Cloud API 地址。
- 前端 `/settings` 页可从云端加载、保存 `scene_001` 配置；后端不可用时保留本地配置。
- 前端 mock 数据仅作为后端不可用时的 fallback。
- 事件回放页已接入真实 `/api/v1/events` 和 `/api/v1/events/{event_id}`。
- Three.js 回放能展示车辆、行人、停放车辆、风险分、TTC 和制动状态。

验收标准：

| 标准 | 当前状态 |
------|----------|
| 可打开 `http://localhost:3000/monitor` 看到实时数据 | 已完成 |
| 可通过按钮启动/停止 demo | 已完成 |
| 可打开 `http://localhost:3000/replay` 选择真实事件回放 | 已完成 |
| `/api/v1/messages/recent` 有持续消息 | 已完成 |
| `/api/v1/events/{event_id}` 返回 `replay_frames` | 已完成 |
| 后端单元测试通过 | 已完成 |
| 前端 `npm run build` 通过 | 已完成，已拆分 ECharts / Three vendor chunk |
| 前端 `npm run lint` 通过 | 已完成 |
| 前端 Cloud API 地址可配置 | 已完成，REST 与 WebSocket 统一派生 |
| 设置页接入真实配置 API | 已完成，配置持久化到 `data/runtime_config.json` |

### M1：仿真路侧 + 车端协同链路

目标：从内置 demo loop 过渡到 Roadside Agent、Vehicle Agent、Cloud Agent 三端协作。

需要完成：

- 安装并启动 Mosquitto 或 Docker MQTT Broker。
- 修复/完善 Windows 下多进程启动脚本。
- 让 `RoadsideAgent` 通过 `ReplayEngine` 按 10 FPS 发布仿真感知数据。
- 让 `VehicleAgent` 订阅 perception，输出 status 和 decision。
- 让 `CloudAgent` 订阅所有 MQTT Topic 并落库、广播。
- 前端仍通过 Cloud API WebSocket 接收统一数据。

验收标准：

- 路侧 → MQTT → 车端 → MQTT → 云端 → WebSocket → 前端全链路跑通。
- 端到端延迟在局域网内目标小于 100 ms。
- 断开路侧消息后，车端在配置时间内进入 degraded。
- 恢复路侧消息后，车端进入 recovering 并渐进恢复 cooperative。

### M2：数据集与模型评估闭环

目标：接入 DAIR-V2X mini split，完成遮挡目标检测、轨迹预测、评估指标输出。

需要完成：

- 构建 DAIR-V2X mini split。
- 统一项目内部帧格式。
- 形成 replay 数据集目录。
- 接入 YOLOv8 或标注驱动检测模式。
- 实现/接入 OccAware-STGNN 或轻量轨迹预测 baseline。
- 输出 ADE、FDE、Occ-ADE、Occ-Acc、FPS、E2E-Lat、Lead-Time 指标。
- 前端模型评估页读取真实评估结果。

当前进展：

- DAIR-V2X 风格目录扫描、manifest 与 replay clip 生成入口已完成。
- 无真实 DAIR-V2X 数据时，可通过 `scripts/build_dair_mini_split.py --demo-sample` 生成 DAIR 风格鬼探头样例，验证 build -> replay clip -> evaluation 工程链路。
- `scripts/verify_dair_dataset.py` 已提供 DAIR-V2X 风格数据目录发现与严格验收入口，可扫描 `infrastructure-side/image` + `label` 结构、区分项目生成的 `demo_dair_sample` 与真实候选，并输出下一步 `build_dair_mini_split.py --dair-root ...` 命令。当前机器扫描 `E:\路云天瞳` 仅发现 2 个生成样例，`real_candidate_count=0`；`--require-real` 会按预期失败，说明真实 DAIR-V2X 数据仍未落盘。
- 标注驱动检测模式已可保留 `occlusion_level`。
- `scripts/evaluate_mini_split.py` 已提供常速度轨迹预测 baseline，可从 replay clip 输出 `evaluation.json`。
- `src/dataset/stgnn_training_data.py` 与 `scripts/build_stgnn_training_data.py` 已提供从 replay clip 导出 OccAware-STGNN 监督样本的入口，输出 `samples.jsonl` 和 `manifest.json`，样本包含历史 8 维节点特征、未来轨迹标签和遮挡标签。
- `src/roadside_perception/stgnn_model.py` 已提供 OccAware-STGNN PyTorch 模型骨架（密集图注意力 + GRU + 轨迹/遮挡双头），并支持 TorchScript checkpoint 导出。
- `src/roadside_perception/stgnn_predictor.py` 已提供 OccAware-STGNN 接入适配器，可构建 8 维节点特征 `[cx, cy, w, h, vx, vy, cls, occ_score]`，支持配置 TorchScript checkpoint；无权重或加载失败时明确回落到常速度预测，不将 fallback 冒充真实模型结果。
- `scripts/train_stgnn.py` 已提供 OccAware-STGNN 训练入口，轻量环境可用 `--dry-run` 校验样本和训练配置；健康 torch 环境下可执行监督训练并导出 TorchScript checkpoint。
- `scripts/evaluate_stgnn_checkpoint.py` 已提供 OccAware-STGNN checkpoint 评估入口，轻量环境可用 `--dry-run` 校验样本、checkpoint 路径和报告结构；健康 torch 环境下可加载训练后 TorchScript checkpoint 并输出 ADE、FDE、Occ-ADE、Occ-Acc、FPS 和延迟指标。
- `scripts/verify_algorithm_pipeline.py` 已提供 M2 算法流水线验收入口，可在轻量环境执行 build -> replay -> baseline evaluation -> ST-GNN sample export -> checkpoint evaluation dry-run，也可在算法环境中通过 `--real-stgnn` 执行小样本真实训练和 checkpoint 评估。
- `scripts/export_stgnn_checkpoint.py` 已提供模型规格查看和 TorchScript checkpoint 导出入口；当前导出的 checkpoint 为随机初始化集成测试权重，不能作为训练后指标结果。
- `scripts/evaluate_mini_split.py --replay-dir` 已支持对多个 replay clip 生成目录级聚合评估报告。
- `src/dataset/yolo_detection_evaluator.py` 与 `scripts/evaluate_yolo_detection.py` 已提供 YOLO 检测离线批量评估入口，可对 mini split `manifest.json` 中的图片执行检测并与 DAIR 标注计算 precision、recall、F1、TP/FP/FN、per-class 统计、平均延迟和 FPS。
- `scripts/evaluate_yolo_detection.py --dry-run` 已支持使用标注作为完美检测器，当前可在生成样例 manifest 上验证报告结构和前端接入链路；该 dry-run 不等同于真实 YOLO 或真实 DAIR-V2X 指标。
- `/api/v1/evaluation` 默认读取 `data/mini_split/evaluation.json`，支持通过 `report=stgnn_checkpoint` 读取 `data/mini_split/stgnn_evaluation.json`，也支持 `V2X_EVALUATION_DIR` 和 `V2X_EVALUATION_REPORT` 覆盖报告来源；无离线报告时回退 demo runtime 聚合结果。
- `/api/v1/evaluation` 已支持通过 `report=yolo_detection` 读取 `data/mini_split/yolo_detection.json`，`/api/v1/evaluation/reports` 已提供可用评估报告列表，供前端在 mini split baseline、ST-GNN checkpoint 与 YOLO Detection Offline 报告之间切换。
- 离线评估和 demo runtime 评估报告都会输出 `targetStatus`，自动按 ADE、FDE、Occ-ADE、Occ-Acc、FPS、E2E-Lat、Lead-Time 阈值标记 `pass/fail/unknown`。
- 前端模型评估页已可展示离线评估中的 ADE、FDE、Occ-ADE、Occ-Acc、FPS、Avg-Lat、E2E-Lat、Lead-Time 和指标达标状态，并支持在 mini split、ST-GNN checkpoint、YOLO Detection Offline 等可用离线报告之间切换。

验收标准：

| 指标 | 目标 |
------|------|
| 行人检测 recall | > 0.7 |
| ADE | < 1.0 m |
| FDE | < 2.0 m |
| Occ-ADE | < 1.5 m |
| 遮挡分类准确率 | >= 70% |
| 路侧推理帧率 | >= 10 FPS |
| 端到端延迟 | < 100 ms |
| 提前预警时间 Lead-Time | >= 1.5 s |

### M3：部署与实体迁移

目标：从纯虚拟仿真迁移到 Jetson / 华为网联小车 / 路侧相机或沙盘环境。

需要完成：

- Jetson Orin 路侧部署。
- 小车端运行 Vehicle Agent。
- 标定真实路侧相机坐标系。
- 替换 MQTT 自定义消息为可迁移 V2X 消息封装。
- 完成实体沙盘鬼探头场景演示。

验收标准：

- 真实设备可跑通至少 1 个鬼探头演示。
- 小车在高危场景触发制动或模拟制动指令。
- 云端实时显示车辆、行人、事件和回放。

---

## 6. 功能目标

### 6.1 路侧感知目标

| 编号 | 目标 | 输入 | 输出 | 验收 |
|------|------|------|------|------|
| RP-01 | 行人/车辆检测 | 路侧图像帧或标注帧 | bbox、类别、置信度、track_id | DAIR-V2X 上 mAP >= 0.5 |
| RP-02 | 遮挡状态估计 | bbox、历史轨迹、遮挡标注 | occlusion_level 0-3 | 遮挡分类准确率 >= 70% |
| RP-03 | 轨迹预测 | 连续 N 帧目标状态 | 未来 30 步轨迹 | ADE < 1.0 m，FDE < 2.0 m |
| RP-04 | 数据发布 | 感知结果 | MQTT perception message | 单帧消息 < 10 KB |
| RP-05 | 回放驱动 | replay clip | 10 FPS 感知流 | 无真实数据时自动生成 demo |

### 6.2 车端决策目标

| 编号 | 目标 | 输入 | 输出 | 验收 |
|------|------|------|------|------|
| VD-01 | 感知消息接收 | MQTT perception | objects、predicted_trajs | 解码延迟 < 10 ms |
| VD-02 | TTC 风险评估 | 自车状态 + 目标轨迹 | SAFE/WARNING/DANGER/EMERGENCY | TTC 误差 < 0.5 s |
| VD-03 | 碰撞概率估计 | TTC、轨迹交汇关系 | collision_prob | 高危场景概率明显升高 |
| VD-04 | 分级制动 | risk_level、speed | brake_decel | 紧急场景响应 < 200 ms |
| VD-05 | 平滑退化 | 通信状态 | cooperative/degraded/recovering | 断连后自动降级 |

### 6.3 云端孪生目标

| 编号 | 目标 | 输入 | 输出 | 验收 |
|------|------|------|------|------|
| CT-01 | 实时消息汇聚 | MQTT / demo engine | WebSocket broadcast | 前端实时更新 |
| CT-02 | 数据持久化 | perception/status/decision/event | SQLite frames/events | 数据完整性 > 99% |
| CT-03 | 高危事件检测 | decision TTC + risk_level | ghost_probe event | 支持查询和详情 |
| CT-04 | 历史回放 | event_id / scene_id | replay_frames | 支持倍速播放 |
| CT-05 | 运行指标 | 系统状态 | metrics API | 可用于总览页展示 |

### 6.4 前端平台目标

| 页面 | 目标 | 当前状态 |
|------|------|----------|
| 总览大屏 `/` | KPI、风险列表、趋势、日志 | 已有 mock + real update 支持 |
| 实时监控 `/monitor` | 连接状态、demo 控制、感知/决策卡片、消息面板 | 已接入真实 WebSocket |
| 事件回放 `/replay` | 事件列表、3D 回放、TTC/风险曲线 | 已接入真实 events/replay_frames |
| 模型评估 `/evaluation` | 指标、对比实验、图表 | 已接入 demo runtime、mini split、ST-GNN checkpoint 与 YOLO detection 离线报告选择入口，待接真实 DAIR-V2X 达标结果 |
| 系统设置 `/settings` | 主题、连接、阈值配置 | 已接入真实配置 API，支持云端加载/保存和本地导入导出 |

### 6.5 通信目标

必须支持以下消息类型：

- `perception`
- `vehicle_status`
- `decision`
- `heartbeat`
- `event`

Topic 设计：

```text
v2x/{scene_id}/roadside/{node_id}/perception
v2x/{scene_id}/roadside/{node_id}/heartbeat
v2x/{scene_id}/vehicle/{vehicle_id}/status
v2x/{scene_id}/vehicle/{vehicle_id}/decision
v2x/{scene_id}/cloud/event
v2x/{scene_id}/cloud/command
```

---

## 7. 非功能目标

| 类别 | 指标 | 目标 |
|------|------|------|
| 实时性 | 路侧感知 → 车端决策延迟 | < 100 ms |
| 帧率 | 路侧感知 / demo replay | >= 10 FPS |
| 可视化 | Three.js 场景渲染 | 目标 30 FPS |
| 消息可靠性 | MQTT QoS | perception/decision QoS 1，event QoS 2 |
| 可恢复性 | 通信断连 | 车端自动 degraded，恢复后 recovering |
| 可运行性 | 无硬件 demo | 必须可单机运行 |
| 可演示性 | 启动到可见数据 | 目标 1 条命令或脚本完成 |
| 可测试性 | 核心行为测试 | demo engine、store、API 至少有单元测试 |
| 可维护性 | 模块边界 | 路侧/车端/云端/前端职责清晰 |

---

## 8. 当前进度快照

### 8.1 已完成

- 项目文档体系基本形成。
- FastAPI Cloud API 可运行。
- WebSocket 实时接口可用。
- SQLite `frames` / `events` 存储可用。
- SQLite Windows 写入异常已有 TEMP fallback。
- `DataStore.store_event()` 已补齐。
- `DemoEngine` 已实现可控 ghost-probe demo。
- `/api/v1/demo/start|stop|step|status` 已实现。
- demo loop 已支持 `light` / `moderate` / `heavy` 三类鬼探头强度场景。
- `/api/v1/evaluation` 已输出基于 demo runtime 的评估 JSON。
- `scripts/build_dair_mini_split.py` 已提供 DAIR-V2X mini split manifest / replay clip 生成入口。
- `scripts/build_dair_mini_split.py --demo-sample` 已提供无真实数据时的 DAIR 风格样例生成入口，可产出 `data/demo_dair_sample`、`data/mini_split/replay/clip_001.json` 并继续生成 `evaluation.json`。
- `scripts/evaluate_mini_split.py` 已提供 DAIR-V2X mini split 离线评估入口，输出 ADE、FDE、Occ-ADE、Occ-Acc、FPS、E2E-Lat、Lead-Time 等指标。
- `scripts/evaluate_mini_split.py --replay-dir` 已提供多 replay clip 批量评估和 `clip_count` / `clips` 聚合摘要。
- `scripts/verify_m2_demo_sample.py` 已提供 M2 样例评估验收入口，可自动生成 DAIR 风格样例、构建 replay clip、写出 `evaluation.json`、`stgnn_evaluation.json` 和 `yolo_detection.json`，并验证 baseline 目标状态、ST-GNN dry-run 报告结构和 YOLO detection dry-run 报告链路。
- `scripts/verify_model_readiness.py` 已提供 YOLO/ST-GNN 算法环境 readiness 诊断入口，默认输出 Python、ultralytics、torch、torchvision、torch_geometric 可用性；可通过 `--require-yolo` / `--require-stgnn` 在算法环境中强制验收。
- `environment-algorithm.yml` 已提供 Python 3.11 Conda 算法环境规格，包含 PyTorch、torchvision、ultralytics、torch-geometric 和项目运行依赖；默认使用 CPU 基线，后续可按 GPU/CUDA 机器替换 PyTorch channel 配置。
- `.github/workflows/algorithm.yml` 已提供手动触发和每周调度的算法环境验证 workflow，会用 `environment-algorithm.yml` 创建 Conda 环境，强制运行 YOLO/ST-GNN readiness、YOLO 真实图片推理和 `verify_algorithm_pipeline.py --real-stgnn` 小样本真实训练/checkpoint 评估。
- 当前机器已创建并验收 `v2x-ghost-algorithm` Conda 环境，强制 readiness 通过：Python 3.11.15、ultralytics 8.4.89、torch 2.5.1、torchvision 0.20.1、torch_geometric 2.8.0。
- `scripts/verify_yolo_image_inference.py` 已提供 YOLOv8 真实图片推理验收入口，默认使用 ultralytics 包内 `bus.jpg` 真实照片和 `yolov8n` 权重；当前机器已在 `v2x-ghost-algorithm` 环境通过一次真实推理烟测，输出 `detection_count=4`，类别包含 `bus` 和 `person`。权重缓存到 `data/model_cache`，不污染项目根目录。
- `src/dataset/yolo_detection_evaluator.py` 已提供 YOLO 检测结果与 DAIR 标注的 IoU 匹配、总体 precision/recall/F1、TP/FP/FN、per-class 统计、逐帧检测摘要、平均延迟和 FPS 计算。
- `scripts/evaluate_yolo_detection.py` 已提供 mini split manifest 批量检测评估入口，支持真实 `Detector(mode="yolo")` 推理和 `--dry-run` 标注完美检测器两种模式，默认输出 `data/mini_split/yolo_detection.json`。
- 已在 `v2x-ghost-algorithm` 环境完成一次 ST-GNN 小样本真实训练和 checkpoint 评估烟测，生成 `stgnn_checkpoint_offline` 报告；该烟测证明算法链路可运行，但 ADE/FDE 尚未达标，不能替代真实 DAIR-V2X 训练结果。
- `/api/v1/evaluation` 已支持读取离线评估产物 `data/mini_split/evaluation.json`、`data/mini_split/stgnn_evaluation.json` 与 `data/mini_split/yolo_detection.json`，并可通过 query 参数选择报告。
- `/api/v1/evaluation/reports` 已支持枚举可用评估报告，包括 `YOLO Detection Offline`。
- `/api/v1/evaluation` 已支持 `targetStatus` 指标达标状态，并能为旧离线评估 JSON 自动回填该字段。
- `/api/v1/evaluation` 已输出 `leadTime`，离线 mini split 按首次遮挡帧到目标暴露帧计算，demo runtime 按首次 WARNING/DANGER/EMERGENCY 预警帧到 ghost_probe 事件计算。
- `scripts/start_demo.ps1` 已提供 Windows 一键演示启动入口，可检查依赖、按需安装前端依赖、启动 Cloud API、启动 demo loop、启动前端 dev server、打开 `/monitor`，并在自定义后端端口时通过 `VITE_CLOUD_API_BASE_URL` 自动让前端连接对应 Cloud API。
- `scripts/start_mqtt_demo.ps1` 已提供 Windows 三端 MQTT 联动启动入口。
- `scripts/verify_inmemory_mqtt_demo.py` 已提供无外部 Broker 的三端 topic 流验证模式，并可验证车端 `cooperative -> degraded -> recovering` 状态转换；验证摘要已输出 `avg_e2e_latency_ms`、`max_e2e_latency_ms`、`e2e_latency_sample_count`、`latency_target_ms=100.0` 和 `latency_target_passed`，用于持续覆盖 M1 “端到端延迟 < 100 ms”的轻量验收证据。
- `scripts/verify_m1_acceptance.py` 已提供 M1 本地验收聚合入口，默认运行 brokerless 三端链路并汇总完整合并帧、ghost_probe 事件、`brake_decel > 0` 制动决策、fallback 恢复和 100ms 延迟目标；任一门槛失败会返回非零退出码，本地 `verify_all.ps1` 与 GitHub Actions 基础 CI 已纳入该检查。
- `scripts/verify_mqtt_broker_demo.py` 已提供真实 MQTT Broker 预检/验收入口；当前机器未安装 Mosquitto/Docker 且 1883 未监听，因此外部 Broker 链路仍待具备环境后运行。
- `scripts/verify_embedded_mqtt_broker_demo.py` 已提供嵌入式 `amqtt` TCP Broker 验收入口；当前机器已在 `v2x-ghost-algorithm` 环境通过真实网络三端闭环：`complete_frames=80`、`event_count=1`、`fallback_verified=true`，证明 Roadside Agent -> TCP MQTT Broker -> Vehicle Agent -> TCP MQTT Broker -> Cloud Agent 链路可运行。该结果不替代 Mosquitto/Docker 外部 Broker 验收。
- `RoadsideAgent.process_frame()` 已支持预计算 `perception` 帧输入，可用于将确定性的 heavy ghost-probe 场景通过真实 MQTT 链路发布，同时保持 Roadside Agent 作为发布端。
- `configs/vehicle.yaml` 默认自车速度已调整为沿 x 负方向接近路口，与 `ReplayEngine` 合成鬼探头场景保持一致。
- `scripts/verify_all.ps1` 已提供本地一键验证入口，可串行运行后端单元测试、DAIR 数据集发现脚本测试、ST-GNN 模型/适配器/训练样本/训练脚本/checkpoint 评估/算法流水线 dry-run 测试、内存三端 MQTT 验证、M2 DAIR 风格样例评估验证、YOLO/ST-GNN 环境 readiness 诊断、前端 unit/lint/build。
- `.github/workflows/ci.yml` 已提供基础 CI，覆盖轻量 Python 依赖下的后端测试、DAIR 数据集发现脚本测试、ST-GNN 模型/适配器/训练样本/训练脚本/checkpoint 评估/算法流水线 dry-run 测试、brokerless MQTT 验证、Ubuntu Mosquitto 外部 Broker 三端验证、M2 DAIR 风格样例评估验证、模型环境 readiness 诊断和前端 test/lint/build。
- `docker-compose.yml` 已扩展为前端、Cloud API、Mosquitto 基础栈，并提供 `mqtt-demo` profile 启动 CloudAgent、VehicleAgent、ReplayEngine 三端容器。
- `deployment/frontend.Dockerfile` 与 `deployment/nginx.frontend.conf` 已提供前端静态站点容器构建入口。
- 后端/三端容器已支持 `MQTT_HOST` / `MQTT_PORT` 环境变量覆盖，可在 Compose 网络中连接 `mosquitto` 服务名。
- `scripts/verify_docker_compose_config.py` 已提供不依赖 Docker daemon 的 Compose 部署合同验证入口，可检查服务数量、Dockerfile 路径、端口映射、`depends_on`、`mqtt-demo` profile、Mosquitto 配置挂载和容器内 MQTT 环境变量；本地 `verify_all.ps1` 与 GitHub Actions 基础 CI 已纳入该检查。
- `scripts/verify_startup_docs.py` 已提供启动文档覆盖验证入口，可检查 `启动.md` 是否统一覆盖一键启动、浏览器入口、手动启动、快速验证、MQTT 三端、Docker Compose、DAIR-V2X、算法环境、YOLO/ST-GNN、故障排查和相关文档；本地 `verify_all.ps1` 与 GitHub Actions 基础 CI 已纳入该检查。
- `scripts/verify_external_readiness.py` 已提供外部验收环境 readiness 汇总入口，默认非阻塞输出真实 DAIR-V2X、Docker/Compose、外部 MQTT Broker、YOLO/ST-GNN 算法环境状态；可通过 `--require-real-dair`、`--require-docker`、`--require-broker`、`--require-algorithm` 切换为严格失败模式。本地 `verify_all.ps1` 与 GitHub Actions 基础 CI 已纳入默认预检，用于持续暴露剩余外部条件缺口。
- 路侧 `Detector` 已支持 `annotations` / `yolo` / `auto` 模式；默认 `configs/roadside.yaml` 使用 `annotations`，因此 DAIR replay、合成 replay、CI 和轻量容器 demo 不再依赖 `ultralytics`。
- 前端 monitor 页接入 demo 控制与实时 WebSocket。
- 前端 monitor 页已支持选择 demo 场景强度。
- 前端总览页已增加 live/mock 数据源标记，并在 Cloud API WebSocket 仍连接时阻止 fallback mock 更新覆盖 live 总览数据；相关规则已纳入前端单元测试，降低 mock 与 real 数据混用造成的状态混乱。
- 前端设置页已支持配置 Cloud API 地址，REST 请求与 WebSocket 连接会跟随该地址切换。
- 前端设置页已接入 `/api/v1/config/{scene_id}`，可加载/保存运行配置。
- 后端 `RuntimeConfigStore` 已将场景运行配置持久化到 `data/runtime_config.json`，并校验阈值范围和 URL 协议。
- 前端 replay 页接入真实事件与真实回放帧。
- 前端 evaluation 页已优先读取真实评估 JSON，支持显示离线评估遮挡指标和达标状态，并可切换 mini split / ST-GNN checkpoint 报告；后端不可用时回退 mock。
- 后端单元测试 `tests/test_demo_engine.py` 已覆盖 demo 和事件回放。
- 前端 `npm run build` 已通过。
- 前端 `npm run lint` 已通过，实时 payload 已补最小类型定义。
- 前端构建已配置 ECharts / Three 手动拆包，当前 build 无 Vite 大 chunk 警告。
- `.gitignore` 已覆盖 Python 缓存、日志、运行数据、SQLite、前端依赖/构建产物、前端测试临时目录、模型 checkpoint/export 目录，以及本地误生成的 `路云天瞳/` 副本目录，降低误提交生成物的风险。

### 8.2 部分完成

- `RoadsideAgent`、`VehicleAgent`、`CloudAgent` 代码存在，Windows MQTT 三端联动脚本已补齐；无 Broker 时可用内存总线验证 topic 流、同帧合并、高危事件生成、制动决策、端到端延迟目标和车端降级恢复状态；当前机器已用嵌入式 `amqtt` 完成真实 TCP Broker 闭环验证；GitHub Actions 已加入 Ubuntu Mosquitto 外部 Broker 验收；当前 Windows 本机有 Mosquitto/Docker 时仍可运行 `scripts/verify_mqtt_broker_demo.py` 完成本机外部 Broker 实机通过。
- 前端总览页可接收真实数据，并已明确 live/mock 数据源与连接状态下的 mock 覆盖保护；仍保留断连 fallback mock 初始状态，用于无后端演示。
- 模型评估页已接入 demo runtime 聚合指标、mini split 离线评估产物、ST-GNN checkpoint 评估产物和 YOLO detection 离线检测报告选择入口；算法环境中的 ST-GNN 小样本真实训练/评估烟测已完成，YOLO detection dry-run 报告链路已打通，真实 DAIR-V2X 训练/检测后的模型评测仍待运行。
- M2 数据集入口已具备 DAIR-V2X 风格目录发现/严格验收、DAIR 风格 demo sample 生成、项目内部 replay clip 生成、常速度 baseline 评估、多 clip 聚合评估和 ST-GNN 训练样本导出能力；当前机器只发现生成样例，待接入真实 DAIR-V2X 数据目录运行。
- OccAware-STGNN 已具备训练样本导出、训练脚本、checkpoint 评估脚本、模型骨架、Roadside Agent 配置入口（`prediction.backend: stgnn`、`prediction.model_path`）、TorchScript checkpoint 导出和推理适配器；真实训练后 checkpoint 和 DAIR-V2X 指标复核仍未完成。
- 路侧检测已具备标注直读模式和 YOLO 模式切换入口；`detection.mode: yolo` 在帧同时包含 image 与 annotations 时会优先走图片推理，默认配置仍走标注/回放模式；当前机器已完成 YOLOv8n 真实图片推理烟测，并已具备 mini split manifest 批量检测评估脚本和 dry-run 报告链路，但 DAIR-V2X 真实图片批量检测指标仍未完成。
- Docker Compose 已覆盖前端、Cloud API、Mosquitto 基础栈和 `mqtt-demo` 三端容器 profile，并已具备无 Docker daemon 的配置合同验证；当前机器缺少 Docker 命令，尚未完成真实容器构建/启动验证。

### 8.3 未完成

- 真实 DAIR-V2X 数据目录运行与样本筛选；当前已有 `scripts/verify_dair_dataset.py --require-real` 作为严格验收入口，但本机 `real_candidate_count=0`。
- YOLOv8 / PyTorch 环境统一已在当前机器完成 Conda 环境安装、强制 readiness 验收、YOLOv8n 真实图片推理烟测和 mini split 检测评估 dry-run；后续仍需在目标部署/CI 环境复现，并在 DAIR-V2X 真实图片上运行 `scripts/evaluate_yolo_detection.py` 产出批量检测指标。
- OccAware-STGNN 小样本真实训练和 checkpoint 产出已完成烟测；训练后指标达标和真实 DAIR-V2X 复核仍未完成。
- MQTT 三端联动已通过嵌入式 `amqtt` 真实 TCP Broker 验证，并已纳入 GitHub Actions 的 Ubuntu Mosquitto 外部 Broker 验收；当前 Windows 本机仍需要在已安装 Mosquitto 或 Docker 的环境中完成外部 Broker 实机验证。
- 真实数据多场景批量评估结果产出与指标复核。
- 实体 Jetson / 小车部署。
- CI / 自动化测试流水线已具备基础版本，并覆盖 Docker Compose 配置合同、外部 readiness 默认预检、brokerless MQTT、Ubuntu Mosquitto 外部 Broker、M2 demo sample、模型 readiness、前端 test/lint/build，以及手动/每周触发的 YOLO/ST-GNN 算法环境验证；真实 DAIR-V2X 样本缓存、真实 DAIR 指标达标、Docker 真实容器启动和实体迁移仍未进入自动化验收。

---

## 9. 验收标准

### 9.1 MVP Definition of Done

MVP 达成需要满足：

- [ ] 路侧感知可输出行人轨迹预测，ADE < 1.0 m。
- [ ] 路侧到车端特征传输延迟 < 100 ms。
- [ ] 车端可基于协同信息做出制动决策。
- [ ] 通信中断时车端可平滑退化。
- [x] 云端孪生可实时展示数据流。
- [x] 云端孪生支持事件查询和真实回放。
- [x] 至少完成 1 个鬼探头场景端到端演示。
- [x] 核心 demo / store 行为有单元测试覆盖。
- [x] 项目文档包含架构、API、启动、demo 说明。

### 9.2 当前可演示验收

当前版本演示应满足：

1. 启动后端：

```powershell
python -m uvicorn src.cloud_twin.api:app --host 0.0.0.0 --port 8000
```

2. 启动前端：

```powershell
cd frontend
npm run dev -- --host 0.0.0.0
```

3. 打开：

```text
http://localhost:3000/monitor
http://localhost:3000/replay
http://localhost:8000/docs
```

4. 在 monitor 页点击“启动演示”。
5. 观察 perception / vehicle_status / decision / event 持续更新。
6. 在 replay 页选择 ghost_probe 事件。
7. 观察 3D 场景、TTC 曲线、风险分和制动状态随帧变化。

如果后端不是 `8000` 端口，先进入 `http://localhost:3000/settings`，将 Cloud API 地址改成实际地址，例如 `http://localhost:8001/api/v1`。

---

## 10. 路线图

### 下一步优先级 P0

1. **Windows 一键启动脚本**
   - 已新增 `scripts/start_demo.ps1`
   - 已自动启动 Cloud API、前端 dev server、demo loop
   - 已自动打开 `/monitor`
   - 已支持自定义 `-BackendPort` 时自动注入前端 Cloud API 地址

2. **项目生成物清理**
   - 已完善 `.gitignore`（覆盖主要运行生成物）
   - 已排除 `node_modules/`、`dist/`、`__pycache__/`、临时 SQLite、日志、模型 checkpoint/export 目录和本地误生成副本
   - 保留源码、文档、配置和测试

3. **统一启动文档**
   - 已更新 `启动.md`
   - 已合并 `docs/END_TO_END_DEMO.md` 的关键入口
   - 已通过 `scripts/verify_startup_docs.py` 纳入本地和 CI 覆盖验证

### 中期优先级 P1

1. **MQTT 三端联动**
   - Mosquitto 一键启动（脚本已尝试本地 Mosquitto / Docker Compose）
   - Roadside Agent + Vehicle Agent + Cloud Agent 完整链路（启动脚本已补齐；内存总线 topic/事件/制动/fallback/延迟目标验证已完成；嵌入式 `amqtt` 真实 TCP Broker 验证已通过；外部 Mosquitto/Docker Broker 待具备环境后运行通过）

2. **评估页真实化**
   - 后端输出评估 JSON（demo runtime 已完成）
   - 前端 `/evaluation` 读取真实指标（demo runtime 已完成）
   - DAIR-V2X mini split 常速度 baseline 离线评估（已完成）
   - 多 replay clip 批量聚合评估（已完成）
   - 评估指标阈值达标状态输出与前端展示（已完成）
   - YOLO detection 离线报告选择入口与 dry-run 报告链路（已完成）
   - 后续接入 DAIR-V2X 上的 YOLO / ST-GNN 真实模型离线评估结果

3. **多 demo 场景**
   - light / moderate / heavy 三类遮挡（已完成）
   - 支持前端选择场景（已完成）

4. **自动化验证**
   - 本地 `scripts/verify_all.ps1` 已完成
   - GitHub Actions 基础 CI 已完成，已包含 DAIR 数据集发现脚本测试、brokerless MQTT、Ubuntu Mosquitto 外部 Broker 验收、M2 DAIR 风格样例评估验证和模型环境 readiness 诊断
   - 外部 readiness 默认预检已完成，可持续汇总真实 DAIR-V2X、Docker/Compose、外部 MQTT Broker 和算法环境缺口；严格模式待具备对应环境后作为强制门禁启用
   - 手动/每周 YOLO/ST-GNN 强制算法环境 workflow 已完成
   - 后续补真实 DAIR-V2X 样本缓存、真实 DAIR 指标达标复核和实体迁移验收

### 长期优先级 P2

1. DAIR-V2X 数据集接入（manifest / replay clip 生成器、常速度 baseline 评估和多 clip 聚合评估已完成，真实数据下载与 YOLO/ST-GNN 评估待完成）。
2. YOLOv8 检测模型运行环境固定（当前机器已完成真实图片烟测和 manifest 批量评估 dry-run，待 DAIR-V2X 批量真实评估）。
3. OccAware-STGNN 训练与评估。
4. Docker Compose 完整部署（基础栈、`mqtt-demo` profile 和配置合同验证已补齐，待有 Docker 环境后实跑验证）。
5. Jetson Orin 与实体小车迁移。

---

## 11. 风险与约束

| 风险 | 影响 | 应对 |
|------|------|------|
| Python 3.13 下 `ultralytics` / `torch` wheel 不完整 | YOLO/STGNN 接入受阻 | 使用 Conda Python 3.10/3.11 固定环境 |
| Windows SQLite journal 写入异常 | 数据库初始化失败 | 已加入 TEMP fallback，后续可改为可配置 DB 路径 |
| MQTT Broker 缺失 | 三端真实联动无法跑 | demo loop 绕开 MQTT；后续脚本安装/启动 Mosquitto |
| 前端 3D / 图表依赖较重 | 可视化页首次加载体积偏大 | 已按需接入 ECharts 并拆分 ECharts / Three vendor chunk，后续可继续按页面懒加载细化 |
| mock 与 real 数据共存 | 状态来源混乱 | 用 connection source 标记 live/mock，逐步真实化 |
| 算法目标较高 | MVP 进度被模型训练拖慢 | 仿真优先，先规则/轻量 baseline，再替换模型 |

---

## 12. 成功标准

项目成功不只看单个模型指标，而看完整系统是否形成“提前发现、快速决策、可视化复盘”的闭环。

成功标准分三层：

### 演示成功

- 能在浏览器中看到鬼探头场景实时发生。
- 能看到车辆风险等级和 TTC 变化。
- 能看到事件生成并进入回放。
- 能从事件回放复盘车辆、行人、制动状态。

### 工程成功

- 前后端可一键启动。
- 核心接口有测试。
- 主要模块边界清晰。
- 文档足以让新开发者启动、理解、继续迭代。

### 研究成功

- 能在 DAIR-V2X 或仿真数据上证明协同感知优于单车感知。
- 能量化提前预警时间、TTC 改善、误报率、漏报率、制动响应时间。
- 能形成完整实验报告、答辩演示和后续实体迁移方案。

---

## 13. 目标总结

本项目的最终目标是：

> 构建一个以“鬼探头”遮挡危险场景为核心验证对象的 V2X 车路云协同主动安全平台。它应能通过路侧提前感知和轨迹预测扩展车端视野，通过低延迟通信支持车端风险评估与主动制动，并通过云端孪生实现实时可视化、事件检索、历史回放和实验评估。

当前最重要的短期目标是：

> 巩固已经跑通的真实端到端 demo，补齐一键启动、项目清理和真实评估入口，让项目具备稳定展示、持续迭代和后续算法替换的基础。
