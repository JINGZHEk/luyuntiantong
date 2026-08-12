# Jetson Orin Nano / Atlas 200 DK 迁移清单

> 最后更新：2026-08-12

本文档描述 PC-first 闭环完成后的板端迁移边界。当前阶段不宣称已经完成任一开发板部署；只有清单中的板端实测证据齐全后，才进入硬件验收。

## 1. 共用协议和职责

两块板都发布：

```text
v2x/{scene_id}/roadside/{node_id}/perception
```

每个对象至少包含 `track_id`、`class`、`bbox`、`confidence`、`world_pos`、`velocity`、`occlusion_level`、`coordinate_status` 和 `prediction_status`。顶层消息包含 `schema_version`、`scene_id`、`source`、`coordinate_frame` 和 `prediction`。

板端职责：

1. 采集摄像头帧并产生连续 `frame_id`、毫秒时间戳。
2. 执行 YOLO 检测和 DeepSORT 跟踪，保持跨帧 `track_id`。
3. 用现场标定把 bbox 底边中心映射到 `road_xy`，无效结果标记为 `invalid`。
4. 计算或保留速度，按 QoS 1 发布 MQTT；消息中不上传原始图片或视频。
5. 发布心跳，报告 FPS、CPU/内存/GPU/NPU 使用情况和连接状态。

Cloud Agent 职责不变：按 `(node_id, track_id)` 维护历史，调用 Cloud STGNN，写入 SQLite 并广播 WebSocket。板端不加载 STGNN，除非未来明确切换为 edge prediction。

## 2. PC 基线完成条件

- [ ] `configs/roadside.pc.yaml` 的检测类别、输入 FPS 和标定文件已替换为现场值。
- [ ] PC 端连续发布至少 10 FPS 感知消息。
- [ ] `coordinate_status=valid` 的比例和无效原因已记录。
- [ ] 同一目标的 `track_id` 在遮挡前后稳定性已记录。
- [ ] Cloud Agent 的 `model_loaded`、预测延迟和 fallback 原因已记录。
- [ ] Cloud `device: auto` 已正确选择目标 GPU，warm-up 后 batch 8 推理满足延迟预算。
- [ ] SQLite、WebSocket 和前端显示的是同一份 enriched perception。

## 3. Jetson Orin Nano 路线

### 环境和模型

- [ ] 锁定并记录 JetPack、Ubuntu、CUDA、TensorRT、Python 和 OpenCV 版本。
- [ ] 记录摄像头接口（CSI/USB）、分辨率、帧率、曝光和时间戳来源。
- [ ] 将 YOLO 导出为与目标 TensorRT 版本匹配的 ONNX/engine，记录输入尺寸、FP16/INT8、类别顺序和后处理实现。
- [ ] DeepSORT 的 Python/CPU 或 TensorRT 辅助依赖已安装，并确认其输入为 `[x, y, w, h]`、输出为稳定整数 `track_id`。
- [ ] 模型缓存、engine 文件和启动服务路径已固定；engine 不提交到协议或 Cloud 配置中。

### 实测和验收

- [ ] 单独测量摄像头采集 FPS、YOLO latency、DeepSORT latency 和总板端处理 latency。
- [ ] 在轻遮挡、中遮挡、目标进出画面和多目标交汇场景记录 ID switch、丢轨和恢复时间。
- [ ] 记录显存、CPU、GPU、温度、功耗和持续运行稳定性。
- [ ] 通过 MQTT 记录发送延迟、断线重连和心跳周期。
- [ ] 使用现场 homography 计算坐标有效率，确认无效坐标不会被替换成 `[0,0]`。

## 4. Atlas 200 DK 路线

### 环境和模型

- [ ] 锁定并记录驱动、CANN、固件、ACL、Python 和 OpenCV 版本。
- [ ] 明确 YOLO 到 OM 的转换工具链、转换参数、输入输出 tensor shape、量化方式和动态 batch 约束。
- [ ] 明确预处理、NPU 推理、后处理分别在 CPU/Ascend 哪一侧执行。
- [ ] 为 Atlas 实现独立 `DetectorBackend`，不复用 Jetson `.engine`，也不把 PyTorch checkpoint 直接当作 Atlas 模型。
- [ ] DeepSORT 在 CPU/Ascend 的边界、内存拷贝和线程模型已记录。
- [ ] 记录 OM 文件、转换日志和运行时模型版本；模型文件不写入 MQTT 消息。

### 实测和验收

- [ ] 单独测量摄像头采集 FPS、预处理、ACL 推理、后处理、DeepSORT 和总 latency。
- [ ] 在与 Jetson 相同的视频片段上比较检测类别、bbox、置信度和 track ID 稳定性。
- [ ] 记录 NPU/CPU 利用率、内存、温度、功耗和连续运行稳定性。
- [ ] 验证 MQTT QoS 1、断线重连、心跳和最大消息大小。
- [ ] 使用同一现场标定文件测量 `coordinate_status=valid` 比例。

## 5. 无线局域网检查

- [ ] Broker IP、Cloud API IP、TCP 1883、TCP 8000 和可选 MQTT WebSocket 9001 已明确。
- [ ] 板端、Broker、Cloud 主机时钟已同步；消息时间戳统一为 Unix milliseconds。
- [ ] QoS、keepalive、心跳周期、重连退避和最大感知消息大小已配置并实测。
- [ ] 根据目标数量、消息大小和 FPS 估算带宽；视频流不走 MQTT 感知 Topic。
- [ ] 防火墙只放行需要的局域网端口；密码、Token 和私钥不写入仓库配置。
- [ ] 测量板端发布到 Cloud Agent 收到的 MQTT 延迟、丢包和重连恢复时间。

## 6. 最终端到端验收

以下指标必须分别提供板端日志、Cloud 日志和数据库/WebSocket 证据：

| 项目 | 证据 |
|---|---|
| 摄像头 FPS | 连续运行日志与帧计数 |
| YOLO / NPU latency | 每帧或窗口统计 |
| DeepSORT ID 稳定性 | ID switch、丢轨、恢复统计 |
| 坐标转换有效率 | valid/invalid 计数和标定版本 |
| MQTT 发送延迟 | 发布/接收时间戳差值 |
| Cloud STGNN latency | `prediction.latency_ms` 和模型加载状态 |
| 温度与功耗 | 板端监控窗口 |
| ADE/FDE/Occ 指标 | 真实标注数据、模型版本和评估报告 |

在上述证据完成前，只能称为 PC smoke 或板端联调，不得宣称 Jetson/Atlas 已完成部署，也不得把 smoke 指标写成真实 DAIR-V2X 指标。
