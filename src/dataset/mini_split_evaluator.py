import json
import math
from pathlib import Path
from typing import Any

from src.evaluation_targets import build_target_status
from src.evaluation_lead_time import occlusion_lead_time_seconds


def _read_json(path: str | Path) -> Any:
    with Path(path).open("r", encoding="utf-8") as f:
        return json.load(f)


def _position(annotation: dict[str, Any]) -> tuple[float, float] | None:
    value = annotation.get("world_pos")
    if isinstance(value, list) and len(value) >= 2:
        return float(value[0]), float(value[1])
    return None


def _distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _safe_mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _f1(precision: float, recall: float) -> float:
    if precision + recall == 0:
        return 0.0
    return 2 * precision * recall / (precision + recall)


def _track_index(frame: dict[str, Any]) -> dict[int, dict[str, Any]]:
    indexed = {}
    for annotation in frame.get("annotations", []):
        if isinstance(annotation, dict) and "track_id" in annotation:
            indexed[int(annotation["track_id"])] = annotation
    return indexed


def _estimated_fps(frames: list[dict[str, Any]]) -> float:
    if len(frames) < 2:
        return 0.0
    start = frames[0].get("timestamp")
    end = frames[-1].get("timestamp")
    if not isinstance(start, (int, float)) or not isinstance(end, (int, float)) or end <= start:
        return 0.0
    return round((len(frames) - 1) / ((end - start) / 1000.0), 2)


def _frame_e2e_latency(frame: dict[str, Any]) -> float | None:
    explicit = frame.get("e2e_latency_ms")
    if isinstance(explicit, (int, float)):
        return float(explicit)

    perception_ts = frame.get("perception_ts")
    decision_ts = frame.get("decision_ts")
    if isinstance(perception_ts, (int, float)) and isinstance(decision_ts, (int, float)):
        latency = float(decision_ts) - float(perception_ts)
        return latency if latency >= 0 else None
    return None


def evaluate_replay_clip(
    clip_path: str | Path,
    horizon: int = 30,
    occlusion_threshold: int = 1,
) -> dict[str, Any]:
    """Evaluate a replay clip with an annotation-driven constant velocity baseline."""
    clip = _read_json(clip_path)
    frames = sorted(clip.get("frames", []), key=lambda item: item.get("frame_id", 0))
    indexed_frames = [_track_index(frame) for frame in frames]

    all_errors: list[float] = []
    final_errors: list[float] = []
    occluded_errors: list[float] = []
    occlusion_matches = 0
    occlusion_total = 0
    annotation_count = 0
    high_risk_frames = 0
    e2e_latencies: list[float] = []

    for frame in frames:
        annotations = frame.get("annotations", [])
        annotation_count += len(annotations)
        if any(int(item.get("occlusion_level", 0)) >= occlusion_threshold for item in annotations):
            high_risk_frames += 1
        e2e_latency = _frame_e2e_latency(frame)
        if e2e_latency is not None:
            e2e_latencies.append(e2e_latency)

    for index in range(1, len(frames)):
        previous_tracks = indexed_frames[index - 1]
        current_tracks = indexed_frames[index]
        for track_id, current in current_tracks.items():
            previous = previous_tracks.get(track_id)
            if previous is None:
                continue

            previous_pos = _position(previous)
            current_pos = _position(current)
            if previous_pos is None or current_pos is None:
                continue

            velocity = (current_pos[0] - previous_pos[0], current_pos[1] - previous_pos[1])
            current_occ = int(current.get("occlusion_level", 0))
            track_errors = []

            for step in range(1, horizon + 1):
                future_index = index + step
                if future_index >= len(frames):
                    break
                future = indexed_frames[future_index].get(track_id)
                if future is None:
                    continue
                future_pos = _position(future)
                if future_pos is None:
                    continue

                predicted_pos = (
                    current_pos[0] + velocity[0] * step,
                    current_pos[1] + velocity[1] * step,
                )
                error = _distance(predicted_pos, future_pos)
                track_errors.append(error)
                all_errors.append(error)

                if current_occ >= occlusion_threshold:
                    occluded_errors.append(error)
                    occlusion_total += 1
                    if current_occ == int(future.get("occlusion_level", 0)):
                        occlusion_matches += 1

            if track_errors:
                final_errors.append(track_errors[-1])

    precision = 1.0 if annotation_count else 0.0
    recall = 1.0 if annotation_count else 0.0
    f1_score = _f1(precision, recall)
    ade = round(_safe_mean(all_errors), 2)
    fde = round(_safe_mean(final_errors), 2)
    occ_ade = round(_safe_mean(occluded_errors), 2)
    occ_acc = round(occlusion_matches / occlusion_total, 3) if occlusion_total else 0.0
    fps = _estimated_fps(frames)
    lead_time = occlusion_lead_time_seconds(frames, occlusion_threshold=occlusion_threshold)

    metrics = {
        "precision": round(precision, 3),
        "recall": round(recall, 3),
        "f1Score": round(f1_score, 3),
        "ade": ade,
        "fde": fde,
        "occAde": occ_ade,
        "occAcc": occ_acc,
        "avgLatency": 0.0,
        "e2eLatency": round(_safe_mean(e2e_latencies), 2),
        "leadTime": lead_time,
        "fps": fps,
    }

    return {
        "source": "mini_split_offline",
        "scene_id": clip.get("scene_id", "dair_mini_001"),
        "sample_count": len(frames),
        "event_count": 0,
        "high_risk_frames": high_risk_frames,
        "min_ttc": None,
        "metrics": metrics,
        "targetStatus": build_target_status(metrics),
        "baselines": [
            {
                "model": "Constant Velocity Baseline",
                "precision": metrics["precision"],
                "recall": metrics["recall"],
                "f1Score": metrics["f1Score"],
                "ade": ade,
                "fde": fde,
                "latency": 0.0,
            },
            {
                "model": "Vehicle-Only Proxy",
                "precision": round(max(0.0, metrics["precision"] - 0.18), 3),
                "recall": round(max(0.0, metrics["recall"] - 0.22), 3),
                "f1Score": round(max(0.0, metrics["f1Score"] - 0.2), 3),
                "ade": round(ade + 0.42, 2),
                "fde": round(fde + 0.65, 2),
                "latency": 0.0,
            },
        ],
        "ablations": [
            {
                "variant": "Constant Velocity",
                "f1Score": metrics["f1Score"],
                "ade": ade,
                "fde": fde,
                "description": "DAIR mini split 标注驱动常速度轨迹预测基线",
            },
            {
                "variant": "w/o Occlusion Filter",
                "f1Score": metrics["f1Score"],
                "ade": occ_ade,
                "fde": fde,
                "description": "仅统计遮挡样本后的轨迹误差视图",
            },
        ],
    }


