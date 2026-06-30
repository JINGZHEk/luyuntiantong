# 系统技术架构文档

> 项目：分布式多智能体车路协同遮挡感知平台
> 版本：v0.1
> 日期：2026-04-14

---

## 1. 架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        云端孪生智能体 (Cloud)                        │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────────┐ │
│  │  FastAPI     │  │  InfluxDB    │  │  Three.js 3D Visualization │ │
│  │  Backend     │  │  TimeSeries  │  │  (Vite + WebSocket)        │ │
│  └──────┬───── ┘  └──────┬───────┘  └────────────┬───────────────┘ │
│         └────────────────┼───────────────────────┘                  │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ MQTT / WebSocket
            ┌─────────────┴─────────────┐
            │     MQTT Broker            │
            │     (Mosquitto)            │
            └─────┬───────────────┬─────┘
                  │               │
    ──────────────┼───────────────┼──────────────────
                  │               │
  ┌───────────────┴───┐   ┌──────┴────────────────────┐
  │  路侧感知智能体    │   │   车端决策智能体            │
  │  (Roadside Agent)  │   │   (Vehicle Agent)          │
  │                    │   │                            │
  │  ┌──────────────┐  │   │  ┌───────────────────────┐ │
  │  │ Camera Input  │  │   │  │ MQTT Subscriber       │ │
  │  └──────┬───────┘  │   │  └───────┬───────────────┘ │
  │  ┌──────▼───────┐  │   │  ┌───────▼───────────────┐ │
  │  │ YOLOv8 Det.  │  │   │  │ Feature Fusion        │ │
  │  └──────┬───────┘  │   │  └───────┬───────────────┘ │
  │  ┌──────▼───────┐  │   │  ┌───────▼───────────────┐ │
  │  │ Graph Builder │  │   │  │ Risk Assessment       │ │
  │  └──────┬───────┘  │   │  │ (TTC + Collision Prob) │ │
  │  ┌──────▼───────┐  │   │  └───────┬───────────────┘ │
  │  │ ST-GNN Model │  │   │  ┌───────▼───────────────┐ │
  │  │ (Spatial+     │  │   │  │ Brake Controller      │ │
  │  │  Temporal)    │  │   │  │ (Graded Braking)      │ │
  │  └──────┬───────┘  │   │  └───────┬───────────────┘ │
  │  ┌──────▼───────┐  │   │  ┌───────▼───────────────┐ │
  │  │ Occlusion    │  │   │  │ Vehicle Actuator      │ │
  │  │ Estimator    │  │   │  │ (Huawei Smart Car)    │ │
  │  └──────┬───────┘  │   │  └───────────────────────┘ │
  │  ┌──────▼───────┐  │   │                            │
  │  │ Traj. Pred.  │  │   │  ┌───────────────────────┐ │
  │  └──────┬───────┘  │   │  │ Fallback Manager      │ │
  │  ┌──────▼───────┐  │   │  │ (Graceful Degrade)    │ │
  │  │ MQTT Publish  │  │   │  └───────────────────────┘ │
  │  └──────────────┘  │   │                            │
  │                    │   │                            │
  │  [Jetson/PC GPU]   │   │  [Huawei Smart Car]       │
  └────────────────────┘   └────────────────────────────┘
```

## 2. 模块详细设计

### 2.1 路侧感知智能体

#### 2.1.1 数据流

```
视频帧 (H×W×3, 10FPS)
    │
    ▼
目标检测 (YOLOv8s)
    │ → [bbox, class, confidence, track_id]
    ▼
时空图构建 (GraphBuilder)
    │ → PyG Data(x, edge_index, edge_attr)
    │   节点特征: [x, y, w, h, vx, vy, class, occlusion_score] (dim=8)
    │   边特征: [distance, angle, temporal_gap] (dim=3)
    ▼
ST-GNN 编码器
    │ → 空间: GATConv (2层, heads=4, hidden=64)
    │ → 时序: GRU (1层, hidden=128)
    │ → 输出: node_embedding (dim=128)
    ▼
遮挡状态估计
    │ → occlusion_level: {NONE, LIGHT, MODERATE, HEAVY}
    ▼
轨迹预测头
    │ → MLP: 128 → 64 → T×2
    │ → 输出: future_traj [(x1,y1), ..., (xT,yT)], T=30 (3s@10Hz)
    ▼
特征压缩 & MQTT发布
    → MessagePack 序列化, <10KB/帧
