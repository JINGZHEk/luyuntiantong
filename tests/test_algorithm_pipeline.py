import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


class AlgorithmPipelineTest(unittest.TestCase):
    def test_algorithm_pipeline_dry_run_outputs_m2_and_stgnn_summary(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = subprocess.run(
                [
                    sys.executable,
                    "scripts/verify_algorithm_pipeline.py",
                    "--work-dir",
                    tmp,
                    "--frames",
                    "24",
                    "--horizon",
                    "5",
                ],
                cwd=Path(__file__).resolve().parents[1],
                text=True,
                capture_output=True,
                check=True,
            )
            summary = json.loads(result.stdout)

        self.assertEqual(summary["status"], "dry_run")
        self.assertEqual(summary["m2_demo"]["evaluation_source"], "mini_split_offline")
        self.assertGreater(summary["m2_demo"]["stgnn_training"]["sample_count"], 0)
        self.assertEqual(summary["stgnn"]["mode"], "dry_run")
        self.assertEqual(summary["stgnn"]["evaluation"]["source"], "stgnn_checkpoint_dry_run")
        self.assertFalse(summary["stgnn"]["evaluation"]["model_loaded"])


if __name__ == "__main__":
    unittest.main()
