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

### 2.3 历史回放

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

### 2.4 高危事件管理

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

### 2.5 系统指标

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

### 2.6 场景配置

#### GET `/config/{scene_id}`
#### PUT `/config/{scene_id}`

```json
{
  "scene_id": "scene_001",
  "roadside_nodes": [
    {
      "node_id": "roadside_001",
      "position": [0, 0, 5],
      "rotation": [0, -30, 0],
      "camera_fov": 90
    }
  ],
  "road_layout": {
    "lanes": 2,
    "width": 7.0,
    "occlusion_zones": [
      {"type": "building", "bbox": [5, -2, 8, 2]}
    ]
  }
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
