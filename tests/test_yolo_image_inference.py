import tempfile
import unittest
from pathlib import Path

from scripts.verify_yolo_image_inference import (
    build_detector_model_reference,
    find_ultralytics_asset,
    validate_inference_summary,
)


class YoloImageInferenceTest(unittest.TestCase):
    def test_find_ultralytics_asset_prefers_existing_packaged_image(self):
        with tempfile.TemporaryDirectory() as tmp:
            package_root = Path(tmp)
            asset = package_root / "assets" / "bus.jpg"
            asset.parent.mkdir()
            asset.write_bytes(b"fake image bytes")

            found = find_ultralytics_asset(package_root=package_root, preferred_name="bus.jpg")

        self.assertEqual(found, asset)

    def test_validate_inference_summary_requires_real_detection(self):
        summary = {
            "image": "bus.jpg",
            "model": "yolov8n",
            "model_loaded": True,
            "detection_count": 2,
            "detections": [{"class": "person"}, {"class": "bus"}],
        }

        validate_inference_summary(summary, min_detections=1)

    def test_build_detector_model_reference_uses_cache_dir_for_bare_model_name(self):
        model_ref = build_detector_model_reference("yolov8n", Path("data/model_cache"))

        self.assertEqual(model_ref, str(Path("data/model_cache") / "yolov8n"))

    def test_validate_inference_summary_rejects_empty_detections(self):
        summary = {
            "image": "bus.jpg",
            "model": "yolov8n",
            "model_loaded": True,
            "detection_count": 0,
            "detections": [],
        }

        with self.assertRaisesRegex(RuntimeError, "Expected at least"):
            validate_inference_summary(summary, min_detections=1)


if __name__ == "__main__":
    unittest.main()
