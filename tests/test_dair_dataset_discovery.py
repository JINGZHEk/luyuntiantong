import tempfile
import unittest
from pathlib import Path

from scripts.verify_dair_dataset import (
    build_dataset_report,
    discover_dair_datasets,
    validate_dataset_report,
)


class DairDatasetDiscoveryTest(unittest.TestCase):
    def test_discovers_dair_style_dataset_candidate(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "DAIR-V2X"
            image_dir = root / "infrastructure-side" / "image"
            label_dir = root / "infrastructure-side" / "label"
            image_dir.mkdir(parents=True)
            label_dir.mkdir(parents=True)
            (image_dir / "000001.jpg").write_bytes(b"image")
            (label_dir / "000001.json").write_text("[]", encoding="utf-8")

            candidates = discover_dair_datasets([Path(tmp)])

        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["root"], str(root))
        self.assertEqual(candidates[0]["image_count"], 1)
        self.assertEqual(candidates[0]["label_count"], 1)
        self.assertFalse(candidates[0]["demo_sample"])

    def test_marks_generated_demo_sample(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo_dair_sample"
            image_dir = root / "infrastructure-side" / "image"
            label_dir = root / "infrastructure-side" / "label"
            image_dir.mkdir(parents=True)
            label_dir.mkdir(parents=True)
            (image_dir / "000001.jpg").write_bytes(b"placeholder")
            (label_dir / "000001.json").write_text("[]", encoding="utf-8")
            (root / "demo_sample_meta.json").write_text("{}", encoding="utf-8")

            report = build_dataset_report(search_roots=[Path(tmp)])

        self.assertEqual(report["candidate_count"], 1)
        self.assertEqual(report["real_candidate_count"], 0)
        self.assertTrue(report["candidates"][0]["demo_sample"])

    def test_validate_report_can_require_real_dataset(self):
        report = {
            "candidate_count": 1,
            "real_candidate_count": 0,
            "candidates": [{"root": "demo", "demo_sample": True}],
        }

        with self.assertRaisesRegex(RuntimeError, "No real DAIR-V2X dataset"):
            validate_dataset_report(report, require_real=True)


if __name__ == "__main__":
    unittest.main()
