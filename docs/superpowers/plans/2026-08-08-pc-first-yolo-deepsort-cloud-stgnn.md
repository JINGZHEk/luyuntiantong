# PC-first YOLO + DeepSORT + Cloud STGNN Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不依赖小车开发板的前提下，完成“视频/回放输入 → YOLO + DeepSORT → MQTT 局域网传输 → 平台侧 STGNN 预测 → SQLite/WebSocket/前端展示”的可验证闭环，并为后续替换为开发板摄像头输入保留稳定接口。

**Architecture:** PC 端只负责视频读取、目标检测、DeepSORT 跟踪、坐标转换和原始轨迹发布；Cloud Agent 接收原始轨迹后维护跨帧历史并调用 TorchScript STGNN，随后将带预测结果的感知数据写入 SQLite、广播到 WebSocket 和前端。后续接入小车时，只替换 PC 端的 `FrameSource` 与部署配置，不改变 MQTT 消息协议、Cloud STGNN 服务和前端消费逻辑。

**Tech Stack:** Python 3.11 algorithm environment, OpenCV, Ultralytics YOLO, `deep-sort-realtime`, PyTorch/PyG/TorchScript, paho-mqtt, FastAPI, SQLite WAL, React/TypeScript/Vite, WebSocket。

---

## 1. Scope and acceptance criteria

### 1.1 本阶段范围

- 使用 PC 上的 MP4、图像序列或合成帧作为输入，不要求连接小车开发板。
- 明确使用 YOLO 做检测、DeepSORT 做 track ID 管理；保留 `annotations` 模式用于现有回放测试。
- 由平台 Cloud Agent 执行 STGNN，不在 PC 感知端提前生成最终预测结果。
- 传输对象至少包含 `track_id`、类别、bbox、置信度、速度、道路坐标、时间戳和帧号。
- 前端能区分“原始感知”“STGNN 预测”“匀速降级”“坐标无效”四种状态。
- 所有新功能都有单元测试，并保留已有 M0/M1/M2 测试链路。

### 1.2 本阶段不做

- CSI/USB 摄像头和 Jetson/RK 开发板驱动联调。
- TensorRT、CUDA kernel、板端温度和功耗优化。
- CAN、PWM、电机控制和实际制动输出。
- 用没有真实道路标定的数据宣称达到最终 ADE/FDE 指标。

后续硬件迁移目标明确为两条：Jetson Orin Nano 和华为 Atlas 200 DK。两者共用本计划定义的 MQTT 感知协议；Jetson 侧优先验证 CUDA/TensorRT 推理，Atlas 侧按 Ascend CANN/ACL 与模型转换后的运行时单独验证。不能把 Jetson 的 PyTorch/Ultralytics 运行结果直接视为 Atlas 200 DK 的可部署结果。

### 1.3 验收标准

1. PC 端产生至少 10 FPS 的感知消息，消息能够通过 MQTT 进入 Cloud Agent。
2. Cloud Agent 只在对象具有有效道路坐标和足够历史长度时调用 STGNN；无效时明确返回降级原因，不把 `[0, 0]` 当作真实位置。
3. 每个输入帧最终可在 SQLite 的 `frames.perception_data` 中查到，并能通过 WebSocket 推送到前端。
4. 前端实时页面显示 track、预测轨迹、预测后端、推理耗时和降级原因。
5. PC 回放、MQTT、Cloud STGNN、WebSocket 和前端构成可重复的端到端演示。
6. `python -m pytest -q` 通过；前端 `npm run build` 通过；算法环境就绪检查通过。

## 2. Current baseline and reuse map

当前代码已经具备平台骨架，但默认配置仍是 `annotations + constant_velocity`。

