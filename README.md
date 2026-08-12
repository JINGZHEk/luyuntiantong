# 路云天瞳

> 面向城市路口遮挡风险的分布式多智能体车路协同主动安全平台
> 作品形态：Web 可视化平台 + 路侧感知流程 + 云端轨迹预测 + 车端风险决策 + 场景回放与评估

**在线演示（域名绑定完成后）**：[https://jingzhek.ccwu.cc](https://jingzhek.ccwu.cc)

**核心大屏**：[https://jingzhek.ccwu.cc/zhiluwujie](https://jingzhek.ccwu.cc/zhiluwujie)
**代码仓库**：[https://github.com/JINGZHEk/luyuntiantong](https://github.com/JINGZHEk/luyuntiantong)

## 一、比赛作品说明

“路云天瞳”聚焦城市路口中由大型车辆、建筑物、绿化和道路设施造成的视野遮挡问题。当行人、非机动车或车辆从遮挡区域突然进入冲突路径时，仅依赖单车摄像头往往存在发现晚、预警时间短的问题。本作品通过路侧高视角感知、云端时空轨迹预测和车端风险决策，将“看见目标、预测运动、判断冲突、触发告警、留存证据”整合为一个可运行、可回放、可评估的闭环系统。

在本次竞赛线上提交范围内，作品的软件功能已完善，已形成从场景输入、目标检测与跟踪、坐标统一、消息传输、轨迹预测、风险计算、数据入库到 Web 实时展示的完整链路。项目同时提供无需硬件即可运行的场景库演示模式，评审人员可直接启动并查看系统页面、实时数据流、预测结果和历史事件。

> **线上提交与硬件展示说明**
>
> 本次作品提交为**线上平台展示**，平台仅支持 Web 界面、算法流程及演示视频的上传，硬件实物的实时交互与物理性能无法通过该平台完整呈现。作品中的 Jetson Orin Nano、Atlas 200 DK、路侧摄像头及无线通信部分已在系统架构、接口协议和迁移清单中给出设计与接入方式；线上版本使用 PC、SQLite 场景库和标准协议复现同一业务数据流。硬件端实时帧率、温度、功耗、端侧推理时延等物理指标，应以线下实机测试记录为准，不使用 Web 仿真值代替。

## 二、作品目标

本作品希望解决三个具体问题：

1. **遮挡目标发现不及时**：利用路侧视角补充车端视野，将被车辆或路口设施遮挡的交通参与者提前纳入感知范围。
2. **共享感知只有位置、缺少趋势**：对连续轨迹进行统一清洗和 10Hz 对齐，使用 STGNN 预测未来 2 秒运动趋势，为冲突判断提供提前量。
3. **算法结果难以验证和复盘**：把感知帧、预测轨迹、风险事件、推理耗时和异常记录统一持久化，通过 Web 页面完成实时观察、历史回放和指标评估。

系统按照“端侧感知轻量化、云端预测集中化、协议与硬件解耦”的原则设计。路侧节点负责视频采集、检测、跟踪和坐标转换；Cloud Agent 维护轨迹历史并执行预测；车端模块依据共享结果计算 TTC、碰撞概率和制动建议；前端负责将全过程转化为可理解的比赛演示。

## 三、核心功能完成情况

| 功能域 | 已实现能力 | 线上展示方式 |
|---|---|---|
| 路侧感知 | 视频/图片序列输入、YOLO 检测、DeepSORT 跟踪、道路坐标转换、目标置信度和遮挡信息 | PC 视频链路或内置场景回放 |
| 时序数据 | 统一轨迹字段、低置信度过滤、重复帧去除、短缺失插值、长缺失截断、越界坐标过滤、10Hz 重采样 | 数据导出脚本、测试和训练清单 |
| 云端预测 | TorchScript 预加载、CUDA warm-up、单例推理引擎、有界微批队列、batch 8、模型热更新、常速降级 | Web 预测虚线、健康接口和推理日志 |
| 结果存储 | 感知帧、事件、预测点、推理日志、预测异常和训练实验写入 SQLite | 回放页、日志 API、评估页 |
| 实时推送 | WebSocket topic 订阅、prediction 10Hz 限频、客户端独立缓冲、慢客户端丢弃旧消息 | 综合大屏和知路无界页面 |
| 风险决策 | TTC、风险等级、碰撞概率、制动建议、消息超时 fallback | 风险列表、车辆状态和事件告警 |
| 预测可视化 | 历史轨迹实线、未来轨迹虚线、置信度红绿映射、ADE/FDE 最近 100 样本滑动平均 | `/zhiluwujie` 实时三维路口 |
| 健康监控 | 模型状态、最近推理耗时、GPU 显存、SQLite 状态、队列深度和慢推理告警 | `/health` 与实时性能面板 |
| 模型训练 | 20 帧输入/20 帧真值、平移/旋转/高斯噪声增强、Adam、MSE+L2、定期验证、TorchScript 导出 | 训练脚本、实验表和评估报告 |
| 场景演示 | 16 个 GP/NM/IC 场景、启动/停止/单步/循环、事件生成和确定性回放 | 无硬件一键 Demo |

其中，GP 表示“鬼探头”类遮挡场景，NM 表示非机动车冲突场景，IC 表示路口车辆冲突场景。场景库既用于线上演示，也用于协议回归和算法流程验证。

## 四、系统总体架构

```text
┌────────────────── 路侧感知节点 / PC 回放 ──────────────────┐
│ 摄像头/视频 -> YOLO -> DeepSORT -> 遮挡估计 -> Homography  │
│                         -> 10Hz MQTT perception             │
└──────────────────────────────┬──────────────────────────────┘
                               │ road_xy 统一坐标与 track_id
                               v
┌──────────────────────── Cloud Agent ────────────────────────┐
│ MQTT 订阅 -> 轨迹历史 -> STGNN InferenceEngine             │
│                         ├─ TorchScript / GPU / batch queue  │
│                         ├─ 热更新与 constant-velocity 降级  │
│                         ├─ predictions / logs / anomalies  │
│                         └─ WebSocket prediction 10Hz        │
│ 事件检测 -> SQLite -> REST API -> 场景回放与评估            │
└─────────────────────┬───────────────────────┬───────────────┘
                      │                       │
                      v                       v
┌────────────── 车端决策 ──────────────┐  ┌──────── Web 前端 ────────┐
│ TTC / 风险分级 / 碰撞概率 / 制动建议 │  │ 实时监控 / 三维路口      │
│ 网络超时与消息缺失 fallback          │  │ 预测轨迹 / 回放 / 指标   │
└──────────────────────────────────────┘  └──────────────────────────┘
```

系统提供三种运行形态：

- **线上评审 Demo**：FastAPI 直接读取 SQLite 场景库，以 10Hz 生成完整消息，不要求摄像头、MQTT Broker、YOLO、PyTorch 或开发板。
- **PC 完整链路**：PC 读取交通视频，执行 YOLO/DeepSORT/坐标转换，通过 MQTT 连接 Cloud STGNN，并把结果推送到 Web 页面。
- **目标硬件链路**：Jetson 或 Atlas 替换 PC 路侧输入与检测后端，继续使用相同 MQTT、坐标、数据库、REST 和 WebSocket 契约。

## 五、关键技术流程

### 5.1 感知与坐标统一

路侧节点从摄像头、视频或图片序列读取帧。检测器输出类别、边界框和置信度，DeepSORT 产生跨帧稳定的 `track_id`。系统取目标框底边中心，通过现场标定的单应矩阵映射到米制 `road_xy` 坐标，并显式记录 `coordinate_status`。无法映射的目标可保留用于诊断，但不会以 `[0, 0]` 伪坐标进入轨迹预测。

### 5.2 时序清洗与样本构建

模型输入前，每个观测统一为：

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

`TrajectoryDataset` 会依次执行以下处理：

1. 剔除 `confidence < 0.3`、非有限坐标、无法解析的数据和绝对值超过 200m 的坐标。
2. 对相同 `track_id + timestamp` 的重复观测保留置信度最高点。
3. 将不均匀时间戳重采样到 10Hz。
4. 连续丢失不超过 3 帧时线性插值；超过 3 帧时截断轨迹，不跨越长空洞生成样本。
5. 生成 20 帧历史输入和 20 帧未来真值，即使用过去 2 秒预测未来 2 秒。

数据集支持 JSON、JSONL、Cloud `frames` SQLite 和场景库 SQLite，保证训练、离线评估与在线推理使用同一字段口径。

### 5.3 STGNN 训练与在线推理

训练流程使用 PyTorch DataLoader 与 Adam 优化器，支持轨迹平移、旋转和高斯噪声增强。损失由轨迹 MSE、遮挡分类交叉熵和显式 L2 正则组成；默认训练 100 epoch，每 10 epoch 验证一次，输出 ADE、FDE 和 Miss Rate，并将实验超参数、指标和模型路径写入 `experiments` 表。

训练完成后通过 `torch.jit.script` 导出 TorchScript。Cloud 启动时预加载模型并进行 CUDA warm-up，避免首条业务请求承担初始化耗时；推理请求进入有界微批队列，在短窗口内聚合并按 batch 8 执行。模型文件变化或调用重载 API 时可不停服务更新 checkpoint。模型缺失或推理失败时，系统返回带明确原因的常速度预测，而不是中断整条业务链路。

### 5.4 风险识别与结果闭环

预测结果用于补充未来运动趋势。车端模块结合自车速度、目标相对距离和冲突路径计算 TTC、风险等级、碰撞概率与制动建议。Cloud 将感知、预测、决策和事件串联到同一 `scene_id/run_id/timestamp` 时间线上，并异步写入 SQLite。WebSocket 通过独立有界队列推送消息，慢客户端不会阻塞模型推理。

### 5.5 可视化与误差评估

“知路无界”页面按 `node_id:track_id` 隔离多节点目标，实线绘制历史轨迹，虚线绘制未来 2 秒预测。预测线颜色根据置信度从红色过渡到绿色。系统在后续真值到达后计算：

- **ADE**：所有预测时间步与真实位置的欧氏距离平均值。
- **FDE**：预测终点与真实终点的欧氏距离。
- **Miss Rate**：`FDE > 2m` 的样本比例。

页面显示最近 100 个可对齐误差样本的滑动平均；没有真实数据时显示 `--`，不会使用 mock 指标冒充在线模型结果。

## 六、作品创新点

1. **面向遮挡风险的车路云闭环**：不是单独展示检测模型，而是把共享感知、时序预测、风险决策和事件回放组合为可运行系统。
2. **训练与在线推理同源的数据标准**：统一字段、坐标系、采样率和缺失处理，减少离线训练与线上服务之间的数据偏差。
3. **预测服务工程化**：TorchScript 预加载、GPU warm-up、微批、异步入库、消息背压、热更新和降级机制共同保证服务连续性。
4. **结果可解释、可追溯**：预测轨迹、置信度、异常原因、推理时延和数据库记录均可从前端或 API 查询。
5. **硬件解耦设计**：Jetson、Atlas 和 PC 共享上层协议，硬件替换不要求重写 Cloud、数据库和前端。
6. **线上可复现实验**：内置确定性场景库，无硬件也能复现典型遮挡冲突并完成评审演示。

## 七、Web 功能页面

| 页面 | 地址 | 主要用途 |
|---|---|---|
| 综合仪表盘 | `/` | 查看核心 KPI、系统状态、风险目标和近期事件 |
| 实时监控 | `/monitor` | 查看消息流、节点连接、topic 和运行日志 |
| 历史回放 | `/replay` | 按场景与事件恢复历史帧，观察风险形成过程 |
| 算法评估 | `/evaluation` | 查看 ADE、FDE、Miss Rate 和评估报告 |
| 参数设置 | `/settings` | 配置 Cloud API、场景及允许在线修改的参数 |
| 全屏演示 | `/presentation` | 适合录制视频和比赛投屏的集中展示页 |
| 知路无界 | `/zhiluwujie` | Three.js 三维路口、历史/预测轨迹和实时性能指标 |

前端使用 React 18、TypeScript、Vite、Three.js、ECharts、Ant Design 和 Zustand。连接 Cloud 后消费真实 REST/WebSocket 数据；连接中断时会显示 fallback 或 stale 状态。

## 八、快速启动线上演示

### 8.1 环境要求

- Windows 10/11 或兼容 PowerShell 环境。
- Python 3.11 或 3.12。
- Node.js 18+ 与 npm。
- 仅运行内置 Demo 时不要求 GPU、摄像头、MQTT Broker 和开发板。

### 8.2 安装依赖

```powershell
python -m pip install -r requirements.txt
cd frontend
npm install
cd ..
```

### 8.3 一键启动

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start_demo.ps1
```

启动后访问：

- 前端首页：`http://localhost:3000`
- 知路无界：`http://localhost:3000/zhiluwujie`
- Cloud API：`http://localhost:8000`
- 健康检查：`http://localhost:8000/health`

不自动打开浏览器：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start_demo.ps1 -NoBrowser
```

指定场景和帧率：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start_demo.ps1 -Scenario heavy -Fps 10
```

## 九、建议的比赛演示流程

完整演示约 5 至 8 分钟：

1. 打开综合仪表盘，说明路侧、Cloud、车辆和数据库状态。
2. 进入“知路无界”，启动 GP 类遮挡场景，观察被遮挡目标出现、历史实线和预测虚线更新。
3. 展示预测置信度颜色、TTC、风险等级和制动建议，说明系统如何提前识别冲突。
4. 切换 NM 或 IC 场景，展示多目标与不同道路参与者。
5. 打开实时性能区域，展示模型加载状态、推理耗时、GPU 显存和 ADE/FDE；无有效数据时解释 `--` 的含义。
6. 进入历史回放，根据事件恢复冲突发生前后的数据。
7. 展示训练与评估流程、TorchScript 产物及实验记录。
8. 最后说明线上平台与硬件实物展示边界，结合演示视频呈现板端接入方式。

## 十、训练与评估

生成 20/20 监督样本：

```powershell
python scripts\build_stgnn_training_data.py `
  --database data\v2x_cloud.db `
  --output data\stgnn_training `
  --input-steps 20 --future-steps 20 --fps 10
```

在已安装 CUDA PyTorch 的 Python 3.11 环境中训练：

```powershell
python scripts\train_stgnn.py `
  --samples data\stgnn_training\samples.jsonl `
  --output data\algorithm_validation_pipeline\models\occaware_stgnn.ts `
  --epochs 100 --batch-size 128 --hidden-dim 128 `
  --validate-every 10 --device auto `
  --experiments-db data\v2x_cloud.db
```

独立评估：

```powershell
python scripts\evaluate_stgnn_checkpoint.py `
  --samples data\stgnn_training\samples.jsonl `
  --checkpoint data\algorithm_validation_pipeline\models\occaware_stgnn.ts `
  --output data\algorithm_validation_pipeline\stgnn_evaluation.json `
  --device auto
```

当前场景库工程验证结果：

| 指标 | 结果 |
|---|---:|
| 样本数 | 4,774 |
| 序列规格 | 20 帧输入 + 20 帧预测，10Hz |
| 训练设备 | NVIDIA GeForce RTX 4060 Laptop GPU |
| 训练验证 ADE | 0.368m |
| 训练验证 FDE | 0.598m |
| 训练验证 Miss Rate | 2.09% |
| 全样本 checkpoint ADE | 0.35m |
| 全样本 checkpoint FDE | 0.52m |

这些结果证明数据、训练、导出和推理链路已经跑通。由于全样本评估包含训练数据，指标用于工程回归，不冒充比赛隔离测试集或真实道路泛化成绩。正式算法对比应按路口、场景或采集时段划分 held-out 测试集。

## 十一、健康监控与异常处理

`GET /health` 和 `GET /api/v1/health` 返回模型加载状态、最近推理耗时、warm-up、队列深度、GPU 显存、SQLite 连接和 WebSocket 客户端数量。

系统内置以下异常规则：

- 单批推理超过 50ms 记录 warning。
- 连续 5 批超过 100ms 激活慢推理告警。
- 预测轨迹相邻点单步位移超过 5m 写入 `prediction_anomalies`。
- 坐标非有限或超出 ±200m 时标记无效，不进入模型。
- 模型不可用时使用常速度 fallback，并记录具体原因。
- SQLite 或 WebSocket 队列拥塞时执行有界丢弃，不反向阻塞主推理循环。

推理日志和异常可通过以下接口查询：

```powershell
Invoke-RestMethod "http://127.0.0.1:8000/api/v1/logs/prediction?limit=100"
```

## 十二、项目结构

```text
luyuntiantong/
├─ configs/                     # 路侧、Cloud、车辆、MQTT 与标定配置
├─ data/                        # SQLite 场景库、训练样本和模型产物
├─ docs/                        # 架构、API、数据、推理与硬件迁移文档
├─ frontend/                    # React + TypeScript Web 前端
├─ scripts/                     # 启动、训练、评估、数据构建和验证脚本
├─ src/
│  ├─ cloud_twin/               # Cloud Agent、API、推理、数据库与场景 Demo
│  ├─ communication/            # MQTT、内存消息总线和协议模型
│  ├─ dataset/                  # 数据清洗、样本构建与评估
│  ├─ roadside_perception/      # 检测、跟踪、坐标映射和路侧 Agent
│  ├─ scenario_library/         # 16 个场景的编排、编译和回放
│  └─ vehicle_decision/         # TTC、风险评估、制动和 fallback
└─ tests/                       # 后端、协议、训练、推理和部署测试
```

## 十三、验证命令

后端核心测试：

```powershell
python -m unittest `
  tests.test_trajectory_dataset `
  tests.test_prediction_runtime `
  tests.test_cloud_stgnn_service `
  tests.test_stgnn_training_data `
  tests.test_stgnn_training_script `
  tests.test_stgnn_checkpoint_evaluation `
  tests.test_pc_cloud_pipeline
```

前端构建、单元测试与规范检查：

```powershell
cd frontend
npm run build
npm run test:unit
npm run lint
```

完整项目验证：

```powershell
scripts\verify_all.ps1
```

## 十四、硬件接入说明

目标路侧硬件为 Jetson Orin Nano 或 Atlas 200 DK。二者负责摄像头采集、YOLO 检测、DeepSORT 跟踪、坐标转换和 MQTT 发布，Cloud STGNN 默认不放在板端运行。

- Jetson 路线使用 CUDA/TensorRT，模型可转换为 ONNX/engine。
- Atlas 路线使用 CANN/ACL/OM，需要独立 DetectorBackend 和模型转换流程。
- 两条路线共享 `v2x/{scene_id}/roadside/{node_id}/perception` 协议。
- 板端不通过感知 topic 发送原始视频，只发送结构化目标和心跳资源数据。
- 硬件验收应记录 FPS、检测/跟踪时延、坐标有效率、ID switch、网络延迟、温度和功耗。

线上 Web 演示复现的是同一消息契约与业务流程，不能替代开发板的物理性能测量。完整迁移步骤见 [docs/BOARD_MIGRATION_CHECKLIST.md](docs/BOARD_MIGRATION_CHECKLIST.md)。

## 十五、项目边界与结果可信度

为保证比赛材料可核验，本作品对展示结果采用以下原则：

- 软件闭环的“已完成”以仓库代码、自动化测试、一键 Demo、API 和数据库记录为依据。
- Web 实时指标只读取后端真实数据；数据不存在时展示 `--`，不自动填充 mock 数值。
- 场景库模型成绩属于工程验证，不表述为真实 DAIR-V2X 或比赛盲测成绩。
- TorchScript 是 Cloud PyTorch 产物；Jetson TensorRT 与 Atlas OM 必须分别转换和实测。
- 线上提交受平台能力限制，硬件实时交互和物理性能通过演示视频、架构说明及线下测试材料补充呈现。

## 十六、文档导航

| 文档 | 内容 |
|---|---|
| [项目介绍.md](项目介绍.md) | 业务背景、目标场景、模块职责、创新点与完成范围 |
| [启动.md](启动.md) | Demo、PC-cloud、模型训练、验证命令和常见问题 |
| [frontend/README.md](frontend/README.md) | 前端页面、数据源、轨迹可视化和构建说明 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 系统分层、运行模式、时序、背压和降级机制 |
| [docs/API_SPEC.md](docs/API_SPEC.md) | MQTT、REST、WebSocket 消息与兼容契约 |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | 轨迹字段、清洗规则、SQLite、训练和指标口径 |
| [docs/STGNN_RUNTIME.md](docs/STGNN_RUNTIME.md) | 数据生成、训练、评估、在线推理和监控手册 |
| [docs/BOARD_MIGRATION_CHECKLIST.md](docs/BOARD_MIGRATION_CHECKLIST.md) | Jetson/Atlas 接入、实测项目和验收证据 |
| [docs/ONLINE_DEPLOYMENT.md](docs/ONLINE_DEPLOYMENT.md) | Railway 上线、自定义域名、DNS、Volume 与验收步骤 |

---

本 README 作为比赛作品主说明文件。评审时建议先运行一键 Demo，再结合演示视频、算法流程和专项技术文档查看完整作品能力。