```

#### 2.1.2 ST-GNN 模型架构

```python
class STGNN(nn.Module):
    """
    输入: 时空图序列 [G_t-N, ..., G_t]
    输出: 各节点未来T步轨迹预测
    """
    # 空间编码
    spatial_conv_1: GATConv(8, 32, heads=4)    # → 128
    spatial_conv_2: GATConv(128, 64, heads=4)  # → 256 → linear → 128

    # 时序编码
    temporal_gru: GRU(128, 128, num_layers=1)

    # 遮挡感知
    occlusion_head: MLP(128 → 64 → 4)  # 4-class classification

    # 轨迹预测
    traj_head: MLP(128 → 64 → T*2)  # T future steps, 2D coords
```

#### 2.1.3 遮挡感知损失函数

```
L_total = L_traj + α · L_occlusion + β · L_consistency

其中：
- L_traj = Σ_i w_i · ||pred_i - gt_i||²
  w_i = 1 + γ · occlusion_level_i  (γ=2.0, 重度遮挡惩罚加权)
- L_occlusion = CrossEntropy(pred_occ, gt_occ)
- L_consistency = ||traj_t - traj_{t-1}||² (时序平滑约束)
- α=0.5, β=0.1 (超参数)
```

### 2.2 车端决策智能体

#### 2.2.1 决策流程

```
路侧特征 (MQTT接收)     自车状态 (传感器)
    │                        │
    ▼                        ▼
┌─────────────────────────────────┐
│       Feature Fusion            │
│  concat([roadside_feat,         │
│          ego_state])            │
│  → MLP fusion → fused_feat     │
└──────────────┬──────────────────┘
               ▼
┌──────────────────────────────────┐
│       Risk Assessment            │
│                                  │
│  TTC = distance / relative_speed │
│  collision_prob = f(TTC, traj)   │
│                                  │
│  Risk Level:                     │
│    SAFE:      TTC > 5s           │
│    WARNING:   3s < TTC ≤ 5s      │
│    DANGER:    1.5s < TTC ≤ 3s    │
│    EMERGENCY: TTC ≤ 1.5s         │
└──────────────┬───────────────────┘
               ▼
┌──────────────────────────────────┐
│       Brake Controller           │
│                                  │
│  SAFE:      No action            │
│  WARNING:   Decel = 2 m/s²       │
│  DANGER:    Decel = 5 m/s²       │
│  EMERGENCY: Decel = 8 m/s² (AEB) │
└──────────────────────────────────┘
```

#### 2.2.2 平滑退化机制

```
正常模式 (协同感知)
    │
    │ ← 心跳超时 500ms
    ▼
降级模式 (纯自车感知)
    │
    │ ← 心跳恢复
    ▼
恢复模式 (渐进融合, 3s过渡)
    fusion_weight = min(1.0, (t - t_recover) / 3.0)
```

### 2.3 通信架构

#### 2.3.1 MQTT Topic 设计

```
v2x/{scene_id}/roadside/{node_id}/perception   # 路侧感知结果
v2x/{scene_id}/roadside/{node_id}/heartbeat     # 路侧心跳
v2x/{scene_id}/vehicle/{vehicle_id}/status       # 车辆状态
v2x/{scene_id}/vehicle/{vehicle_id}/decision     # 决策结果
v2x/{scene_id}/cloud/command                     # 云端指令
v2x/{scene_id}/cloud/event                       # 高危事件
```

#### 2.3.2 消息格式 (MessagePack)

```python
# 路侧感知消息
{
    "timestamp": 1713100800.123,       # Unix timestamp (ms精度)
    "frame_id": 12345,
    "node_id": "roadside_001",
    "objects": [
        {
            "track_id": 1,
            "class": "pedestrian",
            "bbox": [x, y, w, h],
            "confidence": 0.92,
            "occlusion_level": 2,       # 0-3
            "predicted_traj": [[x1,y1], [x2,y2], ...],  # 30 steps
            "feature_vector": [...]     # 压缩后的128维特征
        }
    ],
    "scene_graph_edges": [[0,1], [1,2]]  # 场景关系图
}
```

### 2.4 云端孪生智能体

#### 2.4.1 前端架构

```
Three.js Scene
├── Road Layer (道路网络, 静态)
├── Building Layer (建筑/遮挡物, 静态)
├── Vehicle Layer (车辆模型, 动态)
├── Pedestrian Layer (行人模型, 动态)
├── Trajectory Layer (预测轨迹, 动态)
├── Risk Layer (风险区域热力图, 动态)
└── UI Overlay
    ├── Timeline Slider (时间轴)
    ├── Layer Controls (图层开关)
    ├── Camera Controls (视角切换)
    └── Event List (高危事件列表)
