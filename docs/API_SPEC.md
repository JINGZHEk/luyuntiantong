# API 接口规范文档

> 项目：分布式多智能体车路协同遮挡感知平台
> 版本：v0.1
> 日期：2026-04-14

---

## 1. MQTT 消息接口

### 1.1 路侧感知结果

**Topic**: `v2x/{scene_id}/roadside/{node_id}/perception`
**QoS**: 1
**频率**: 10 Hz

```json
{
  "timestamp": 1713100800123,
  "frame_id": 12345,
  "node_id": "roadside_001",
  "objects": [
    {
      "track_id": 1,
      "class": "pedestrian",
      "bbox": [320.5, 180.2, 45.0, 120.0],
      "world_pos": [12.5, 3.2],
      "velocity": [1.2, 0.5],
      "confidence": 0.92,
      "occlusion_level": 2,
      "predicted_traj": [[12.6, 3.3], [12.8, 3.5], [13.0, 3.7]],
      "feature_vector": "<base64 encoded 128-dim float32>"
    }
  ],
  "graph_edges": [[0, 1], [1, 2]],
  "processing_time_ms": 35.2
}
```

### 1.2 路侧心跳

**Topic**: `v2x/{scene_id}/roadside/{node_id}/heartbeat`
**QoS**: 0
**频率**: 2 Hz

```json
{
  "timestamp": 1713100800123,
  "node_id": "roadside_001",
  "status": "active",
  "fps": 10.2,
  "gpu_util": 65.3,
  "cpu_util": 45.1,
  "mem_util": 72.0
}
```

### 1.3 车端状态

**Topic**: `v2x/{scene_id}/vehicle/{vehicle_id}/status`
**QoS**: 1
**频率**: 10 Hz

```json
{
  "timestamp": 1713100800123,
  "vehicle_id": "vehicle_001",
  "position": [25.0, 0.0],
  "velocity": [8.5, 0.0],
  "heading": 0.0,
  "acceleration": [0.0, 0.0],
  "mode": "cooperative",
  "risk_level": "SAFE"
}
```

### 1.4 车端决策结果

**Topic**: `v2x/{scene_id}/vehicle/{vehicle_id}/decision`
**QoS**: 1
**频率**: 10 Hz

```json
{
  "timestamp": 1713100800123,
  "vehicle_id": "vehicle_001",
  "risk_level": "DANGER",
  "ttc": 2.3,
  "collision_prob": 0.75,
  "brake_decel": 5.0,
  "target_object": {
    "track_id": 1,
    "class": "pedestrian",
    "predicted_collision_point": [15.0, 0.5]
  },
  "mode": "cooperative",
  "fusion_weight": 1.0
}
```

### 1.5 高危事件通知

**Topic**: `v2x/{scene_id}/cloud/event`
**QoS**: 2

```json
{
  "timestamp": 1713100800123,
  "event_id": "evt_20260414_001",
  "event_type": "near_collision",
  "severity": "high",
  "scene_id": "scene_001",
  "involved_objects": [
    {"type": "vehicle", "id": "vehicle_001"},
    {"type": "pedestrian", "track_id": 1}
  ],
  "min_ttc": 1.2,
  "outcome": "avoided",
  "replay_start_ts": 1713100795000,
  "replay_end_ts": 1713100810000
}
```

### 1.6 回放运行元数据

SQLite 场景回放和未来真实设备接入共用同一套 MQTT 消息 envelope。感知、车端状态、决策和事件消息都应携带：

| 字段 | 说明 |
|------|------|
| `scene_id` | 当前道路/路口场景标识 |
| `scenario_id` | 场景模板标识，例如 `GP-01`、`NM-03`、`IC-02` |
| `run_id` | 一次场景运行标识；同一运行内保持不变 |
| `frame_id` | 运行内递增帧号；与 `run_id` 组成持久化唯一键 |
| `source.device_type` | `scenario_replay`、`roadside_camera` 或 `vehicle` |
| `source.simulation` | 是否为仿真数据；真车接入时为 `false` |

`run_id + frame_id` 是回放、数据库存储、WebSocket 广播和前端场景更新的统一关联键。`scenario_replay` 仅代表当前无硬件演示的数据源，不改变后续 Jetson Orin Nano 或 Huawei Atlas 200 DK 的消息协议。

