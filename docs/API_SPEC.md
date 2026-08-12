# API 与消息契约

> 最后更新：2026-08-12。时间戳统一使用 Unix milliseconds，轨迹相对时间 `t` 使用 seconds。

## MQTT

### 路侧感知

Topic：`v2x/{scene_id}/roadside/{node_id}/perception`，推荐 QoS 1、10Hz。

```json
{
  "schema_version": 1,
  "message_type": "perception",
  "scene_id": "scene_001",
  "run_id": "run-001",
  "timestamp": 1710000000000,
  "frame_id": 42,
  "node_id": "rsu-01",
  "coordinate_frame": "road_xy",
  "source": {
    "device_type": "pc_replay",
    "input_type": "video",
    "detector": "yolo",
    "tracker": "deepsort"
  },
  "objects": [
    {
      "track_id": 7,
      "class": "car",
      "bbox": [420, 210, 96, 80],
      "world_pos": [12.4, 3.1],
      "velocity": [4.0, 0.0],
      "confidence": 0.92,
      "occlusion_level": 0,
      "coordinate_status": "valid",
      "prediction_status": "deferred"
    }
  ],
  "prediction": {
    "location": "cloud",
    "backend": "stgnn",
    "status": "deferred"
  }
}
```

`coordinate_status != valid` 的对象仍可上传用于诊断，但 Cloud 不得用 `[0,0]` 伪造坐标，也不得送入 STGNN。

Cloud enriched object 可增加：

```json
{
  "predicted_traj": [[12.8, 3.1], [13.2, 3.1]],
  "future_traj": [
    {"x": 12.8, "y": 3.1, "t": 0.1},
    {"x": 13.2, "y": 3.1, "t": 0.2}
  ],
  "prediction_confidence": 0.91,
  "prediction_anomaly": null,
  "prediction_status": "ready",
  "prediction_reason": null
}
```

预测状态：

| 状态 | 含义 |
|---|---|
| `ready` | TorchScript 模型已加载并成功推理 |
| `fallback` | 模型不可用或推理失败，返回常速基线 |
| `deferred` | 历史不足或预测交由 Cloud 处理 |
| `invalid_coordinate` | 没有有效道路坐标 |
| `local` | 保留给显式 edge prediction 模式 |

### 其他 Topic

| Topic | 说明 |
|---|---|
| `v2x/{scene_id}/roadside/{node_id}/heartbeat` | 路侧在线状态和资源指标 |
| `v2x/{scene_id}/vehicle/{vehicle_id}/status` | 自车位置、速度和状态 |
| `v2x/{scene_id}/vehicle/{vehicle_id}/decision` | TTC、风险等级和制动结果 |
| `v2x/{scene_id}/cloud/event` | 高危事件通知 |

## WebSocket

连接：`GET ws://{host}:8000/api/v1/realtime/ws`

订阅指定 topic：

```json
{
  "action": "subscribe",
  "topics": ["perception", "prediction", "decision", "event", "vehicle_status", "heartbeat"]
}
```

服务端 envelope：

```json
{"type": "perception", "data": {}, "timestamp": 1710000000100}
```

prediction topic：

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
        "future_traj": [{"x": 12.8, "y": 3.1, "t": 0.1}],
        "confidence": 0.91
      }
    ]
  },
  "timestamp": 1710000000010
}
```

每个客户端有独立的 256 条有界队列；队列满时丢弃该客户端最旧消息。prediction 默认按 10Hz 限频。

## REST API

基础地址：`http://{host}:8000`。

### 健康与模型

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 简写健康检查 |
| GET | `/api/v1/health` | 模型、推理、GPU、SQLite 和客户端状态 |
| POST | `/api/v1/model/reload` | 显式重新加载当前 checkpoint |
| GET | `/api/v1/logs/prediction` | 按时间查询推理日志和异常 |
| GET | `/api/logs/prediction` | 上一接口的兼容别名 |

健康响应主要字段：

```json
{
  "status": "ok",
  "timestamp": 1710000000000,
  "clients": 1,
  "model_loaded": true,
  "recent_infer_ms": 1.15,
  "model": {
    "model_path": "data/algorithm_validation_pipeline/models/occaware_stgnn.ts",
    "last_batch_size": 8,
    "warmup_ms": 130.48,
    "queue_depth": 0,
    "slow_alert": false
  },
  "gpu": {
    "available": true,
    "allocated_mb": 16.96,
    "reserved_mb": 22.0
  },
  "sqlite": {"connected": true}
}
```

日志查询参数：`start_ts`、`end_ts`、`limit`；`limit` 范围为 1 到 2000。

### 场景与 Demo

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/scenarios` | 场景列表 |
| GET | `/api/v1/scenarios/{scenario_id}` | 场景详情 |
| POST | `/api/v1/demo/start` | 启动 Demo；参数 `fps`、`scenario`、`scenario_id`、`loop` |
| POST | `/api/v1/demo/stop` | 停止 Demo |
| POST | `/api/v1/demo/step` | 单步推进 |
| GET | `/api/v1/demo/status` | Demo 状态 |

### 数据与回放

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/frames/{frame_id}` | 按 frame id 查询帧 |
| GET | `/api/v1/replay/{scene_id}` | 时间范围回放 |
| GET | `/api/v1/events` | 事件分页查询 |
| GET | `/api/v1/events/{event_id}` | 事件详情和回放 |
| GET | `/api/v1/messages/recent` | 最近 WebSocket 消息 |

### 指标、评估和设置

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/metrics` | 系统聚合指标；推理耗时来自 `inference_log` |
| GET | `/api/v1/evaluation` | 当前评估报告 |
| GET | `/api/v1/evaluation/reports` | 可选评估报告列表 |
| GET | `/api/v1/config/{scene_id}` | 场景运行配置 |
| PUT | `/api/v1/config/{scene_id}` | 更新允许修改的运行参数 |

## 兼容原则

- 新字段放在原必填字段之后，旧消费者忽略未知字段。
- `predicted_traj` 继续保留；新消费者优先使用带 `t` 的 `future_traj`。
- 回放、SQLite 和前端消费同一份 enriched perception，避免原始与预测结果形成两条时间线。
- 非有限浮点在 WebSocket 序列化前转换为 `null`，不得发送 JSON `NaN/Infinity`。