| 能力 | 现有位置 | 本计划的处理 |
|---|---|---|
| MQTT 客户端和 topic | `src/communication/mqtt_client.py`, `src/communication/protocol.py` | 扩展字段，保持旧字段兼容 |
| 路端 Agent | `src/roadside_perception/roadside_agent.py` | 继续作为消息发布入口，增加视频帧源和坐标转换 |
| YOLO | `src/roadside_perception/detector.py` | 保留检测器，增加显式 tracker 后端 |
| STGNN 模型/预测器 | `src/roadside_perception/stgnn_model.py`, `src/roadside_perception/stgnn_predictor.py` | 复用特征构造和 TorchScript 加载逻辑，在 Cloud Agent 侧调用 |
| Cloud 订阅/存储 | `src/cloud_twin/cloud_agent.py`, `src/cloud_twin/data_store.py` | 在存储和广播前加入 Cloud STGNN 服务 |
| REST/WebSocket | `src/cloud_twin/api.py` | 增加预测状态查询和实时消息字段，不另起服务 |
| 前端实时状态 | `frontend/src/store/monitorStore.ts`, `frontend/src/types/*.ts` | 展示预测状态与来源 |
| 现有回放和验证 | `src/roadside_perception/replay_engine.py`, `tests/` | 作为回归测试，不删除 |

现有验证事实：Python 后端测试为 96 通过、2 跳过；`D:\Anaconda\envs\v2x-ghost-algorithm` 已具备 Python 3.11、Ultralytics、PyTorch 和 PyG。仓库中没有真正的 DeepSORT 后端实现；现有 `Detector.detect()` 调用 `YOLO.track()`，没有显式指定 DeepSORT。现有 STGNN 报告是链路验证结果，ADE/FDE 尚未达到项目目标。

## 3. Target data flow

```text
MP4 / image sequence / future board camera
        │
        ▼
PC FrameSource
        │ image + frame_id + timestamp
        ▼
YOLO detector → DeepSORT tracker
        │ bbox + class + confidence + track_id
        ▼
CoordinateMapper
        │ road_xy + velocity + coordinate_status
        ▼
RoadsideAgent → MQTT perception topic
        │
        ▼
CloudAgent → CloudSTGNNService
        │ per-track history + TorchScript inference
        ├── SQLite frame persistence
        ├── WebSocket {type: perception}
        └── optional cloud prediction topic for later vehicle decision
        │
        ▼
React monitor / dashboard / replay / evaluation
```

### 3.1 MQTT topic

继续使用：

```text
v2x/{scene_id}/roadside/{node_id}/perception
```

Cloud Agent 内部预测结果先合并回同一条 WebSocket `perception` 消息，避免前端同时维护两条不同时间线。为后续车端闭环保留：

```text
v2x/{scene_id}/cloud/prediction
```

该 topic 只有在需要让 Vehicle Agent 消费平台预测时才启用，本阶段不要求小车接收回传。

### 3.2 消息协议

在 `src/communication/protocol.py` 中将 `PerceptionMessage` 扩展为以下兼容结构：

```json
{
  "schema_version": 1,
  "message_type": "perception",
  "scene_id": "scene_001",
  "timestamp": 1720000000000,
  "frame_id": 120,
  "node_id": "pc_roadside_001",
  "source": {
    "device_type": "pc_replay",
    "camera_id": "cam_001",
    "input_type": "video"
  },
  "coordinate_frame": "road_xy",
  "objects": [
    {
      "track_id": 7,
      "class": "car",
      "bbox": [420.0, 210.0, 96.0, 80.0],
      "world_pos": [12.4, 3.8],
      "velocity": [4.1, 0.2],
      "confidence": 0.91,
      "occlusion_level": 0,
      "predicted_traj": [],
      "coordinate_status": "valid",
      "prediction_status": "deferred"
    }
  ],
  "prediction": {
    "location": "cloud",
    "backend": "stgnn",
    "status": "ready",
    "model_path": "models/occaware_stgnn.ts",
    "latency_ms": 8.4,
    "reason": null
  },
  "processing_time_ms": 31.2
}
```

兼容规则：旧消息缺失 `schema_version`、`source`、`coordinate_status` 或 `prediction` 时按 `1`、空来源、`unknown` 和 `deferred` 处理；旧的 `predicted_traj` 字段继续保留。

## 4. File map

### 4.1 Create

