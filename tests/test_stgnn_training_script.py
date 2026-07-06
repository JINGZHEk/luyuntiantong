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
            "input_features": [[0.0, 0.0, 30.0, 40.0, 0.0, 0.0, 1.0, 0.667]] * 3,
            "target_trajectory": [[1.0, 0.5], [2.0, 1.0]],
            "occlusion_label": 2,
        },
        {
            "sample_id": "sample_2",
            "input_features": [[1.0, 0.5, 30.0, 40.0, 10.0, 5.0, 1.0, 0.667]] * 3,
            "target_trajectory": [[2.0, 1.0], [3.0, 1.5]],
            "occlusion_label": 1,
        },
    ]
    path.write_text("\n".join(json.dumps(sample) for sample in samples), encoding="utf-8")


class STGNNTrainingScriptTest(unittest.TestCase):
    def test_train_script_dry_run_validates_samples_without_torch(self):
        with tempfile.TemporaryDirectory() as tmp:
            samples_path = Path(tmp) / "samples.jsonl"
            output_path = Path(tmp) / "model.ts"
            _write_samples(samples_path)

            result = subprocess.run(
                [
                    sys.executable,
                    "scripts/train_stgnn.py",
                    "--samples",
                    str(samples_path),
                    "--output",
                    str(output_path),
                    "--epochs",
                    "2",
                    "--batch-size",
                    "4",
                    "--hidden-dim",
                    "16",
                    "--dry-run",
                ],
                cwd=Path(__file__).resolve().parents[1],
                text=True,
                capture_output=True,
                check=True,
            )
            report = json.loads(result.stdout)

        self.assertEqual(report["status"], "dry_run")
        self.assertEqual(report["sample_count"], 2)
        self.assertEqual(report["history_length"], 3)
        self.assertEqual(report["predict_steps"], 2)
        self.assertEqual(report["epochs"], 2)
        self.assertEqual(report["batch_size"], 4)
        self.assertTrue(report["output"].endswith("model.ts"))


if __name__ == "__main__":
    unittest.main()
