# V2X 分布式多智能体车路协同遮挡感知平台 — 一周MVP开发计划

> 目标：7天内完成端到端原型闭环，覆盖路侧感知、车端决策、云端孪生三端核心功能

---

## 总览

| 日期 | 阶段 | 核心交付物 | 验收标准 |
|------|------|-----------|---------|
| Day 1 (周一) | 项目启动 & 环境搭建 | 项目文档体系、开发环境、数据集 | 文档齐全，DAIR-V2X数据可加载 |
| Day 2 (周二) | 路侧感知模型开发 | ST-GNN 模型 v0.1 | 在DAIR-V2X上完成前向推理 |
| Day 3 (周三) | 路侧感知训练 & 车端决策 | 训练pipeline + 决策模块 | 模型可训练，决策模块可接收特征 |
| Day 4 (周四) | 通信链路 & 协同融合 | MQTT通信 + 特征融合 | 路侧→车端特征传输延迟 <100ms |
| Day 5 (周五) | 云端孪生开发 | Three.js可视化 + 数据持久化 | 3D场景可渲染，数据可回放 |
| Day 6 (周六) | 系统联调 & 小车验证 | 全链路联调 | 端到端闭环跑通 |
| Day 7 (周日) | 测试优化 & 文档收尾 | 测试报告 + 演示视频 | MVP可演示 |

---

## Day 1 — 项目启动 & 环境搭建

### 上午 (4h)
- [ ] **项目文档编写**
  - 完善 README.md（项目简介、架构图、快速开始）
  - 编写 MVP 需求文档 (`docs/MVP_REQUIREMENTS.md`)
  - 编写技术架构文档 (`docs/ARCHITECTURE.md`)
  - 编写 API 接口规范 (`docs/API_SPEC.md`)

### 下午 (4h)
- [ ] **开发环境搭建**
  - Python 3.10+ 虚拟环境，安装 PyTorch、PyG (PyTorch Geometric)、torchvision
  - 安装 MQTT 客户端 (paho-mqtt)、Three.js 开发环境 (Node.js + Vite)
  - 配置 TensorRT 环境（如有 Jetson 设备）
  - 编写 `requirements.txt` 和 `package.json`
- [ ] **数据集准备**
  - 下载 DAIR-V2X 数据集（至少路侧子集）
  - 编写数据加载器 `src/utils/data_loader.py`
  - 验证数据格式，完成 EDA 脚本 (`scripts/data_eda.py`)

### Day 1 交付检查
- [x] 所有文档模板就位
- [x] `python -c "import torch; import torch_geometric"` 无报错
- [x] 数据加载器可返回样本 batch

---

## Day 2 — 路侧感知模型开发

### 上午 (4h)
- [ ] **时空图神经网络 (ST-GNN) 核心模型**
  - 实现图构建模块 `src/roadside_perception/graph_builder.py`
    - 节点：行人/车辆检测框（位置、速度、类别）
    - 边：空间邻近关系（距离阈值）+ 时序关联（同一目标跨帧）
  - 实现空间图卷积层 `src/roadside_perception/spatial_conv.py`
    - 基于 GATConv 或 GCNConv
  - 实现时序编码模块 `src/roadside_perception/temporal_encoder.py`
    - GRU/LSTM 对节点特征序列建模

### 下午 (4h)
- [ ] **遮挡感知模块**
  - 实现遮挡状态估计 `src/roadside_perception/occlusion_estimator.py`
    - 基于检测框可见比例 + 历史轨迹连续性判断遮挡程度
  - 实现轨迹预测头 `src/roadside_perception/trajectory_predictor.py`
    - 输入：ST-GNN 编码特征
    - 输出：未来 T 步 (x, y) 坐标序列
  - 整合为完整模型 `src/roadside_perception/stgnn_model.py`
  - 编写单元测试 `tests/unit/test_stgnn.py`，验证前向传播

### Day 2 交付检查
- [x] 模型可接受图数据输入，输出预测轨迹
- [x] 参数量合理（目标 <5M），推理时间 <50ms（GPU）

---

## Day 3 — 模型训练 & 车端决策

### 上午 (4h)
- [ ] **训练Pipeline**
  - 实现自适应遮挡感知损失函数 `src/roadside_perception/losses.py`
    - L_total = L_traj + α · L_occlusion
    - 对重度遮挡样本施加更高惩罚权重
  - 实现训练脚本 `scripts/train_stgnn.py`
    - 支持断点续训、TensorBoard 日志、模型保存
  - 在 DAIR-V2X 子集上启动训练（至少跑通 10 epochs）

### 下午 (4h)
- [ ] **车端决策模块**
  - 实现特征接收与融合 `src/vehicle_decision/feature_fusion.py`
    - 融合路侧共享特征 + 自车感知特征
  - 实现风险评估模块 `src/vehicle_decision/risk_assessor.py`
    - TTC (Time-to-Collision) 计算
    - 碰撞概率估计
  - 实现制动决策模块 `src/vehicle_decision/brake_controller.py`
    - 基于风险等级触发分级制动策略
  - 编写单元测试 `tests/unit/test_decision.py`

### Day 3 交付检查
- [x] 训练 loss 在 10 epochs 内有明显下降
- [x] 车端决策模块可基于模拟输入做出制动决策

---

## Day 4 — 通信链路 & 协同融合