- `src/roadside_perception/frame_source.py`：统一视频文件、图片序列和未来摄像头输入的帧迭代接口。
- `src/roadside_perception/tracker.py`：DeepSORT 适配器和 tracker 输出归一化。
- `src/roadside_perception/coordinate_mapper.py`：bbox 底边中心到道路坐标的单应性映射。
- `src/cloud_twin/stgnn_service.py`：按 `node_id + track_id` 管理历史并调用 TorchScript STGNN。
- `scripts/run_pc_perception.py`：PC 感知发布入口。
- `scripts/run_pc_cloud_demo.ps1`：启动 Broker、Cloud Agent、PC 感知和前端的演示编排。
- `configs/roadside.pc.yaml`：PC 视频输入、YOLO、DeepSORT 和坐标配置。
- `configs/calibration/scene_001.json`：示例单应性矩阵和标定元数据。
- `tests/test_frame_source.py`：帧源测试。
- `tests/test_tracker.py`：DeepSORT 适配器测试。
- `tests/test_coordinate_mapper.py`：坐标映射测试。
- `tests/test_cloud_stgnn_service.py`：平台侧预测、历史、降级和 track 隔离测试。
- `tests/test_pc_cloud_pipeline.py`：无硬件的 MQTT/Cloud 集成测试。

### 4.2 Modify

- `src/communication/protocol.py`：增加协议元数据和预测状态字段。
- `src/roadside_perception/detector.py`：检测和跟踪解耦，支持 `deepsort` 与旧 `ultralytics` 路径。
- `src/roadside_perception/roadside_agent.py`：接入 `FrameSource`、坐标转换和 `prediction.location=cloud` 模式。
- `src/cloud_twin/cloud_agent.py`：感知入站后调用 `CloudSTGNNService`，再写库和广播。
- `configs/roadside.yaml`：增加输入、跟踪、坐标和预测位置配置。
- `configs/cloud.yaml`：增加 STGNN 模型和历史窗口配置。
- `environment-algorithm.yml`：增加 OpenCV、DeepSORT 依赖。
- `requirements.txt`：补充 PC 测试所需的 OpenCV/DeepSORT 依赖说明。
- `frontend/src/types/realtime.ts`、`frontend/src/types/roadside.ts`：增加协议字段类型。
- `frontend/src/store/monitorStore.ts`：保存预测来源、状态、延迟和降级原因。
- `frontend/src/widgets/perception-cards/PerceptionCards.tsx`：显示检测/跟踪/预测状态。
- `frontend/src/widgets/event-table/EventTable.tsx` 或对应样式：显示预测触发的高风险事件来源。
- `docs/API_SPEC.md`、`docs/DATA_MODEL.md`、`启动.md`：补充 PC 闭环和消息协议。

## 5. Implementation tasks

### Task 1: Lock protocol and configuration before algorithm changes

**Files:**
- Modify: `src/communication/protocol.py`
- Create: `configs/roadside.pc.yaml`
- Modify: `configs/roadside.yaml`, `configs/cloud.yaml`
- Create: `tests/test_protocol.py`

- [x] **Step 1: Write protocol compatibility tests.**

测试必须覆盖：旧字段仍可序列化；新字段默认值稳定；消息能区分 `deferred`、`ready`、`fallback` 和 `invalid_coordinate`。

- [x] **Step 2: Run the focused test and confirm the new assertions fail.**

Run: `python -m pytest tests/test_protocol.py -q`

Expected: 新增字段断言失败，旧测试保持可导入。

- [x] **Step 3: Extend dataclasses without breaking positional callers.**

新增字段全部放在已有必填字段之后，并给出默认值。`to_dict()` 输出 `schema_version=1`、`message_type="perception"`、`source`、`coordinate_frame` 和 `prediction`；旧调用只传原有字段时仍能运行。

- [x] **Step 4: Add the PC/cloud configuration.**

`configs/roadside.pc.yaml` 至少包含：

```yaml
node_id: pc_roadside_001
scene_id: scene_001
input:
  type: video
  path: data/pc_demo/traffic.mp4
  fps: 10
detection:
  mode: yolo
  model: yolov8n
  confidence_threshold: 0.4
  iou_threshold: 0.5
  target_classes: [person, car, truck, bus, bicycle]
tracking:
  backend: deepsort
  max_age: 30
  n_init: 2
coordinates:
  mode: homography
  calibration_path: configs/calibration/scene_001.json
prediction:
  location: cloud
  backend: none
```