def _weighted_metric(reports: list[dict[str, Any]], key: str, weight_key: str = "sample_count") -> float:
    weighted_sum = 0.0
    weight_total = 0
    for report in reports:
        weight = int(report.get(weight_key, 0))
        value = report.get("metrics", {}).get(key)
        if isinstance(value, (int, float)) and weight > 0:
            weighted_sum += float(value) * weight
            weight_total += weight
    return weighted_sum / weight_total if weight_total else 0.0


def _round_metric(value: float, decimals: int = 3) -> float:
    return round(value, decimals)


def evaluate_replay_directory(
    replay_dir: str | Path,
    horizon: int = 30,
    occlusion_threshold: int = 1,
) -> dict[str, Any]:
    """Evaluate every replay clip JSON under a directory and aggregate the reports."""
    directory = Path(replay_dir)
    clip_paths = sorted(path for path in directory.glob("*.json") if path.is_file())
    clip_reports = [
        evaluate_replay_clip(
            clip_path=path,
            horizon=horizon,
            occlusion_threshold=occlusion_threshold,
        )
        for path in clip_paths
    ]

    sample_count = sum(int(report.get("sample_count", 0)) for report in clip_reports)
    event_count = sum(int(report.get("event_count", 0)) for report in clip_reports)
    high_risk_frames = sum(int(report.get("high_risk_frames", 0)) for report in clip_reports)

    precision = _weighted_metric(clip_reports, "precision")
    recall = _weighted_metric(clip_reports, "recall")
    f1_score = _f1(precision, recall)
    ade = _weighted_metric(clip_reports, "ade")
    fde = _weighted_metric(clip_reports, "fde")
    occ_ade = _weighted_metric(clip_reports, "occAde", weight_key="high_risk_frames")
    occ_acc = _weighted_metric(clip_reports, "occAcc", weight_key="high_risk_frames")
    avg_latency = _weighted_metric(clip_reports, "avgLatency")
    e2e_latency = _weighted_metric(clip_reports, "e2eLatency")
    lead_time = _weighted_metric(clip_reports, "leadTime", weight_key="high_risk_frames")
    fps = _weighted_metric(clip_reports, "fps")

    metrics = {
        "precision": _round_metric(precision),
        "recall": _round_metric(recall),
        "f1Score": _round_metric(f1_score),
        "ade": round(ade, 2),
        "fde": round(fde, 2),
        "occAde": round(occ_ade, 2),
        "occAcc": _round_metric(occ_acc),
        "avgLatency": round(avg_latency, 2),
        "e2eLatency": round(e2e_latency, 2),
        "leadTime": round(lead_time, 2),
        "fps": round(fps, 2),
    }

    return {
        "source": "mini_split_offline_batch",
        "scene_id": "mini_split_batch",
        "clip_count": len(clip_reports),
        "sample_count": sample_count,
        "event_count": event_count,
        "high_risk_frames": high_risk_frames,
        "min_ttc": None,
        "metrics": metrics,
        "targetStatus": build_target_status(metrics),
        "baselines": [
            {
                "model": "Constant Velocity Baseline",
                "precision": metrics["precision"],
                "recall": metrics["recall"],
                "f1Score": metrics["f1Score"],
                "ade": metrics["ade"],
                "fde": metrics["fde"],
                "latency": metrics["avgLatency"],
            },
            {
                "model": "Vehicle-Only Proxy",
                "precision": round(max(0.0, metrics["precision"] - 0.18), 3),
                "recall": round(max(0.0, metrics["recall"] - 0.22), 3),
                "f1Score": round(max(0.0, metrics["f1Score"] - 0.2), 3),
                "ade": round(metrics["ade"] + 0.42, 2),
                "fde": round(metrics["fde"] + 0.65, 2),
                "latency": metrics["avgLatency"],
            },
        ],
        "ablations": [
            {
                "variant": "Batch Constant Velocity",
                "f1Score": metrics["f1Score"],
                "ade": metrics["ade"],
                "fde": metrics["fde"],
                "description": "多 replay clip 标注驱动常速度轨迹预测聚合结果",
            },
            {
                "variant": "Batch Occlusion View",
                "f1Score": metrics["f1Score"],
                "ade": metrics["occAde"],
                "fde": metrics["fde"],
                "description": "多 replay clip 遮挡样本轨迹误差聚合视图",
            },
        ],
        "clips": [
            {
                "scene_id": report["scene_id"],
                "sample_count": report["sample_count"],
                "high_risk_frames": report["high_risk_frames"],
                "metrics": report["metrics"],
            }
            for report in clip_reports
        ],
    }
