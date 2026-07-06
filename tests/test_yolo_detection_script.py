import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


class YoloDetectionScriptTest(unittest.TestCase):
    def test_script_dry_run_writes_report_without_ultralytics(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            image_path = root / "000001.jpg"
            image_path.write_bytes(b"fake")
            manifest_path = root / "manifest.json"
            output_path = root / "yolo_detection.json"
            manifest_path.write_text(
                json.dumps(
                    {
                        "scene_id": "dry_run_yolo",
                        "frames": [
                            {
                                "frame_id": 0,
                                "image_path": str(image_path),
                                "annotations": [{"class": "person", "bbox": [0, 0, 10, 10]}],
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            result = subprocess.run(
                [
                    sys.executable,
                    "scripts/evaluate_yolo_detection.py",
                    "--manifest",
                    str(manifest_path),
                    "--output",
                    str(output_path),
                    "--dry-run",
                ],
                cwd=Path(__file__).resolve().parents[1],
                text=True,
                capture_output=True,
                check=True,
            )
            output_exists = output_path.exists()

        report = json.loads(result.stdout)
        self.assertEqual(report["source"], "yolo_detection_dry_run")
        self.assertEqual(report["sample_count"], 1)
        self.assertTrue(output_exists)


if __name__ == "__main__":
    unittest.main()