`configs/cloud.yaml` 增加：

```yaml
prediction:
  enabled: false  # 默认轻量环境保持安全；configs/cloud.pc.yaml 才启用真实 Cloud STGNN
  backend: stgnn
  model_path: data/algorithm_validation_pipeline/models/occaware_stgnn.ts
  history_length: 8
  predict_steps: 30
  fps: 10
  min_history: 2
```

- [x] **Step 5: Run protocol and configuration tests.**

Run: `python -m pytest tests/test_protocol.py tests/test_deployment_config.py -q`

Expected: exit code `0`。

### Task 2: Add a hardware-independent frame source

**Files:**
- Create: `src/roadside_perception/frame_source.py`
- Create: `tests/test_frame_source.py`
- Create: `scripts/run_pc_perception.py`

- [x] **Step 1: Define the frame source interface.**

实现 `FrameSource` 协议和 `OpenCVFrameSource`：`__iter__()` 每次返回 `{frame_id, timestamp, image}`；视频文件按配置 FPS 节流，图片序列使用排序后的文件名，打开失败抛出带路径的 `ValueError`。输入设备号保留为整数参数，但本阶段只测试文件路径。

- [x] **Step 2: Write tests with a fake capture object.**

覆盖 frame ID 连续、时间戳单调、FPS 参数校验、空目录和无效路径错误；测试不依赖真实摄像头。

- [x] **Step 3: Implement `scripts/run_pc_perception.py`.**

脚本读取 `--config`，构造 `RoadsideAgent`，连接 MQTT，遍历 `FrameSource`，对每帧调用 `agent.process_frame(frame)`；`--max-frames` 用于自动化验证，退出时调用 `agent.stop()`。脚本不得在消息中上传原始图像，避免局域网带宽被视频占满。

- [x] **Step 4: Run focused tests.**

Run: `python -m pytest tests/test_frame_source.py -q`

Expected: exit code `0`。

### Task 3: Replace implicit Ultralytics tracking with an explicit DeepSORT adapter

**Files:**
- Create: `src/roadside_perception/tracker.py`
- Modify: `src/roadside_perception/detector.py`
- Modify: `environment-algorithm.yml`, `requirements.txt`
- Create: `tests/test_tracker.py`
- Modify: `tests/test_yolo_image_inference.py`, `tests/test_yolo_detection_script.py` only where the old tracker contract is asserted

- [x] **Step 1: Add the dependency in the algorithm environment.**

在 `environment-algorithm.yml` 的 pip 列表加入 `deep-sort-realtime>=1.3.2`、`opencv-python>=4.8.0` 和 `setuptools<81`（DeepSORT 1.3.2 仍使用 `pkg_resources`）；在 `requirements.txt` 的算法依赖区加入同样的约束。

- [x] **Step 2: Write adapter tests with a fake DeepSORT object.**

输入格式固定为 `([left, top, width, height], confidence, class_name)`；输出格式固定为 `{track_id, bbox, class, confidence}`。测试必须验证：未确认轨迹被过滤、track ID 保持整数、bbox 从 `ltrb` 统一为 `[x,y,w,h]`、空输入返回空列表。

- [x] **Step 3: Implement `DeepSortTracker`.**

构造函数接受 `max_age`、`n_init`、`max_iou_distance` 和可注入 tracker 工厂；生产默认使用 `deep_sort_realtime.deepsort_tracker.DeepSort`。适配器只负责 tracking，不负责 YOLO 推理。

- [x] **Step 4: Update `Detector`.**

增加 `tracker_backend` 参数。`deepsort` 路径调用 `model.predict()` 后把检测框交给 `DeepSortTracker`；`ultralytics` 路径保留现有 `model.track()` 逻辑，供兼容和回归测试使用。默认 `configs/roadside.yaml` 保持旧行为，`configs/roadside.pc.yaml` 使用 `deepsort`。

- [x] **Step 5: Run detector and tracker tests in the algorithm environment.**

