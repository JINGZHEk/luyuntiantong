# 数据集与模型设计文档

> 版本：v0.1 | 日期：2026-04-14

---

## 1. 数据集

### 1.1 DAIR-V2X 数据集

**来源**: https://thudair.baai.ac.cn/index
**用途**: 模型训练与离线评估

#### 数据结构
```
DAIR-V2X/
├── cooperative/           # 协同数据（路侧+车端配对）
│   ├── image/            # 图像数据
│   ├── velodyne/         # 点云数据
│   ├── label/            # 3D标注 (json)
│   └── calib/            # 标定参数
├── infrastructure-side/   # 路侧独立数据
│   ├── image/
│   ├── velodyne/
│   ├── label/
│   └── calib/
└── vehicle-side/          # 车端独立数据
    ├── image/
    ├── velodyne/
    ├── label/
    └── calib/
```

#### 标注格式
```json
{
  "type": "Pedestrian",
  "truncated_state": 0,
  "occluded_state": 2,
  "alpha": -1.57,
  "2d_box": {"xmin": 320, "ymin": 180, "xmax": 365, "ymax": 300},
  "3d_dimensions": {"h": 1.73, "w": 0.65, "l": 0.45},
  "3d_location": {"x": 12.5, "y": 3.2, "z": 0.0},
  "rotation": 1.57
}
```

#### 我们使用的字段
| 字段 | 用途 | 映射到模型输入 |
|------|------|---------------|
| 2d_box | 检测框 | 图节点bbox特征 |
| 3d_location | 世界坐标 | 图节点(x,y)位置 |
| occluded_state | 遮挡标签 | 遮挡估计GT (0=无, 1=轻, 2=中, 3=重) |
| type | 类别 | 节点类别特征 (one-hot) |
| rotation | 朝向 | 速度方向估计辅助 |

### 1.2 数据预处理流程

```
原始帧序列
    ▼
1. 时间同步对齐 (路侧-车端帧匹配)
    ▼
2. 坐标统一 (标定参数转换到统一世界坐标系)
    ▼
3. 目标追踪关联 (匈牙利算法, IoU匹配)
    ▼
4. 轨迹提取 (滑窗: 观测N帧→预测T帧)
    ▼
5. 遮挡标签生成 (基于occluded_state + 可见面积比)
    ▼
6. 图数据构建 (PyG Data格式)
    ▼
7. 训练/验证/测试集划分 (7:1.5:1.5)
```

### 1.3 数据增强策略

| 策略 | 参数 | 目的 |
|------|------|------|
| 随机遮挡模拟 | drop_prob=0.3 | 增强遮挡鲁棒性 |
| 轨迹噪声 | σ=0.1m | 增强定位噪声鲁棒性 |
| 时序抖动 | ±1帧 | 增强时间同步误差鲁棒性 |
| 节点随机丢失 | drop_prob=0.1 | 模拟检测漏检 |

---

## 2. 模型设计

### 2.1 模型概览

| 属性 | 值 |
|------|-----|
| 模型名称 | OccAware-STGNN |
| 输入 | 连续 N=8 帧时空图序列 |
| 输出 | 未来 T=30 步轨迹 + 遮挡等级 |
| 参数量 | ~2.5M |
| 推理时间 | <50ms (RTX 3060) |
| 目标设备 | Jetson Orin / PC GPU |

### 2.2 模型结构细节

```
Input: graph_seq = [G_{t-7}, G_{t-6}, ..., G_t]
       每个 G_t = Data(x, edge_index, edge_attr)
       x.shape = (N_nodes, 8)  # [cx, cy, w, h, vx, vy, cls, occ_score]
       edge_attr.shape = (N_edges, 3)  # [dist, angle, dt]

Layer 1: Spatial Encoding (per frame)
  ├── GATConv(8 → 32, heads=4, concat=True)  → (N, 128)
  ├── BatchNorm(128) + ELU
  ├── GATConv(128 → 64, heads=4, concat=False) → (N, 64)
  ├── BatchNorm(64) + ELU
  └── Linear(64 → 128) → spatial_feat: (N, 128)

Layer 2: Temporal Encoding (per node across frames)
  ├── Reshape: (N, 8_frames, 128)
  ├── GRU(128, 128, num_layers=1, batch_first=True)
  └── 取最后时刻输出 → temporal_feat: (N, 128)

Layer 3: Task Heads
  ├── Occlusion Head:
  │   ├── Linear(128 → 64) + ReLU
  │   └── Linear(64 → 4) → occlusion_logits: (N, 4)
  │
  └── Trajectory Head:
      ├── Linear(128 → 64) + ReLU
      └── Linear(64 → 60) → reshape → traj_pred: (N, 30, 2)

Output: (traj_pred, occlusion_logits, temporal_feat)
```

### 2.3 训练配置

```yaml
# 优化器
optimizer: AdamW
learning_rate: 0.001
weight_decay: 0.0001
scheduler: CosineAnnealingLR
T_max: 100
min_lr: 0.00001

# 训练
epochs: 100
batch_size: 32
observation_length: 8   # 观测帧数
prediction_length: 30   # 预测步数 (3s @ 10Hz)
gradient_clip: 1.0

# 损失权重
loss_traj_weight: 1.0
loss_occlusion_weight: 0.5
loss_consistency_weight: 0.1
occlusion_penalty_gamma: 2.0   # 重遮挡惩罚系数

# 图构建
spatial_distance_threshold: 15.0  # 米
max_neighbors: 10
temporal_window: 8  # 帧
```

### 2.4 评估指标

| 指标 | 全称 | 计算方式 | MVP目标 |
|------|------|---------|---------|
| ADE | Average Displacement Error | 预测轨迹与GT的平均L2距离 | < 1.0m |
| FDE | Final Displacement Error | 最终预测点与GT的L2距离 | < 2.0m |
| Occ-ADE | Occluded ADE | 仅计算遮挡目标的ADE | < 1.5m |
| Occ-Acc | Occlusion Classification Accuracy | 遮挡等级分类准确率 | ≥ 70% |
| FPS | Frames Per Second | 每秒推理帧数 | ≥ 10 |
| E2E-Lat | End-to-End Latency | 感知到决策总延迟 | < 100ms |

### 2.5 Baseline 对比

| 方法 | 类型 | 用途 |
|------|------|------|
| Constant Velocity | 物理模型 | 下界baseline |
| Social-LSTM | 深度学习 | 经典序列预测 |
| Social-STGCNN | 图网络 | 对标方法 |
| **OccAware-STGNN (Ours)** | 图网络+遮挡感知 | 主方法 |

---

## 3. 模型部署

### 3.1 TensorRT 导出流程

```
PyTorch 模型 (.pt)
    ▼
ONNX 导出 (torch.onnx.export, opset=17)
    ▼
TensorRT 优化 (trtexec, FP16)
    ▼
TensorRT Engine (.engine)
    ▼
部署到 Jetson
```

### 3.2 推理优化策略

| 策略 | 预期加速 | MVP阶段 |
|------|---------|---------|
| FP16 量化 | 1.5-2x | 是 |
| 动态 batch | 1.2x | 是 |
| 图稀疏化 | 1.3x | 否 |
| INT8 量化 | 2-3x | 否 |