### 上午 (4h)
- [ ] **MQTT 通信模块**
  - 实现消息协议定义 `src/communication/protocol.py`
    - 定义 Topic 命名规范：`v2x/{scene_id}/roadside/perception`
    - 定义消息格式：Protobuf 或 MessagePack 序列化
  - 实现路侧发布端 `src/communication/roadside_publisher.py`
  - 实现车端订阅端 `src/communication/vehicle_subscriber.py`
  - 搭建本地 MQTT Broker (Mosquitto)

### 下午 (4h)
- [ ] **端到端通信测试**
  - 实现延迟测试脚本 `scripts/latency_test.py`
  - 测量端到端传输延迟，目标 <100ms
  - 实现平滑退化机制 `src/communication/fallback.py`
    - 通信中断时车端自动切换为纯自车感知模式
  - 编写集成测试 `tests/integration/test_communication.py`

### Day 4 交付检查
- [x] MQTT 消息可从路侧端传到车端
- [x] 平均延迟 <100ms
- [x] 断连后车端可自动降级

---

## Day 5 — 云端孪生开发

### 上午 (4h)
- [ ] **3D 可视化前端**
  - 搭建 Three.js 项目 `src/cloud_twin/frontend/`
  - 实现场景渲染：道路、建筑物遮挡区域、行人/车辆模型
  - 实现实时数据驱动：WebSocket 接收 MQTT 转发数据
  - 实现 UI 控件：视角切换、时间轴拖拽、图层开关

### 下午 (4h)
- [ ] **数据持久化 & 回放**
  - 搭建时序数据库 (InfluxDB 或 TimescaleDB)
  - 实现数据写入服务 `src/cloud_twin/backend/data_writer.py`
  - 实现历史回放 API `src/cloud_twin/backend/replay_api.py`
  - 实现高危事件标注与检索
  - 编写测试 `tests/integration/test_cloud_twin.py`

### Day 5 交付检查
- [x] 3D 场景可渲染车辆和行人运动
- [x] 可从数据库回放历史场景
- [x] 高危事件可标注和检索

---

## Day 6 — 系统联调 & 小车验证

### 上午 (4h)
- [ ] **全链路联调**
  - 路侧感知 → MQTT → 车端决策 全链路测试
  - 车端决策 → 制动指令 → 小车执行 验证
  - 云端孪生实时展示全链路数据流
  - 修复联调中发现的 Bug

### 下午 (4h)
- [ ] **华为网联小车沙盘验证**（如设备到位）
  - 搭建典型"鬼探头"场景
    - 遮挡物：模拟建筑/停靠车辆
    - 行人：从遮挡区突然出现
  - 录制测试视频
  - 记录关键指标：
    - 检测提前量（比单车感知提前多少ms）
    - 制动响应时间
    - 碰撞避免率
  - 若无实车设备，使用 CARLA/SUMO 仿真替代

### Day 6 交付检查
- [x] 端到端链路无阻断
- [x] 至少完成 3 次完整"鬼探头"场景测试
- [x] 关键指标数据记录完整

---

## Day 7 — 测试优化 & 文档收尾

### 上午 (4h)
- [ ] **性能优化**
  - 模型推理优化（量化/剪枝，如时间允许）
  - 通信消息压缩优化
  - 端到端延迟瓶颈分析与优化
- [ ] **测试报告**
  - 编写测试报告 `docs/TEST_REPORT.md`
  - 整理所有指标数据
  - 绘制对比图表（协同 vs 单车感知）

### 下午 (4h)
- [ ] **文档收尾**
  - 完善 README.md（含演示 GIF/视频链接）
  - 编写部署指南 `docs/DEPLOYMENT_GUIDE.md`
  - 编写开发者指南 `docs/DEVELOPER_GUIDE.md`
  - 录制 3-5 分钟演示视频
  - 整理代码，确保 lint 通过
- [ ] **项目回顾**
  - 总结 MVP 完成度
  - 列出后续迭代计划 `docs/ROADMAP.md`

### Day 7 交付检查
- [x] 测试报告完整
- [x] 演示视频可播放
- [x] 所有文档完整且一致

---

## 关键风险 & 应对

| 风险 | 概率 | 影响 | 应对策略 |
|------|------|------|---------|
| DAIR-V2X 数据格式不兼容 | 中 | 高 | Day1 优先验证数据加载，备选 nuScenes |
| ST-GNN 训练不收敛 | 中 | 高 | 准备 baseline（简单MLP），确保pipeline跑通 |
| Jetson 设备不到位 | 高 | 中 | PC端先开发，TensorRT部署延后 |
| 华为小车联调困难 | 高 | 中 | CARLA 仿真兜底 |
| MQTT 延迟超标 | 低 | 中 | 本地部署 Broker，消息压缩 |

---

## 每日站会模板

```
昨天完成了什么？
今天计划做什么？
有什么阻塞/需要帮助？
```

---

## 技术栈速览

| 模块 | 技术选型 |
|------|---------|
| 路侧感知 | PyTorch + PyG (PyTorch Geometric) |
| 车端决策 | Python + NumPy |
| 通信 | MQTT (Mosquitto) + MessagePack |
| 云端可视化 | Three.js + Vite |
| 云端后端 | FastAPI + InfluxDB |
| 模型加速 | TensorRT (Jetson) |
| 仿真 | CARLA / SUMO (备选) |
| 数据集 | DAIR-V2X |
