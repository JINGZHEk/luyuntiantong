import argparse
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.roadside_perception.detector import Detector


def build_detector_model_reference(model_name: str, weights_dir: Path) -> str:
    model_path = Path(model_name)
    if model_path.parent != Path(".") or model_path.suffix:
        return str(model_path.with_suffix(""))
    return str(weights_dir / model_name)


def find_ultralytics_asset(
    package_root: Path | None = None,
    preferred_name: str = "bus.jpg",
) -> Path | None:
    if package_root is None:
        spec = importlib.util.find_spec("ultralytics")
        if spec is None or spec.origin is None:
            return None
        package_root = Path(spec.origin).resolve().parent

    assets_dir = package_root / "assets"
    preferred = assets_dir / preferred_name
    if preferred.exists():
        return preferred

    for candidate in sorted(assets_dir.glob("*.jpg")):
        if candidate.exists():
            return candidate
    return None


def run_yolo_image_inference(
    image_path: Path,
    model_name: str = "yolov8n",
    weights_dir: Path = PROJECT_ROOT / "data" / "model_cache",
    confidence: float = 0.25,
    iou_threshold: float = 0.5,
    target_classes: list[str] | None = None,
) -> dict[str, Any]:
    weights_dir.mkdir(parents=True, exist_ok=True)
    detector_model_ref = build_detector_model_reference(model_name, weights_dir)
    detector = Detector(
        model_name=detector_model_ref,
        confidence=confidence,
        iou_threshold=iou_threshold,
        target_classes=target_classes or ["person", "car", "truck", "bus"],
        mode="yolo",
    )
    detections = detector.detect(str(image_path))
    return {
        "image": str(image_path),
        "model": model_name,
        "weights_dir": str(weights_dir),
        "model_loaded": detector.model is not None,
        "detection_count": len(detections),
        "classes": sorted({detection["class"] for detection in detections}),
        "detections": detections,
    }


def validate_inference_summary(summary: dict[str, Any], min_detections: int = 1) -> None:
    if not summary.get("model_loaded"):
        raise RuntimeError("YOLO model was not loaded")
    detection_count = int(summary.get("detection_count", 0))
    if detection_count < min_detections:
        raise RuntimeError(f"Expected at least {min_detections} detections, got {detection_count}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run real YOLO inference on a real image")
    parser.add_argument("--image", default=None, help="Image path; defaults to ultralytics packaged bus.jpg")
    parser.add_argument("--model", default="yolov8n", help="Ultralytics YOLO model name")
    parser.add_argument(
        "--weights-dir",
        default=str(PROJECT_ROOT / "data" / "model_cache"),
        help="Directory for downloaded YOLO weights",
    )
    parser.add_argument("--confidence", type=float, default=0.25, help="Detection confidence threshold")
    parser.add_argument("--iou", type=float, default=0.5, help="YOLO tracking IoU threshold")
    parser.add_argument("--min-detections", type=int, default=1, help="Minimum detections required")
    args = parser.parse_args()

    image_path = Path(args.image) if args.image else find_ultralytics_asset()
    if image_path is None:
        raise SystemExit("No image path provided and ultralytics packaged assets were not found")
    if not image_path.exists():
        raise SystemExit(f"Image not found: {image_path}")

    summary = run_yolo_image_inference(
        image_path=image_path,
        model_name=args.model,
        weights_dir=Path(args.weights_dir),
        confidence=args.confidence,
        iou_threshold=args.iou,
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    try:
        validate_inference_summary(summary, min_detections=args.min_detections)
    except RuntimeError as exc:
        raise SystemExit(str(exc)) from exc


if __name__ == "__main__":
    main()