Run: `& 'D:\Anaconda\envs\v2x-ghost-algorithm\python.exe' -m pytest tests/test_tracker.py tests/test_yolo_image_inference.py tests/test_yolo_detection_script.py -q`

Expected: exit code `0`；真实图片 smoke test 至少得到一个检测框，测试输出不依赖外部网络下载已存在的模型缓存。

### Task 4: Add pixel-to-road coordinate mapping

**Files:**
- Create: `src/roadside_perception/coordinate_mapper.py`
- Create: `configs/calibration/scene_001.json`
- Create: `tests/test_coordinate_mapper.py`
- Modify: `src/roadside_perception/roadside_agent.py`

- [x] **Step 1: Define calibration file and invalid-coordinate behavior.**

标定文件包含 `image_size`、`world_units`、`homography`、`version`。`CoordinateMapper.image_bbox_to_world()` 使用 bbox 底边中心点做单应性变换；矩阵缺失、维度错误、结果非有限或超出配置道路范围时返回 `coordinate_status="invalid"`，不返回伪造的 `[0,0]`。

- [x] **Step 2: Write deterministic mapping tests.**

使用单位矩阵测试底边中心点映射；使用固定二维矩阵测试透视除法；测试无效矩阵和越界返回明确状态。

- [x] **Step 3: Integrate mapper into the roadside agent.**

检测结果已有 `world_pos` 时优先保留；没有 `world_pos` 时用 bbox 调用 mapper。只有 `coordinate_status="valid"` 才把对象交给后续预测；PC 消息仍然发送无效对象，但它们的 `prediction_status` 必须为 `invalid_coordinate`。

- [x] **Step 4: Run focused tests.**

Run: `python -m pytest tests/test_coordinate_mapper.py tests/test_algorithm_pipeline.py -q`

Expected: exit code `0`；现有 annotations 回放测试继续通过。

### Task 5: Move STGNN inference to the Cloud Agent

**Files:**
- Create: `src/cloud_twin/stgnn_service.py`
- Create: `tests/test_cloud_stgnn_service.py`
- Modify: `src/cloud_twin/cloud_agent.py`
- Modify: `configs/cloud.yaml`
- Modify: `src/roadside_perception/roadside_agent.py`

- [x] **Step 1: Write Cloud STGNN service tests.**

测试覆盖：同一个 `(node_id, track_id)` 的历史长度增长；不同 node 的相同 track ID 不串轨；少于 `min_history` 时返回 `deferred`；模型不存在时返回 `fallback` 和明确原因；有效 TorchScript 模型返回 `ready`、轨迹长度不超过 `predict_steps` 和非空 latency。

- [x] **Step 2: Implement `CloudSTGNNService`.**

服务以 `dict[node_id, OccAwareSTGNNPredictor]` 隔离节点。`update_and_predict(payload)` 遍历对象，读取 `world_pos`、bbox、class 和 `occlusion_level`，调用 `update()` 后在历史足够时调用 `predict()`；结果写回对象 `predicted_traj`，并写入顶层 `prediction` 元数据。输入无效时不调用模型。

- [x] **Step 3: Integrate into `CloudAgent._on_perception`.**

处理顺序固定为：解析 payload → `CloudSTGNNService.update_and_predict()` → 写入 `DataStore` → `_broadcast("perception", enriched_payload)`。这样 SQLite 和前端看到的是同一份带预测结果的数据。Cloud Agent 构造时读取 `configs/cloud.yaml` 的 prediction 配置。

- [x] **Step 4: Defer roadside prediction in PC mode.**

当 `prediction.location=cloud` 时，`RoadsideAgent` 不加载本地 STGNN，也不生成匀速 `predicted_traj`；每个对象发送 `prediction_status="deferred"`。旧的 `constant_velocity` 和 `stgnn` roadside 模式继续保留，用于现有回归和对照实验。

- [x] **Step 5: Run Cloud STGNN and backend regression tests.**

Run: `python -m pytest tests/test_cloud_stgnn_service.py tests/test_demo_engine.py tests/test_algorithm_pipeline.py -q`

Expected: exit code `0`；同一帧只写入一条合并后的感知记录，预测失败不会导致 MQTT 回调线程退出。

