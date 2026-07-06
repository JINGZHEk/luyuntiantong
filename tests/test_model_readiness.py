import json
import subprocess
import sys
import unittest
from pathlib import Path

import yaml


class ModelReadinessTest(unittest.TestCase):
    def test_model_readiness_outputs_json_without_requiring_optional_packages(self):
        result = subprocess.run(
            [sys.executable, "scripts/verify_model_readiness.py"],
            cwd=Path(__file__).resolve().parents[1],
            text=True,
            capture_output=True,
            check=True,
        )

        report = json.loads(result.stdout)

        self.assertIn("python", report)
        self.assertIn("yolo", report)
        self.assertIn("stgnn", report)
        self.assertEqual(report["recommended_environment"], "environment-algorithm.yml")
        self.assertIn("ultralytics", report["yolo"]["packages"])
        self.assertIn("torch", report["stgnn"]["packages"])

    def test_model_readiness_can_require_yolo_packages(self):
        result = subprocess.run(
            [sys.executable, "scripts/verify_model_readiness.py", "--require-yolo"],
            cwd=Path(__file__).resolve().parents[1],
            text=True,
            capture_output=True,
        )
        report = json.loads(result.stdout)

        if report["yolo"]["ready"]:
            self.assertEqual(result.returncode, 0)
        else:
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("ultralytics", report["missing_required"])

    def test_algorithm_environment_spec_pins_yolo_and_stgnn_dependencies(self):
        env_path = Path(__file__).resolve().parents[1] / "environment-algorithm.yml"
        spec = yaml.safe_load(env_path.read_text(encoding="utf-8"))
        dependencies = spec["dependencies"]
        dependency_text = "\n".join(str(item) for item in dependencies)
        pip_dependencies = []
        for item in dependencies:
            if isinstance(item, dict) and "pip" in item:
                pip_dependencies.extend(item["pip"])
        pip_text = "\n".join(pip_dependencies)

        self.assertEqual(spec["name"], "v2x-ghost-algorithm")
        self.assertIn("python=3.11", dependency_text)
        self.assertIn("pytorch", dependency_text)
        self.assertIn("torchvision", dependency_text)
        self.assertIn("ultralytics", pip_text)
        self.assertIn("torch-geometric", pip_text)
        self.assertIn("lap", pip_text)

    def test_startup_doc_explains_algorithm_environment_creation(self):
        startup_doc = (Path(__file__).resolve().parents[1] / "启动.md").read_text(encoding="utf-8")

        self.assertIn("conda env create -f environment-algorithm.yml", startup_doc)
        self.assertIn("conda activate v2x-ghost-algorithm", startup_doc)
        self.assertIn("python scripts\\verify_model_readiness.py --require-yolo", startup_doc)
        self.assertIn("python scripts\\verify_model_readiness.py --require-stgnn", startup_doc)


if __name__ == "__main__":
    unittest.main()