---

## 2. 云端 REST API

### 2.1 基础信息

- **Base URL**: `http://localhost:8000/api/v1`
- **Content-Type**: `application/json`

### 2.2 实时数据 WebSocket

**Endpoint**: `ws://localhost:8000/api/v1/realtime/ws`

连接后自动推送所有 MQTT 转发数据，客户端可通过过滤消息订阅特定类型：

```json
// 客户端发送订阅请求
{"action": "subscribe", "topics": ["perception", "decision", "event"]}

// 服务端推送数据
{"type": "perception", "data": {...}}
{"type": "decision", "data": {...}}
{"type": "event", "data": {...}}
```

### 2.3 Demo 控制

#### POST `/demo/start`

启动内置端到端 demo loop。

**参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| fps | float | 帧率，默认 `10`，范围 1-30 |
| scenario | string | 鬼探头强度，`light` / `moderate` / `heavy`，默认 `moderate` |

#### POST `/demo/step`

推进单帧 demo。可通过 `scenario` 参数临时选择场景强度。

#### POST `/demo/stop`

停止 demo loop。

#### GET `/demo/status`

返回 demo 运行状态：

```json
{
  "running": true,
  "frame_index": 42,
  "scene_id": "scene_001",
  "scenario": "heavy",
  "available_scenarios": ["light", "moderate", "heavy"],
  "fps": 10.0
}
```

#### SQLite 场景库控制

无硬件演示使用 SQLite 场景模板生成与真实感知协议一致的 MQTT 数据。可用接口为：

```text
GET http://localhost:8000/api/v1/scenarios
POST http://localhost:8000/api/v1/demo/start?scenario_id=GP-01&fps=10&loop=false
GET http://localhost:8000/api/v1/demo/status
POST http://localhost:8000/api/v1/demo/stop
```

场景目录固定包含 16 个启用模板：8 个鬼探头（`GP-01`～`GP-08`）、4 个非机动车横穿（`NM-01`～`NM-04`）和 4 个路口车辆冲突（`IC-01`～`IC-04`）。`start` 返回的 `run_id` 用于追踪本次运行；`loop=false` 播放到场景末尾后自动停止。WebSocket 客户端继续订阅 `/api/v1/realtime/ws`，因此切换到真实车辆时只需替换数据源适配器，不需要改 CloudAgent、STGNN、WebSocket 或 Three.js 消费接口。

### 2.4 历史回放

#### GET `/replay/{scene_id}`

查询历史数据用于回放。

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| scene_id | string | 是 | 场景ID (path) |
| start_ts | int | 是 | 开始时间戳 (ms) |
| end_ts | int | 是 | 结束时间戳 (ms) |
| data_types | string | 否 | 逗号分隔: perception,decision,event |

**响应**:
```json
{
  "scene_id": "scene_001",
  "start_ts": 1713100795000,
  "end_ts": 1713100810000,
  "total_frames": 150,
  "data": {
    "perception": [...],
    "decision": [...],
    "events": [...]
  }
}
```

### 2.5 高危事件管理

#### GET `/events`

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| scene_id | string | 否 | 按场景过滤 |
| severity | string | 否 | low/medium/high/critical |
| start_date | string | 否 | ISO8601 日期 |
| end_date | string | 否 | ISO8601 日期 |
| limit | int | 否 | 默认 50 |
| offset | int | 否 | 默认 0 |

**响应**:
```json
{
  "total": 23,
  "events": [
    {
      "event_id": "evt_20260414_001",
      "timestamp": 1713100800123,
      "event_type": "near_collision",
      "severity": "high",
      "scene_id": "scene_001",
      "summary": "行人从遮挡区突出，车辆紧急制动避免碰撞"
    }
  ]
}
```

#### GET `/events/{event_id}`

返回单个事件详情，含完整回放数据。

### 2.6 系统指标

#### GET `/metrics`

**参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| period | string | 1m/5m/1h/1d |