### Task 6: Surface prediction source and status in the frontend

**Files:**
- Modify: `frontend/src/types/realtime.ts`
- Modify: `frontend/src/types/roadside.ts`
- Modify: `frontend/src/store/monitorStore.ts`
- Modify: `frontend/src/widgets/perception-cards/PerceptionCards.tsx`
- Modify: corresponding CSS module and frontend tests

- [x] **Step 1: Add TypeScript types matching the protocol.**

增加 `PredictionMeta`、`CoordinateStatus`、`PredictionStatus` 和 `PerceptionSource`；所有新字段设为 optional，使旧 mock 消息继续通过类型检查。

- [x] **Step 2: Update monitor transformation.**

从实时消息读取 `data.prediction`、对象 `coordinate_status` 和 `prediction_status`，保存到 store；缺失字段映射为 `deferred`/`unknown`，不能把 mock 数据误显示为真实 STGNN 结果。

- [x] **Step 3: Add visible status chips.**

在 perception card 中显示：`YOLO + DeepSORT`、`STGNN Cloud`、`Fallback`、`坐标无效`；显示预测延迟和模型路径，模型未加载时显示降级原因。

- [x] **Step 4: Add UI tests and build.**

Run: `npm run build`

Run: `npm run test:ui -- --reporter=dot`

Expected: TypeScript 编译、Vite 构建和 UI 测试均退出 `0`。

### Task 7: Build the no-hardware PC-to-Cloud integration harness

**Files:**
- Create: `tests/test_pc_cloud_pipeline.py`
- Create: `scripts/run_pc_cloud_demo.ps1`
- Modify: `scripts/verify_algorithm_pipeline.py` only to add a named PC-cloud smoke mode
- Modify: `docs/END_TO_END_DEMO.md`

- [x] **Step 1: Write the in-memory integration test.**

使用 `src/communication/in_memory_mqtt.py` 注入 10 FPS 的连续对象帧，模拟检测结果已经来自 YOLO/DeepSORT；断言 Cloud Agent 收到消息、生成 STGNN 状态、写入 DataStore，并广播包含 `prediction` 的 WebSocket payload。

- [x] **Step 2: Implement the demo launcher.**

`run_pc_cloud_demo.ps1` 支持 `-Frames`、`-Fps`、`-Scenario`、`-ApiPort` 和 `-DryRun`；默认使用现有 algorithm environment、临时 SQLite 文件和本地 MQTT broker。脚本在退出时清理自己启动的子进程，不删除仓库已有数据。

- [x] **Step 3: Add the verification command.**

Run: `& 'D:\Anaconda\envs\v2x-ghost-algorithm\python.exe' scripts\verify_algorithm_pipeline.py --work-dir data/pc_cloud_validation --frames 60 --horizon 30 --real-stgnn`

再运行：`python -m pytest tests/test_pc_cloud_pipeline.py -q`

Expected: integration test exit `0`；报告中包含 `model_loaded=true`、消息帧数大于 `0`、Cloud prediction 状态存在；真实指标仍按报告原值展示，不把 smoke 数据当作最终论文结果。

### Task 8: Document migration to Jetson Orin Nano and Atlas 200 DK

**Files:**
- Modify: `启动.md`
- Modify: `docs/API_SPEC.md`
- Modify: `docs/DATA_MODEL.md`
- Modify: `docs/ARCHITECTURE.md`
- Create: `docs/BOARD_MIGRATION_CHECKLIST.md`

- [x] **Step 1: Document the common board-side contract.**

开发板只需实现：读取摄像头、YOLO、DeepSORT、道路坐标转换、按 schema 发布 MQTT。开发板不需要加载 STGNN，除非未来明确切换为 edge prediction。

- [x] **Step 2: Add the Jetson Orin Nano migration path.**

记录 Jetson 的 JetPack/Ubuntu 版本、CUDA/TensorRT 版本、摄像头接口、YOLO 导出格式、DeepSORT 运行时、模型缓存位置和启动命令。先在 PC 上固定消息协议和检测类别，再在 Jetson 上分别测 FP16 TensorRT latency、显存、温度、FPS 和 track ID 稳定性。

