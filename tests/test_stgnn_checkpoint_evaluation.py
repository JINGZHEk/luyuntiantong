import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


def _write_samples(path: Path) -> None:
    samples = [
        {
            "sample_id": "sample_1",
            "scene_id": "demo_scene",
            "frame_id": 8,
            "track_id": 1,
            "input_features": [[0.0, 0.0, 30.0, 40.0, 0.0, 0.0, 1.0, 0.667]] * 3,
            "target_trajectory": [[1.0, 0.5], [2.0, 1.0]],
            "occlusion_label": 2,
        },
        {
            "sample_id": "sample_2",
            "scene_id": "demo_scene",
            "frame_id": 9,
            "track_id": 1,
            "input_features": [[1.0, 0.5, 30.0, 40.0, 10.0, 5.0, 1.0, 0.333]] * 3,
            "target_trajectory": [[2.0, 1.0], [3.0, 1.5]],
            "occlusion_label": 1,
        },
    ]
    path.write_text("\n".join(json.dumps(sample) for sample in samples), encoding="utf-8")


class STGNNCheckpointEvaluationTest(unittest.TestCase):
    def test_evaluate_checkpoint_dry_run_validates_report_shape_without_torch(self):
        with tempfile.TemporaryDirectory() as tmp:
            samples_path = Path(tmp) / "samples.jsonl"
            checkpoint_path = Path(tmp) / "occaware_stgnn.ts"
            output_path = Path(tmp) / "evaluation.json"
            _write_samples(samples_path)
            checkpoint_path.write_bytes(b"placeholder checkpoint")

            result = subprocess.run(
                [
                    sys.executable,
                    "scripts/evaluate_stgnn_checkpoint.py",
                    "--samples",
                    str(samples_path),
                    "--checkpoint",
                    str(checkpoint_path),
                    "--output",
                    str(output_path),
                    "--batch-size",
                    "4",
                    "--dry-run",
                ],
                cwd=Path(__file__).resolve().parents[1],
                text=True,
                capture_output=True,
                check=True,
            )
            report = json.loads(result.stdout)
            written = json.loads(output_path.read_text(encoding="utf-8"))

        self.assertEqual(report, written)
        self.assertEqual(report["source"], "stgnn_checkpoint_dry_run")
        self.assertEqual(report["scene_id"], "demo_scene")
        self.assertEqual(report["sample_count"], 2)
        self.assertEqual(report["checkpoint"], str(checkpoint_path))
        self.assertEqual(report["history_length"], 3)
        self.assertEqual(report["predict_steps"], 2)
        self.assertEqual(report["batch_size"], 4)
        self.assertFalse(report["model_loaded"])
        self.assertEqual(report["metrics"]["ade"], None)
        self.assertEqual(report["metrics"]["occAcc"], None)
        self.assertEqual(report["baselines"][0]["model"], "OccAware-STGNN Checkpoint")
        target_status = {item["key"]: item for item in report["targetStatus"]}
        self.assertEqual(target_status["ade"]["status"], "unknown")
        self.assertEqual(target_status["occAcc"]["status"], "unknown")
        self.assertEqual(target_status["fps"]["status"], "unknown")


if __name__ == "__main__":
    unittest.main()