**响应**:
```json
{
  "roadside": {
    "avg_fps": 10.2,
    "avg_inference_ms": 35.5,
    "avg_gpu_util": 65.0
  },
  "communication": {
    "avg_latency_ms": 45.2,
    "message_loss_rate": 0.001,
    "uptime_percent": 99.8
  },
  "vehicle": {
    "avg_decision_ms": 12.3,
    "brake_events_count": 5,
    "fallback_count": 0
  }
}
```

### 2.7 模型评估

#### GET `/evaluation`

返回面向前端 `/evaluation` 页的评估报告。默认读取离线评估产物 `data/mini_split/evaluation.json`；也可通过 `report=stgnn_checkpoint` 切换到 `data/mini_split/stgnn_evaluation.json`。如设置环境变量 `V2X_EVALUATION_DIR`，上述两个文件会从该目录读取；如设置 `V2X_EVALUATION_REPORT`，则在未指定 `report` 时优先读取该单文件报告。当离线报告不存在时，回退到已持久化的 demo runtime 数据聚合结果。

报告包括样本帧、事件数、平均处理延迟、端到端延迟、提前预警时间、估计 FPS、基线对比、消融结果和 `targetStatus` 指标达标状态。目录级离线评估报告会额外返回 `clip_count` 与 `clips`，用于查看多 replay clip 聚合来源。

**参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| scene_id | string | 场景 ID，默认 `scene_001` |
| report | string | 可选报告 key：`mini_split` / `stgnn_checkpoint` / `configured` |

**响应**:
```json
{
  "source": "mini_split_offline_batch",
  "scene_id": "mini_split_batch",
  "clip_count": 2,
  "sample_count": 120,
  "event_count": 2,
  "high_risk_frames": 34,
  "min_ttc": 0.08,
  "metrics": {
    "precision": 1.0,
    "recall": 0.567,
    "f1Score": 0.724,
    "ade": 0.92,
    "fde": 1.57,
    "occAde": 1.12,
    "occAcc": 0.82,
    "avgLatency": 30.98,
    "e2eLatency": 42.0,
    "leadTime": 1.86,
    "fps": 9.78
  },
  "targetStatus": [
    {
      "key": "ade",
      "metric": "ADE",
      "value": 0.92,
      "target": "< 1 m",
      "status": "pass",
      "pass": true,
      "unit": "m"
    }
  ],
  "baselines": [
    {
      "model": "V2X Demo Runtime",
      "precision": 1.0,
      "recall": 0.567,
      "f1Score": 0.724,
      "ade": 0.92,
      "fde": 1.57,
      "latency": 30.98
    }
  ],
  "ablations": [
    {
      "variant": "Full Demo Loop",
      "f1Score": 0.724,
      "ade": 0.92,
      "fde": 1.57,
      "description": "当前端到端 demo runtime 聚合结果"
    }
  ]
}
```

#### GET `/evaluation/reports`

列出当前后端可发现的评估报告，供前端选择器切换报告源。

**参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| scene_id | string | 场景 ID，默认 `scene_001` |

**响应**:
```json
{
  "reports": [
    {
      "key": "mini_split",
      "label": "DAIR Mini Split Offline",
      "path": "data/mini_split/evaluation.json",
      "available": true,
      "source": "mini_split_offline",
      "scene_id": "demo_dair_001",
      "sample_count": 60
    },
    {
      "key": "stgnn_checkpoint",
      "label": "OccAware-STGNN Checkpoint",
      "path": "data/mini_split/stgnn_evaluation.json",
      "available": true,
      "source": "stgnn_checkpoint_dry_run",
      "scene_id": "demo_dair_001",
      "sample_count": 23
    }
  ]
}
```

### 2.8 场景配置

#### GET `/config/{scene_id}`
#### PUT `/config/{scene_id}`

读取或更新指定场景的运行配置。该接口主要服务前端 `/settings` 页，配置会持久化到 `data/runtime_config.json`。`PUT` 支持部分字段更新，但当前前端会提交完整配置。

**字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| scene_id | string | 场景 ID，仅响应中返回 |
| riskThreshold | number | 风险分告警阈值，范围 0-1 |
| ttcThreshold | number | TTC 告警阈值，范围 0-10 秒 |
| refreshInterval | number | 前端数据刷新间隔，范围 500-60000 毫秒 |
| cloudApiBaseUrl | string | Cloud API Base URL，必须以 `http://` 或 `https://` 开头 |