- [x] **Step 3: Add the Atlas 200 DK migration path.**

记录 Atlas 的 CANN/驱动版本、ACL 推理接口、YOLO 到 OM 的转换步骤、输入输出 tensor 形状、预处理/后处理位置和 DeepSORT 的 CPU/Ascend 边界。Atlas 适配必须用独立的 `DetectorBackend`，不修改 Cloud Agent，也不把 Jetson 的 `.engine` 或 PyTorch checkpoint 当作 Atlas 模型。

- [x] **Step 4: Document the network checklist.**

列出 broker IP、TCP 1883、Cloud API TCP 8000、MQTT QoS、设备时钟同步、心跳周期、最大消息大小、断线重连和带宽估算；敏感信息不写入仓库配置。

- [x] **Step 5: Document final hardware acceptance.**

板端验收必须单独测：摄像头 FPS、YOLO latency、DeepSORT ID 稳定性、坐标转换有效率、MQTT 发送延迟、端到端 Cloud STGNN latency 和温度；未完成这些测试时，不宣称已完成硬件部署。

## 6. Execution order and checkpoints

Goal 执行顺序固定为：

```text
Task 1 协议/配置
   ↓
Task 2 帧源
   ↓
Task 3 YOLO + DeepSORT
   ↓
Task 4 坐标
   ↓
Task 5 Cloud STGNN
   ↓
Task 6 前端
   ↓
Task 7 端到端验证
   ↓
Task 8 文档和开发板迁移清单
```

每完成一个 Task 都要运行该 Task 的 focused test，并保留一次提交。Task 5 之前不修改前端展示，Task 7 之前不接入真实硬件。任何模型或依赖缺失都必须走显式 fallback，并将原因记录在消息和日志中。

## 7. Final verification checklist

- [x] `python -m pytest -q`：后端全量测试通过，允许已有明确标记的 skip。
- [x] `& 'D:\Anaconda\envs\v2x-ghost-algorithm\python.exe' scripts\verify_model_readiness.py --require-yolo --require-stgnn`：YOLO/STGNN 环境就绪。
- [x] `npm run build`：前端构建通过。
- [x] `npm run test:ui -- --reporter=dot`：前端 UI 测试通过。
- [ ] PC 感知进程能发布 10 FPS perception 消息。
- [x] Cloud Agent 能加载 TorchScript checkpoint 或明确降级。
- [x] SQLite、WebSocket 和前端使用同一份 enriched perception 数据。
- [x] 没有把图片/视频原始帧上传到 MQTT。
- [x] 没有把无效坐标 `[0,0]` 当作真实道路坐标。
- [x] 文档明确说明真实 DAIR-V2X 指标和演示 smoke 指标的区别。

本次 Goal 执行记录（2026-08-09）：

- 后端全量测试 `119 passed, 2 skipped`；前端 `npm run build` 和 UI 测试 `17 passed`。
- 无硬件 60 帧 in-memory MQTT smoke 已验证 `message_frames=60`、`stored_frames=60`、`broadcast_frames=60`，并验证消息不含原始图像。
- 算法环境 readiness、真实 YOLO 图片烟测、真实 DeepSORT 连续帧跟踪和真实 TorchScript Cloud STGNN smoke 均已通过；训练烟测 ADE/FDE 仍需按报告原值解读。
- 未勾选的真实 PC 感知进程项需要用户提供 `data/pc_demo/traffic.mp4` 和可用局域网 MQTT Broker；现场 homography 也必须替换示例标定矩阵后再做真实指标验收。

## 8. Goal execution contract

Goal 的 objective 使用下面这句话：

> 实现 `docs/superpowers/plans/2026-08-08-pc-first-yolo-deepsort-cloud-stgnn.md` 中定义的无硬件 PC 感知到 Cloud STGNN 端到端闭环，严格按 Task 1 到 Task 8 执行；不接入小车硬件，不删除现有回放/模拟路径，完成每个 Task 的测试与回归验证。

Goal 执行期间的完成条件是第 7 节全部满足；开发板迁移只完成接口和清单，不把物理设备联调混入本 Goal。
