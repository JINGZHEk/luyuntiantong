import argparse
import json
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.dataset import (
    build_dair_mini_split,
    dry_run_stgnn_checkpoint_evaluation,
    evaluate_replay_clip,
    export_stgnn_training_data,
    generate_dair_demo_sample,
)
from src.dataset.dair_manifest import load_dair_annotations
from src.dataset.yolo_detection_evaluator import evaluate_yolo_manifest


def _target_status_by_key(report: dict[str, Any]) -> dict[str, str]:
    return {
        item["key"]: item["status"]
        for item in report.get("targetStatus", [])
        if isinstance(item, dict) and "key" in item and "status" in item
    }


def _dry_run_detector_from_manifest(manifest_path: Path):
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    annotations_by_image: dict[str, list[dict[str, Any]]] = {}
    for frame in manifest.get("frames", []):
        image_path = frame.get("image_path")
        if not image_path:
            continue
        annotations = frame.get("annotations")
        if not isinstance(annotations, list) and frame.get("label_path"):
            annotations = load_dair_annotations(frame["label_path"])
        annotations_by_image[str(image_path)] = [
            {
                "class": item.get("class", "unknown"),
                "bbox": item.get("bbox", [0, 0, 0, 0]),
                "confidence": 1.0,
            }
            for item in (annotations or [])
            if isinstance(item, dict)
        ]

    def detect(image_path: str) -> list[dict[str, Any]]:
        return list(annotations_by_image.get(str(image_path), []))

    return detect


def verify_m2_demo_sample(
    work_dir: str | Path,
    frames: int = 60,
    horizon: int = 30,
    scene_id: str = "demo_dair_001",
) -> dict[str, Any]:
    root = Path(work_dir)
    demo_root = root / "demo_dair_sample"
    mini_root = root / "mini_split"
    demo_root.mkdir(parents=True, exist_ok=True)
    mini_root.mkdir(parents=True, exist_ok=True)

    sample = generate_dair_demo_sample(demo_root, frame_count=frames, scene_id=scene_id)
    manifest = build_dair_mini_split(demo_root, mini_root, max_frames=frames, scene_id=scene_id)
    clip_path = mini_root / "replay" / "clip_001.json"
    report = evaluate_replay_clip(clip_path, horizon=horizon)
    evaluation_path = mini_root / "evaluation.json"
    evaluation_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    training_manifest = export_stgnn_training_data(
        clip_path=clip_path,
        output_dir=root / "stgnn_training",
        history_length=8,
        predict_steps=horizon,
        fps=10.0,
        target_classes=["person"],
    )
    stgnn_evaluation = dry_run_stgnn_checkpoint_evaluation(
        samples_path=training_manifest["samples_path"],
        checkpoint_path=root / "models" / "occaware_stgnn.ts",
        batch_size=16,
    )
    stgnn_evaluation_path = mini_root / "stgnn_evaluation.json"
    stgnn_evaluation_path.write_text(
        json.dumps(stgnn_evaluation, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    yolo_detection = evaluate_yolo_manifest(
        manifest_path=mini_root / "manifest.json",
        detector=_dry_run_detector_from_manifest(mini_root / "manifest.json"),
    )
    yolo_detection["source"] = "yolo_detection_dry_run"
    yolo_detection_path = mini_root / "yolo_detection.json"
    yolo_detection_path.write_text(
        json.dumps(yolo_detection, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    target_status = _target_status_by_key(report)
    stgnn_target_status = _target_status_by_key(stgnn_evaluation)
    summary = {
        "dataset": sample["dataset"],
        "scene_id": scene_id,
        "frame_count": manifest["frame_count"],
        "manifest_path": str(mini_root / "manifest.json"),
        "replay_clip": str(clip_path),
        "evaluation_path": str(evaluation_path),
        "evaluation_source": report["source"],
        "metrics": report["metrics"],
        "target_status": target_status,
        "stgnn_training": training_manifest,
        "stgnn_checkpoint_evaluation": {
            "source": stgnn_evaluation["source"],
            "evaluation_path": str(stgnn_evaluation_path),
            "checkpoint": stgnn_evaluation["checkpoint"],
            "checkpoint_exists": stgnn_evaluation["checkpoint_exists"],
            "sample_count": stgnn_evaluation["sample_count"],
            "model_loaded": stgnn_evaluation["model_loaded"],
            "target_status": stgnn_target_status,
        },
        "yolo_detection_evaluation": {
            "source": yolo_detection["source"],
            "evaluation_path": str(yolo_detection_path),
            "sample_count": yolo_detection["sample_count"],
            "metrics": yolo_detection["metrics"],
            "detection": {
                "true_positive": yolo_detection["detection"]["true_positive"],
                "false_positive": yolo_detection["detection"]["false_positive"],
                "false_negative": yolo_detection["detection"]["false_negative"],
                "per_class": yolo_detection["detection"]["per_class"],
            },
        },
    }

    required_pass = ["ade", "fde", "occAde", "occAcc", "fps", "leadTime"]
    failed = [key for key in required_pass if target_status.get(key) != "pass"]
    if failed:
        raise RuntimeError(f"M2 demo sample verification failed targets: {', '.join(failed)}")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify the M2 DAIR-style demo sample evaluation loop")
    parser.add_argument("--work-dir", help="Directory for generated sample, mini split, and evaluation output")
    parser.add_argument("--frames", type=int, default=60, help="Number of demo sample frames")
    parser.add_argument("--horizon", type=int, default=30, help="Prediction horizon for offline evaluation")
    parser.add_argument("--scene-id", default="demo_dair_001", help="Scene id for generated sample")
    parser.add_argument("--keep", action="store_true", help="Keep temporary output when --work-dir is omitted")
    args = parser.parse_args()

    temp_dir = None
    work_dir = args.work_dir
    if work_dir is None:
        temp_dir = tempfile.mkdtemp(prefix="v2x_m2_demo_sample_")
        work_dir = temp_dir

    try:
        summary = verify_m2_demo_sample(
            work_dir=work_dir,
            frames=args.frames,
            horizon=args.horizon,
            scene_id=args.scene_id,
        )
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    finally:
        if temp_dir is not None and not args.keep:
            shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
