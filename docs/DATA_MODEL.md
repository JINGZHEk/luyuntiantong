# 数据与模型

> 最后更新：2026-08-12

## 统一轨迹格式

每个观测点包含：

```json
{
  "track_id": 7,
  "class": "car",
  "x": 12.4,
  "y": 3.1,
  "vx": 4.0,
  "vy": 0.0,
  "timestamp": 1710000000000,
  "confidence": 0.92
}
```

字段约束：

| 字段 | 约束 |
|---|---|
| `track_id` | 同一数据源内稳定；多场景导出时加场景前缀 |
| `class` | 字符串类别，未知类别使用 `unknown` |
| `x/y` | `road_xy` 米制坐标，必须有限且绝对值不超过 200m |
| `vx/vy` | m/s；缺失时由相邻有效位置估计 |
| `timestamp` | Unix milliseconds 或场景相对 milliseconds |
| `confidence` | `[0,1]`，低于 0.3 丢弃 |

## 清洗与重采样

`TrajectoryDataset` 支持 JSON、JSONL、Cloud `frames` SQLite 和场景库 SQLite。

处理顺序：

1. 无法解析、低置信度、非有限坐标和越界坐标丢弃。
2. `(track_id, timestamp)` 重复时保留 confidence 最高点。
3. 对真实感知序列按 10Hz 对齐；连续缺失不超过 3 帧线性插值。
4. 超过 3 帧的感知缺失切断轨迹，不跨长空洞生成训练样本。
5. 场景库 `scenario_keyframes` 是编排控制点，不是传感器丢帧；先按 10Hz 展开控制点，再进入统一清洗。

监督样本默认是 20 帧观察 + 20 帧真值，即 2 秒历史预测未来 2 秒。

## 模型输入输出

当前 TorchScript 模型输入：`[batch, history=20, feature=8]`。

单帧特征：

```text
[x, y, bbox_width, bbox_height, vx, vy, class_id, occlusion_score]
```

输出：

- 轨迹头：`[batch, future=20, 2]`。
- 遮挡分类头：`[batch, 4]`。

当前在线服务按目标构建序列，并通过微批提高吞吐。模型代码保留 dense attention 和 GRU 结构，但当前标准训练样本是单目标序列；若比赛要求严格的多目标交互 STGNN，需要把样本升级为同帧多节点图并补充邻接/边特征，不能仅凭模型名称宣称已完成社会交互建模。

## 训练

`scripts/train_stgnn.py`：

- 优化器：Adam。
- 损失：轨迹 MSE + 遮挡交叉熵 + 显式 L2。
- 增强：平移、旋转、高斯位置噪声，并同步旋转速度向量。
- 默认 100 epoch，每 10 epoch 验证一次。
- 指标：ADE、FDE、Miss Rate（FDE > 2m）。
- 导出：`torch.jit.script`，避免 trace 把 GRU hidden state 固化到 CPU。
- 设备：`--device auto` 自动选择 CUDA 或 CPU。
- 实验：可写入 SQLite `experiments`。

当前脚本使用固定随机种子的样本级训练/验证切分。它适合工程回归，但比赛成绩必须改用按路口、场景或采集时段分组的 held-out 切分，避免同轨迹窗口泄漏。

## 评估口径

| 指标 | 定义 |
|---|---|
| ADE | 所有预测时间步与 GT 的欧氏距离均值 |
| FDE | 最后预测时间步与 GT 的欧氏距离 |
| Miss Rate | `FDE > 2m` 的样本比例 |
| infer_ms | 单批 TorchScript 前向耗时，不包含 MQTT 和前端 |

没有检测标注时，precision/recall/F1 必须为 `null`；没有遮挡标签时，Occ-ADE/Occ-Acc 必须为 `null`，不可用 0 或 1 冒充有效成绩。

2026-08-11 的场景库链路验证结果：

| 项目 | 结果 |
|---|---:|
| 样本数 | 4,774 |
| 序列 | 20/20 @ 10Hz |
| GPU | RTX 4060 Laptop GPU |
| 训练验证 ADE | 0.368m |
| 训练验证 FDE | 0.598m |
| 训练验证 Miss Rate | 2.09% |
| 全样本 checkpoint ADE | 0.35m |
| 全样本 checkpoint FDE | 0.52m |

这些数值来自同一场景库生成数据，且全样本评估包含训练数据，只能作为工程链路和回归基线，不是比赛泛化成绩。

## 数据来源

### 场景库

SQLite 场景库包含 16 个 GP/NM/IC 场景：鬼探头、非机动车横穿和路口车辆冲突。它适合确定性回放、协议测试和 smoke 训练。

### DAIR-V2X

DAIR-V2X 用于后续真实路侧/车端协同训练和跨路口评估。必须保留标定、坐标系、场景 ID 和采集时段，并按场景划分 train/validation/test。

### 真实 PC/板端数据

真实采集应同时记录标定版本、帧率、跟踪 ID switch、坐标有效率、光照、天气和硬件信息。原始视频不通过 MQTT 感知 topic 传输。

## 模型产物

- TorchScript：`data/algorithm_validation_pipeline/models/occaware_stgnn.ts`
- 评估报告：`data/algorithm_validation_pipeline/stgnn_evaluation.json`
- 实验记录：`data/v2x_cloud.db` 的 `experiments`

TorchScript 是 Cloud PyTorch 部署产物。Jetson TensorRT 与 Atlas OM 需要分别转换和复测，不能复用对方的性能结论。
