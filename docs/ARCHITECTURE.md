# 系统架构

> 最后更新：2026-08-12

## 总览

```text
┌──────────────── Roadside / PC ────────────────┐
│ FrameSource -> YOLO -> DeepSORT -> Homography │
│                    -> MQTT perception 10Hz    │
└──────────────────────────┬────────────────────┘
                           v
┌──────────────────── Cloud Agent ──────────────┐
│ MQTT subscription                             │
│ CloudSTGNNService -> InferenceEngine          │
│       |                  |                     │
│       |                  +-> TorchScript/GPU  │
│       +-> PredictionWriter -> SQLite          │
│       +-> WebSocket queues -> Frontend        │
│       +-> event detection / REST API          │
└──────────────────────────┬────────────────────┘
                           v
┌──────────────── Vehicle / Frontend ───────────┐
│ TTC and braking decision | Three.js dashboard │
│ fallback                 | replay/evaluation  │
└───────────────────────────────────────────────┘
```

## 运行模式

### 内置 Demo

FastAPI 的 `DemoEngine` 从 SQLite 场景库生成 10Hz 感知、车辆状态、决策和事件消息，不依赖 MQTT、YOLO、PyTorch 或硬件。该模式验证 API、数据库、回放和前端链路。

### PC-first

`run_pc_perception.py` 使用 `configs/roadside.pc.yaml` 读取视频，执行 YOLO、DeepSORT 和道路坐标转换，通过 MQTT 发布感知结果。Cloud Agent 使用 `configs/cloud.pc.yaml` 运行 STGNN，板端不加载轨迹模型。

### 目标硬件

Jetson 或 Atlas 只替换路侧采集与检测后端，保持 MQTT、`road_xy`、Cloud STGNN、SQLite 和 WebSocket 协议不变。Jetson 使用 CUDA/TensorRT；Atlas 使用 CANN/ACL/OM，两者的模型产物不可混用。

## 核心模块

### `src/roadside_perception`

- `frame_source.py`：视频、图片序列和回放输入。
- `detector.py` / YOLO adapter：目标检测。
- `tracker.py` / DeepSORT adapter：稳定 `track_id`。
- `coordinate_mapper.py`：bbox 底边中心到 `road_xy`。
- `stgnn_predictor.py`：TorchScript 适配和常速 fallback。
- `roadside_agent.py`：路侧编排和 MQTT 发布。

### `src/cloud_twin`

- `cloud_agent.py`：MQTT 订阅、消息编排、事件检测和广播桥接。
- `stgnn_service.py`：按 `(node_id, track_id)` 维护历史并组批预测。
- `inference_engine.py`：进程单例、有界微批队列、CUDA warm-up、热更新和性能统计。
- `prediction_writer.py`：后台有界队列写 SQLite，避免阻塞推理回调。
- `data_store.py`：帧、事件、预测、推理日志、异常和实验记录。
- `api.py`：REST、WebSocket、Demo 和健康接口。

### `src/dataset`

- `trajectory_dataset.py`：统一轨迹输入、清洗、重采样和监督窗口。
- `stgnn_training_data.py`：旧 replay clip 与新 20/20 数据导出。
- `stgnn_checkpoint_evaluator.py`：真实 TorchScript 轨迹评估。

### `src/vehicle_decision`

融合路侧目标与自车状态，计算 TTC、碰撞风险和制动指令。路侧消息超时时进入 fallback，不把 Cloud 或网络故障变成无保护状态。

### `frontend`

React Router 提供 `/`、`/monitor`、`/replay`、`/evaluation`、`/settings`、`/presentation` 和 `/zhiluwujie`。WebSocket 客户端订阅感知、预测、决策、事件、车辆状态和心跳；Three.js 场景绘制历史轨迹实线和预测虚线。

## 时序与背压

1. 路侧以 10Hz 发布感知帧。
2. Cloud Service 更新同节点轨迹历史，并把同帧可预测目标提交到 `InferenceEngine`。
3. 引擎在短等待窗口内合并并发请求，最多按配置 batch size 分批。
4. 推理结果立即回到 enriched perception；SQLite 写入和 WebSocket 发送分别由有界队列缓冲。
5. prediction topic 按 `push_hz=10` 限频；慢客户端只丢弃其队列中最旧消息，不阻塞推理。

## 降级与异常

- 坐标非有限或超过 ±200m：`invalid_coordinate`，不进入模型。
- 历史不足：`deferred`。
- checkpoint 缺失/加载失败：常速 fallback，并明确记录原因。
- 推理超过 50ms：warning；连续 5 批超过 100ms：慢推理告警。
- 预测单步位移超过 5m：写入 `prediction_anomalies`。
- SQLite 写入队列满：丢弃新任务并累计 dropped，不阻塞主推理路径。

## 配置边界

`configs/cloud.yaml` 默认关闭 STGNN，适合无模型 Demo。`configs/cloud.pc.yaml` 开启 STGNN，使用 20 帧历史、20 步预测、10Hz、batch 8 和 `device: auto`。

配置模型路径后，Cloud Agent 启动时预加载并 warm-up；运行期间根据文件 mtime 或 `/api/v1/model/reload` 热更新。

## 验收边界

工程链路通过不代表模型泛化通过。比赛验收必须按路口/场景隔离数据集，单独报告 held-out ADE、FDE、Miss Rate、p50/p95/p99 延迟、fallback 比例和硬件资源。场景库训练结果只能作为 pipeline smoke 和回归基线。
