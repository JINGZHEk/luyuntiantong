import json
import time
from pathlib import Path
from typing import Any, Callable

from src.dataset.dair_manifest import load_dair_annotations

DetectorFn = Callable[[str], list[dict[str, Any]]]


def _read_json(path: str | Path) -> Any:
    with Path(path).open("r", encoding="utf-8") as f:
        return json.load(f)


def bbox_iou(a: list[float], b: list[float]) -> float:
    ax1, ay1, aw, ah = [float(value) for value in a[:4]]
    bx1, by1, bw, bh = [float(value) for value in b[:4]]
    ax2, ay2 = ax1 + aw, ay1 + ah
    bx2, by2 = bx1 + bw, by1 + bh

    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)
    inter_w = max(0.0, inter_x2 - inter_x1)
    inter_h = max(0.0, inter_y2 - inter_y1)
    intersection = inter_w * inter_h
    union = aw * ah + bw * bh - intersection
    return intersection / union if union > 0 else 0.0


def _empty_counts() -> dict[str, int]:
    return {"true_positive": 0, "false_positive": 0, "false_negative": 0}


def _class_counts(per_class: dict[str, dict[str, int]], name: str) -> dict[str, int]:
    if name not in per_class:
        per_class[name] = _empty_counts()
    return per_class[name]


def match_detections_to_annotations(
    detections: list[dict[str, Any]],
    annotations: list[dict[str, Any]],
    iou_threshold: float = 0.5,
) -> dict[str, Any]:
    matched_annotation_indexes: set[int] = set()
    per_class: dict[str, dict[str, int]] = {}
    true_positive = 0
    false_positive = 0

    sorted_detections = sorted(
        detections,
        key=lambda item: float(item.get("confidence", 0.0)),
        reverse=True,
    )
    for detection in sorted_detections:
        det_class = str(detection.get("class", "unknown"))
        det_box = detection.get("bbox", [0, 0, 0, 0])
        best_index = None
        best_iou = 0.0
        for index, annotation in enumerate(annotations):
            if index in matched_annotation_indexes:
                continue
            if str(annotation.get("class", "unknown")) != det_class:
                continue
            iou = bbox_iou(det_box, annotation.get("bbox", [0, 0, 0, 0]))
            if iou > best_iou:
                best_iou = iou
                best_index = index

        counts = _class_counts(per_class, det_class)
        if best_index is not None and best_iou >= iou_threshold:
            matched_annotation_indexes.add(best_index)
            true_positive += 1
            counts["true_positive"] += 1
        else:
            false_positive += 1
            counts["false_positive"] += 1

    false_negative = 0
    for index, annotation in enumerate(annotations):
        if index in matched_annotation_indexes:
            continue
        false_negative += 1
        counts = _class_counts(per_class, str(annotation.get("class", "unknown")))
        counts["false_negative"] += 1

    return {
        "true_positive": true_positive,
        "false_positive": false_positive,
        "false_negative": false_negative,
        "per_class": per_class,
    }


def _f1(precision: float, recall: float) -> float:
    return 0.0 if precision + recall == 0 else 2 * precision * recall / (precision + recall)


def _frame_annotations(frame: dict[str, Any]) -> list[dict[str, Any]]:
    annotations = frame.get("annotations")
    if isinstance(annotations, list):
        return [item for item in annotations if isinstance(item, dict)]
    label_path = frame.get("label_path")
    if label_path:
        return load_dair_annotations(label_path)
    return []


def _merge_counts(total: dict[str, int], frame_counts: dict[str, int]) -> None:
    for key in ("true_positive", "false_positive", "false_negative"):
        total[key] += int(frame_counts.get(key, 0))


def _merge_per_class(total: dict[str, dict[str, int]], frame_counts: dict[str, dict[str, int]]) -> None:
    for name, counts in frame_counts.items():
        target = _class_counts(total, name)
        _merge_counts(target, counts)


def evaluate_yolo_manifest(
    manifest_path: str | Path,
    detector: DetectorFn,
    iou_threshold: float = 0.5,
    max_frames: int | None = None,
) -> dict[str, Any]:
    manifest = _read_json(manifest_path)
    frames = manifest.get("frames", [])
    if max_frames is not None:
        frames = frames[:max_frames]

    totals = _empty_counts()
    per_class: dict[str, dict[str, int]] = {}
    frame_reports = []
    detection_latency_ms: list[float] = []

    for frame in frames:
        image_path = frame.get("image_path")
        if not image_path:
            continue
        annotations = _frame_annotations(frame)
        started = time.perf_counter()
        detections = detector(str(image_path))
        latency_ms = (time.perf_counter() - started) * 1000.0
        detection_latency_ms.append(latency_ms)

        match = match_detections_to_annotations(
            detections=detections,
            annotations=annotations,
            iou_threshold=iou_threshold,
        )
        _merge_counts(totals, match)
        _merge_per_class(per_class, match["per_class"])
        frame_reports.append(
            {
                "frame_id": frame.get("frame_id"),
                "image_path": image_path,
                "annotation_count": len(annotations),
                "detection_count": len(detections),
                "match": {
                    "true_positive": match["true_positive"],
                    "false_positive": match["false_positive"],
                    "false_negative": match["false_negative"],
                },
                "latency_ms": round(latency_ms, 2),
            }
        )

    tp = totals["true_positive"]
    fp = totals["false_positive"]
    fn = totals["false_negative"]
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1_score = _f1(precision, recall)
    avg_latency = sum(detection_latency_ms) / len(detection_latency_ms) if detection_latency_ms else 0.0
    fps = 1000.0 / avg_latency if avg_latency > 0 else 0.0

    return {
        "source": "yolo_detection_offline",
        "scene_id": manifest.get("scene_id", "dair_yolo_detection"),
        "sample_count": len(frame_reports),
        "event_count": 0,
        "high_risk_frames": 0,
        "metrics": {
            "precision": round(precision, 3),
            "recall": round(recall, 3),
            "f1Score": round(f1_score, 3),
            "avgLatency": round(avg_latency, 2),
            "fps": round(fps, 2),
        },
        "detection": {
            **totals,
            "per_class": per_class,
            "iou_threshold": iou_threshold,
            "frames": frame_reports,
        },
        "baselines": [
            {
                "model": "YOLO Detection",
                "precision": round(precision, 3),
                "recall": round(recall, 3),
                "f1Score": round(f1_score, 3),
                "latency": round(avg_latency, 2),
            }
        ],
        "ablations": [],
    }
