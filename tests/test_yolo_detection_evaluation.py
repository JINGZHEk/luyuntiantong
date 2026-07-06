import json
import tempfile
import unittest
from pathlib import Path

from src.dataset.yolo_detection_evaluator import (
    bbox_iou,
    evaluate_yolo_manifest,
    match_detections_to_annotations,
)


class YoloDetectionEvaluationTest(unittest.TestCase):
    def test_bbox_iou_uses_xywh_boxes(self):
        iou = bbox_iou([0, 0, 10, 10], [5, 0, 10, 10])

        self.assertAlmostEqual(iou, 1 / 3, places=3)

    def test_match_detections_to_annotations_counts_tp_fp_fn(self):
        annotations = [
            {"class": "person", "bbox": [0, 0, 10, 10]},
            {"class": "car", "bbox": [50, 50, 10, 10]},
        ]
        detections = [
            {"class": "person", "bbox": [1, 1, 10, 10], "confidence": 0.9},
            {"class": "person", "bbox": [80, 80, 10, 10], "confidence": 0.8},
        ]

        result = match_detections_to_annotations(detections, annotations, iou_threshold=0.5)

        self.assertEqual(result["true_positive"], 1)
        self.assertEqual(result["false_positive"], 1)
        self.assertEqual(result["false_negative"], 1)
        self.assertEqual(result["per_class"]["person"]["true_positive"], 1)
        self.assertEqual(result["per_class"]["car"]["false_negative"], 1)

    def test_evaluate_yolo_manifest_outputs_detection_metrics(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            image_path = root / "000001.jpg"
            image_path.write_bytes(b"fake")
            manifest_path = root / "manifest.json"
            manifest_path.write_text(
                json.dumps(
                    {
                        "scene_id": "dair_eval_001",
                        "frames": [
                            {
                                "frame_id": 0,
                                "image_path": str(image_path),
                                "annotation_count": 1,
                                "annotations": [
                                    {"class": "person", "bbox": [0, 0, 10, 10]},
                                ],
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            def fake_detector(path):
                self.assertEqual(Path(path), image_path)
                return [{"class": "person", "bbox": [0, 0, 10, 10], "confidence": 0.95}]

            report = evaluate_yolo_manifest(
                manifest_path=manifest_path,
                detector=fake_detector,
                iou_threshold=0.5,
            )

        self.assertEqual(report["source"], "yolo_detection_offline")
        self.assertEqual(report["scene_id"], "dair_eval_001")
        self.assertEqual(report["sample_count"], 1)
        self.assertEqual(report["metrics"]["precision"], 1.0)
        self.assertEqual(report["metrics"]["recall"], 1.0)
        self.assertEqual(report["metrics"]["f1Score"], 1.0)
        self.assertEqual(report["detection"]["true_positive"], 1)
        self.assertEqual(report["detection"]["false_positive"], 0)
        self.assertEqual(report["detection"]["false_negative"], 0)


if __name__ == "__main__":
    unittest.main()
