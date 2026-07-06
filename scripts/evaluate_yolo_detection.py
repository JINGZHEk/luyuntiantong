import argparse
import json
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.verify_yolo_image_inference import build_detector_model_reference
from src.dataset.dair_manifest import load_dair_annotations
from src.dataset.yolo_detection_evaluator import evaluate_yolo_manifest
from src.roadside_perception.detector import Detector


def _read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _dry_run_detector_for_manifest(manifest_path: Path):
    manifest = _read_json(manifest_path)
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

    def detector(image_path: str) -> list[dict[str, Any]]:
        return list(annotations_by_image.get(str(image_path), []))

    return detector


def _real_yolo_detector(
    model: str,
    weights_dir: Path,
    confidence: float,
    iou: float,
    target_classes: list[str],
):
    weights_dir.mkdir(parents=True, exist_ok=True)
    detector = Detector(
        model_name=build_detector_model_reference(model, weights_dir),
        confidence=confidence,
        iou_threshold=iou,
        target_classes=target_classes,
        mode="yolo",
    )

    def detect(image_path: str) -> list[dict[str, Any]]:
        return detector.detect(image_path)

    return detect


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate YOLO detections against a DAIR mini split manifest")
    parser.add_argument("--manifest", default="data/mini_split/manifest.json", help="DAIR mini split manifest path")
    parser.add_argument("--output", default="data/mini_split/yolo_detection.json", help="Output report path")
    parser.add_argument("--model", default="yolov8n", help="Ultralytics YOLO model name")
    parser.add_argument(
        "--weights-dir",
        default=str(PROJECT_ROOT / "data" / "model_cache"),
        help="Directory for downloaded YOLO weights",
    )
    parser.add_argument("--confidence", type=float, default=0.25, help="Detection confidence threshold")
    parser.add_argument("--iou", type=float, default=0.5, help="Detection IoU threshold")
    parser.add_argument("--max-frames", type=int, default=None, help="Maximum frames to evaluate")
    parser.add_argument(
        "--target-classes",
        default="person,car,truck,bus,bicycle",
        help="Comma-separated target classes",
    )
    parser.add_argument("--dry-run", action="store_true", help="Use annotations as perfect detections")
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    if args.dry_run:
        detector = _dry_run_detector_for_manifest(manifest_path)
    else:
        detector = _real_yolo_detector(
            model=args.model,
            weights_dir=Path(args.weights_dir),
            confidence=args.confidence,
            iou=args.iou,
            target_classes=[item.strip() for item in args.target_classes.split(",") if item.strip()],
        )

    report = evaluate_yolo_manifest(
        manifest_path=manifest_path,
        detector=detector,
        iou_threshold=args.iou,
        max_frames=args.max_frames,
    )
    if args.dry_run:
        report["source"] = "yolo_detection_dry_run"
    else:
        report["model"] = args.model
        report["weights_dir"] = str(Path(args.weights_dir))

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
