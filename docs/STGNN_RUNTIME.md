# STGNN 数据、训练与运行手册

> 最后更新：2026-08-12

## 1. 生成训练样本

场景库：

```powershell
python scripts\build_stgnn_training_data.py `
  --database data\v2x_cloud.db `
  --output data\stgnn_training `
  --input-steps 20 --future-steps 20 --fps 10
```

JSON/JSONL：

```powershell
python scripts\build_stgnn_training_data.py `
  --json data\trajectories.jsonl `
  --output data\stgnn_training
```

输出：`samples.jsonl` 和 `manifest.json`。样本同时保留可审计的 `input_seq/gt_seq` 与模型使用的 `input_features/target_trajectory`。

## 2. 训练

```powershell
& '<CUDA_PYTHON>\python.exe' scripts\train_stgnn.py `
  --samples data\stgnn_training\samples.jsonl `
  --output data\algorithm_validation_pipeline\models\occaware_stgnn.ts `
  --epochs 100 --batch-size 128 --hidden-dim 128 `
  --validate-every 10 --device auto `
  --translation-m 5 --rotation-deg 180 --noise-std 0.05 `
  --experiments-db data\v2x_cloud.db `
  --experiment-name occaware-stgnn-20x20
```

`--dry-run` 只检查样本和参数，不导入 PyTorch。正式训练结束后使用 `torch.jit.script` 导出设备可迁移的 TorchScript，并把实验写入 `experiments`。

## 3. 独立评估

```powershell
& '<CUDA_PYTHON>\python.exe' scripts\evaluate_stgnn_checkpoint.py `
  --samples data\stgnn_training\samples.jsonl `
  --checkpoint data\algorithm_validation_pipeline\models\occaware_stgnn.ts `
  --output data\algorithm_validation_pipeline\stgnn_evaluation.json `
  --batch-size 128 --device auto --miss-threshold 2
```

报告真实输出 ADE、FDE、Miss Rate、吞吐和平均前向耗时。缺少标注的指标为 `null/unknown`。

## 4. Cloud 配置

`configs/cloud.pc.yaml`：

```yaml
prediction:
  enabled: true
  backend: stgnn
  model_path: data/algorithm_validation_pipeline/models/occaware_stgnn.ts
  history_length: 20
  predict_steps: 20
  fps: 10
  min_history: 2
  batch_size: 8
  device: auto
  push_hz: 10
```

`device: auto` 在 CUDA 可用时选择 GPU，否则使用 CPU。

## 5. InferenceEngine

引擎行为：

- 进程内单例，只维护一个 TorchScript 模型实例。
- 启动时加载模型并运行 20×8 空输入 warm-up，避免首个业务批次承担 CUDA 初始化。
- 有界请求队列在 5ms 窗口内合并并发轨迹，按 batch size 分块推理。
- 每次调用前检查 checkpoint mtime；也支持 `POST /api/v1/model/reload`。
- 超过 50ms 写 warning；连续 5 批超过 100ms 激活 slow alert。
- 预测相邻点位移超过 5m 标记 `single_step_displacement_gt_5m`。

已验证的 RTX 4060 Laptop GPU smoke：模型 warm-up 约 130ms，batch 8 首个业务批次约 25ms，稳定批次约 1.1ms。具体性能受驱动、功耗模式、并发和数据分布影响，比赛报告应使用长时间 p50/p95/p99，而不是单次数字。

## 6. 持久化

`PredictionWriter` 使用独立后台有界队列写入：

- `predictions`
- `inference_log`
- `prediction_anomalies`

推理线程不等待 SQLite。关闭 Cloud Agent 时 writer 会停止；队列满时丢弃新任务并累计 dropped。

## 7. WebSocket

订阅：

```json
{"action":"subscribe","topics":["perception","prediction"]}
```

prediction 数据：

```json
{
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
}
```

前端按 `node_id:track_id` 隔离轨迹，避免多路口 ID 冲突。

## 8. 健康与日志

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
Invoke-RestMethod "http://127.0.0.1:8000/api/v1/logs/prediction?limit=100"
Invoke-RestMethod -Method Post http://127.0.0.1:8000/api/v1/model/reload
```

健康数据包括模型状态、warm-up、最近批次耗时、队列深度、slow alert、GPU 显存和 SQLite 连接。

## 9. 竞赛验收

必须补充：

1. 按路口/场景/时段隔离的数据划分。
2. 常速、LSTM 和图模型 baseline。
3. 遮挡等级和困难样本分桶。
4. p50/p95/p99 推理与端到端延迟。
5. fallback、超时、异常轨迹和模型热更新压力测试。
6. 固定随机种子、模型哈希、数据版本和硬件信息。

场景库训练的 ADE/FDE 仅用于工程回归，不作为最终比赛结论。
