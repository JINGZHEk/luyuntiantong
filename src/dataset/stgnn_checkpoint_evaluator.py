import json
import math
import time
from pathlib import Path
from typing import Any

from src.evaluation_targets import build_target_status


def _read_jsonl(path: str | Path) -> list[dict[str, Any]]:
    rows = []
    with Path(path).open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def _safe_mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _distance(a: list[float], b: list[float]) -> float:
    return math.hypot(float(a[0]) - float(b[0]), float(a[1]) - float(b[1]))


def _scene_id(samples: list[dict[str, Any]]) -> str:
    for sample in samples:
        value = sample.get("scene_id")
        if isinstance(value, str) and value:
            return value
    return "stgnn_offline"


def _sample_shape(samples: list[dict[str, Any]]) -> tuple[int, int]:
    if not samples:
        return 0, 0
    return len(samples[0].get("input_features", [])), len(samples[0].get("target_trajectory", []))


def validate_stgnn_samples(samples: list[dict[str, Any]]) -> tuple[int, int]:
    history_length, predict_steps = _sample_shape(samples)
    if not samples:
        raise ValueError("No ST-GNN samples found")
    if history_length <= 0 or predict_steps <= 0:
        raise ValueError("Samples must contain input_features and target_trajectory")

    for sample in samples:
        sample_id = sample.get("sample_id", "<unknown>")
        features = sample.get("input_features", [])
        trajectory = sample.get("target_trajectory", [])
        if len(features) != history_length:
            raise ValueError(f"Inconsistent history length in sample {sample_id}")
        if len(trajectory) != predict_steps:
            raise ValueError(f"Inconsistent predict steps in sample {sample_id}")
        for row in features:
            if len(row) != 8:
                raise ValueError(f"Expected 8 input features in sample {sample_id}")
    return history_length, predict_steps


def _empty_metrics() -> dict[str, Any]:
    return {
        "precision": None,
        "recall": None,
        "f1Score": None,
        "ade": None,
        "fde": None,
        "missRate": None,
        "occAde": None,
        "occAcc": None,
        "avgLatency": None,
        "e2eLatency": None,
        "leadTime": None,
        "fps": None,
    }


def _base_report(
    samples: list[dict[str, Any]],
    samples_path: str | Path,
    checkpoint_path: str | Path,
    batch_size: int,
    dry_run: bool,
) -> dict[str, Any]:
    history_length, predict_steps = validate_stgnn_samples(samples)
    checkpoint = Path(checkpoint_path)
    metrics = _empty_metrics()
    source = "stgnn_checkpoint_dry_run" if dry_run else "stgnn_checkpoint_offline"
    return {
        "source": source,
        "scene_id": _scene_id(samples),
        "sample_count": len(samples),
        "event_count": 0,
        "high_risk_frames": sum(1 for sample in samples if int(sample.get("occlusion_label", 0)) > 0),
        "min_ttc": None,
        "samples": str(samples_path),
        "checkpoint": str(checkpoint),
        "checkpoint_exists": checkpoint.exists(),
        "history_length": history_length,
        "predict_steps": predict_steps,
        "batch_size": batch_size,
        "model_loaded": False,
        "metrics": metrics,
        "targetStatus": build_target_status(metrics),
        "baselines": [
            {
                "model": "OccAware-STGNN Checkpoint",
                "precision": None,
                "recall": None,
                "f1Score": None,
                "ade": None,
                "fde": None,
                "latency": None,
            }
        ],
        "ablations": [
            {
                "variant": "OccAware-STGNN",
                "f1Score": None,
                "ade": None,
                "fde": None,
                "description": "ST-GNN checkpoint 评估入口；dry-run 仅验证样本和报告结构",
            }
        ],
    }


def dry_run_stgnn_checkpoint_evaluation(
    samples_path: str | Path,
    checkpoint_path: str | Path,
    batch_size: int = 16,
) -> dict[str, Any]:
    samples = _read_jsonl(samples_path)
    return _base_report(samples, samples_path, checkpoint_path, batch_size=batch_size, dry_run=True)