```json
{
  "scene_id": "scene_001",
  "riskThreshold": 0.8,
  "ttcThreshold": 1.8,
  "refreshInterval": 5000,
  "cloudApiBaseUrl": "http://localhost:8001/api/v1"
}
```

无效配置返回 `400`：

```json
{
  "detail": "riskThreshold must be between 0 and 1"
}
```

---

## 3. 模块内部接口

### 3.1 路侧感知模块间接口

```python
# graph_builder.py
class GraphBuilder:
    def build(self, detections: List[Detection], history: TrackHistory) -> Data:
        """
        Args:
            detections: 当前帧检测结果列表
            history: 历史跟踪信息 {track_id: [Detection, ...]}
        Returns:
            PyG Data 对象 (x, edge_index, edge_attr, batch)
        """

# stgnn_model.py
class STGNN(nn.Module):
    def forward(self, graph_sequence: List[Data]) -> Tuple[Tensor, Tensor, Tensor]:
        """
        Args:
            graph_sequence: 连续N帧时空图 [Data, ...]
        Returns:
            predicted_traj: (num_nodes, T, 2) 预测轨迹
            occlusion_level: (num_nodes, 4) 遮挡分类
            node_features: (num_nodes, 128) 节点特征 (用于共享)
        """
```

### 3.2 车端决策模块间接口

```python
# feature_fusion.py
class FeatureFusion:
    def fuse(self, roadside_msg: dict, ego_state: EgoState) -> FusedFeature:
        """融合路侧特征与自车状态"""

# risk_assessor.py
class RiskAssessor:
    def assess(self, fused: FusedFeature) -> RiskResult:
        """
        Returns:
            RiskResult(level, ttc, collision_prob, target_object)
        """

# brake_controller.py
class BrakeController:
    def compute(self, risk: RiskResult) -> BrakeCommand:
        """
        Returns:
            BrakeCommand(deceleration, is_emergency)
        """
```

---

## 4. PC 感知到 Cloud STGNN 闭环协议

PC 回放、Jetson Orin Nano 和 Atlas 200 DK 共用同一条路侧感知 Topic：

```text
v2x/{scene_id}/roadside/{node_id}/perception
```

板端或 PC 端只发布检测、跟踪和道路坐标；STGNN 由 Cloud Agent 在接收后执行。感知消息不得携带原始视频或图片。

新增兼容字段如下：

| 字段 | 类型 | 说明 |
|---|---|---|
| `schema_version` | int | 当前为 `1` |
| `message_type` | string | `perception` |
| `scene_id` | string | 场景标识 |
| `source` | object | `device_type`、`input_type`、`detector`、`tracker` 等来源元数据 |
| `coordinate_frame` | string | 当前道路坐标系为 `road_xy` |
| `prediction` | object | Cloud STGNN 的位置、后端、状态、耗时和原因 |
| `objects[].coordinate_status` | string | `valid` / `invalid` / `unknown` |
| `objects[].prediction_status` | string | `deferred` / `ready` / `fallback` / `invalid_coordinate` / `local` |

`prediction` 的标准结构为：

```json
{
  "location": "cloud",
  "backend": "stgnn",
  "status": "ready",
  "model_path": "data/algorithm_validation_pipeline/models/occaware_stgnn.ts",
  "latency_ms": 8.4,
  "reason": null
}
```

状态语义：

- `deferred`：历史长度不足，或当前部署明确把预测交给 Cloud Agent。
- `ready`：Cloud Agent 成功加载并调用 STGNN。
- `fallback`：模型缺失或推理失败，结果只能作为降级链路数据。
- `invalid_coordinate`：对象没有有效道路坐标，不调用 STGNN，也不伪造 `[0, 0]`。
- `local`：仅保留给未来 edge prediction 模式，本阶段 PC 配置不使用。

Cloud Agent 将 enriched perception 同时写入 SQLite `frames.perception_data` 并广播 WebSocket：

```json
{"type": "perception", "data": {"prediction": {"status": "ready"}, "objects": []}}
```

前端、历史回放和 API 都消费这份 enriched 数据，避免原始感知和预测结果产生两条时间线。