```

#### 2.4.2 后端架构

```
FastAPI Server
├── /api/v1/realtime/ws          # WebSocket 实时数据推送
├── /api/v1/replay/{scene_id}    # 历史回放查询
├── /api/v1/events               # 高危事件 CRUD
├── /api/v1/metrics              # 系统指标查询
└── /api/v1/config               # 场景配置

InfluxDB
├── measurement: perception_data  # 感知数据时序
├── measurement: decision_data    # 决策数据时序
├── measurement: system_metrics   # 系统性能指标
└── measurement: events           # 事件记录
```

## 3. 部署架构

### 3.1 MVP 部署（单机开发）

```
Docker Compose
├── mosquitto (MQTT Broker, port 1883)
├── influxdb (时序数据库, port 8086)
├── cloud-backend (FastAPI, port 8000)
├── cloud-frontend (Vite dev server, port 5173)
├── roadside-agent (Python, 连接GPU)
└── vehicle-agent (Python)
```

### 3.2 目标部署（分布式）

```
路侧: Jetson Orin (roadside-agent + TensorRT)
车端: 华为网联小车 (vehicle-agent)
云端: 服务器 (cloud-backend + cloud-frontend + influxdb + mosquitto)
```

## 4. 目录结构

```
V2X-Project/
├── docs/                          # 项目文档
│   ├── WEEKLY_PLAN.md            # 一周计划
│   ├── MVP_REQUIREMENTS.md       # MVP需求
│   ├── ARCHITECTURE.md           # 本文档
│   ├── API_SPEC.md               # API规范
│   └── DATA_MODEL.md             # 数据与模型设计
├── src/
│   ├── roadside_perception/       # 路侧感知
│   │   ├── __init__.py
│   │   ├── detector.py           # 目标检测封装
│   │   ├── graph_builder.py      # 时空图构建
│   │   ├── spatial_conv.py       # 空间图卷积
│   │   ├── temporal_encoder.py   # 时序编码
│   │   ├── occlusion_estimator.py # 遮挡估计
│   │   ├── trajectory_predictor.py # 轨迹预测
│   │   ├── stgnn_model.py        # 完整模型
│   │   └── losses.py             # 损失函数
│   ├── vehicle_decision/          # 车端决策
│   │   ├── __init__.py
│   │   ├── feature_fusion.py     # 特征融合
│   │   ├── risk_assessor.py      # 风险评估
│   │   ├── brake_controller.py   # 制动控制
│   │   └── fallback_manager.py   # 退化管理
│   ├── communication/             # 通信模块
│   │   ├── __init__.py
│   │   ├── protocol.py           # 消息协议
│   │   ├── roadside_publisher.py # 路侧发布
│   │   ├── vehicle_subscriber.py # 车端订阅
│   │   └── fallback.py           # 通信降级
│   ├── cloud_twin/                # 云端孪生
│   │   ├── backend/
│   │   │   ├── main.py           # FastAPI入口
│   │   │   ├── data_writer.py    # 数据写入
│   │   │   ├── replay_api.py     # 回放API
│   │   │   └── ws_handler.py     # WebSocket
│   │   └── frontend/
│   │       ├── src/
│   │       ├── index.html
│   │       └── package.json
│   └── utils/                     # 公共工具
│       ├── __init__.py
│       ├── data_loader.py        # 数据加载
│       ├── config.py             # 配置管理
│       └── logger.py             # 日志
├── configs/                       # 配置文件
│   ├── default.yaml              # 默认配置
│   ├── roadside.yaml             # 路侧配置
│   ├── vehicle.yaml              # 车端配置
│   └── cloud.yaml                # 云端配置
├── scripts/                       # 脚本
│   ├── train_stgnn.py            # 训练脚本
│   ├── eval_stgnn.py             # 评估脚本
│   ├── data_eda.py               # 数据探索
│   └── latency_test.py           # 延迟测试
├── tests/                         # 测试
│   ├── unit/
│   └── integration/
├── deployment/                    # 部署
│   └── docker-compose.yml
├── requirements.txt
└── README.md
```