def evaluate_stgnn_checkpoint(
    samples_path: str | Path,
    checkpoint_path: str | Path,
    batch_size: int = 16,
    occlusion_threshold: int = 1,
    miss_threshold: float = 2.0,
    device: str = "auto",
) -> dict[str, Any]:
    samples = _read_jsonl(samples_path)
    report = _base_report(samples, samples_path, checkpoint_path, batch_size=batch_size, dry_run=False)
    checkpoint = Path(checkpoint_path)
    if not checkpoint.exists():
        raise FileNotFoundError(f"ST-GNN checkpoint not found: {checkpoint_path}")

    import torch

    resolved_device = torch.device(
        "cuda" if device == "auto" and torch.cuda.is_available() else "cpu" if device == "auto" else device
    )
    if resolved_device.type == "cuda" and not torch.cuda.is_available():
        raise RuntimeError(f"CUDA device requested but unavailable: {device}")

    features = torch.tensor([sample["input_features"] for sample in samples], dtype=torch.float32)
    targets = [sample["target_trajectory"] for sample in samples]
    occlusion_labels = [int(sample.get("occlusion_label", 0)) for sample in samples]

    model = torch.jit.load(str(checkpoint), map_location=resolved_device)
    model.eval()

    all_errors: list[float] = []
    final_errors: list[float] = []
    occluded_errors: list[float] = []
    occlusion_matches = 0
    occlusion_total = 0

    if resolved_device.type == "cuda":
        torch.cuda.synchronize(resolved_device)
    started = time.perf_counter()
    with torch.no_grad():
        for start in range(0, len(samples), batch_size):
            end = min(start + batch_size, len(samples))
            batch = features[start:end].to(resolved_device, non_blocking=True)
            output = model(batch)
            if isinstance(output, (tuple, list)):
                pred_trajectory, pred_occlusion = output[0], output[1] if len(output) > 1 else None
            else:
                pred_trajectory, pred_occlusion = output, None

            predictions = pred_trajectory.detach().cpu().tolist()
            occ_predictions = None
            if pred_occlusion is not None:
                occ_predictions = pred_occlusion.argmax(dim=-1).detach().cpu().tolist()

            for offset, predicted in enumerate(predictions):
                sample_index = start + offset
                target = targets[sample_index]
                label = occlusion_labels[sample_index]
                step_errors = []
                for predicted_point, target_point in zip(predicted, target):
                    error = _distance(predicted_point, target_point)
                    all_errors.append(error)
                    step_errors.append(error)
                    if label >= occlusion_threshold:
                        occluded_errors.append(error)
                if step_errors:
                    final_errors.append(step_errors[-1])
                if label >= occlusion_threshold and occ_predictions is not None:
                    occlusion_total += 1
                    if int(occ_predictions[offset]) == label:
                        occlusion_matches += 1
    if resolved_device.type == "cuda":
        torch.cuda.synchronize(resolved_device)
    elapsed = max(time.perf_counter() - started, 1e-9)

    fps = len(samples) / elapsed
    latency_ms = (elapsed / len(samples)) * 1000.0
    metrics = {
        "precision": None,
        "recall": None,
        "f1Score": None,
        "ade": round(_safe_mean(all_errors), 2),
        "fde": round(_safe_mean(final_errors), 2),
        "missRate": round(sum(error > miss_threshold for error in final_errors) / len(final_errors), 3) if final_errors else 0.0,
        "occAde": round(_safe_mean(occluded_errors), 2) if occluded_errors else None,
        "occAcc": round(occlusion_matches / occlusion_total, 3) if occlusion_total else None,
        "avgLatency": round(latency_ms, 2),
        "e2eLatency": round(latency_ms, 2),
        "leadTime": None,
        "fps": round(fps, 2),
    }

    report.update(
        {
            "model_loaded": True,
            "device": str(resolved_device),
            "gpu_name": torch.cuda.get_device_name(resolved_device) if resolved_device.type == "cuda" else None,
            "metrics": metrics,
            "targetStatus": build_target_status(metrics),
            "baselines": [
                {
                    "model": "OccAware-STGNN Checkpoint",
                    "precision": metrics["precision"],
                    "recall": metrics["recall"],
                    "f1Score": None,
                    "ade": metrics["ade"],
                    "fde": metrics["fde"],
                    "latency": metrics["avgLatency"],
                }
            ],
            "ablations": [
                {
                    "variant": "OccAware-STGNN",
                    "f1Score": None,
                    "ade": metrics["ade"],
                    "fde": metrics["fde"],
                    "description": "TorchScript ST-GNN checkpoint 对监督样本的离线评估结果",
                },
                {
                    "variant": "Occluded Samples",
                    "f1Score": None,
                    "ade": metrics["occAde"],
                    "fde": metrics["fde"],
                    "description": "仅统计遮挡样本后的轨迹误差视图",
                },
            ],
        }
    )
    return report
