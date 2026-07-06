import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


def _torch_imports_cleanly() -> bool:
    result = subprocess.run(
        [sys.executable, "-c", "import torch; print(torch.__version__)"],
        text=True,
        capture_output=True,
    )
    return result.returncode == 0


class STGNNModelSpecTest(unittest.TestCase):
    def test_model_spec_is_available_without_importing_torch(self):
        from src.roadside_perception.stgnn_model import get_model_spec

        spec = get_model_spec(history_length=8, predict_steps=30)

        self.assertEqual(spec["name"], "OccAware-STGNN")
        self.assertEqual(spec["input_feature_dim"], 8)
        self.assertEqual(spec["history_length"], 8)
        self.assertEqual(spec["predict_steps"], 30)
        self.assertIn("trajectory", spec["heads"])
        self.assertIn("occlusion", spec["heads"])

    def test_export_script_exposes_model_spec_without_importing_torch(self):
        result = subprocess.run(
            [sys.executable, "scripts/export_stgnn_checkpoint.py", "--describe"],
            cwd=Path(__file__).resolve().parents[1],
            text=True,
            capture_output=True,
            check=True,
        )

        self.assertIn("OccAware-STGNN", result.stdout)
        self.assertIn("TorchScript", result.stdout)


@unittest.skipUnless(_torch_imports_cleanly(), "torch cannot be imported cleanly in this Python environment")
class STGNNModelTorchTest(unittest.TestCase):
    def test_model_forward_outputs_trajectory_and_occlusion_logits(self):
        import torch

        from src.roadside_perception.stgnn_model import OccAwareSTGNN

        model = OccAwareSTGNN(feature_dim=8, hidden_dim=16, predict_steps=5)
        features = torch.randn(2, 3, 4, 8)

        trajectory, occlusion_logits = model(features)

        self.assertEqual(tuple(trajectory.shape), (2, 3, 5, 2))
        self.assertEqual(tuple(occlusion_logits.shape), (2, 3, 4))

    def test_torchscript_checkpoint_can_drive_predictor(self):
        from src.roadside_perception.stgnn_model import export_torchscript_checkpoint
        from src.roadside_perception.stgnn_predictor import OccAwareSTGNNPredictor

        with tempfile.TemporaryDirectory() as tmp:
            checkpoint = Path(tmp) / "occaware_stgnn.ts"
            export_torchscript_checkpoint(
                checkpoint,
                history_length=4,
                predict_steps=3,
                hidden_dim=16,
                seed=7,
            )

            predictor = OccAwareSTGNNPredictor(
                history_length=4,
                predict_steps=3,
                fps=10.0,
                model_path=str(checkpoint),
            )
            predictor.update(1, [0.0, 0.0], metadata={"bbox": [0, 0, 20, 40], "class": "person"})
            predictor.update(1, [1.0, 0.0], metadata={"bbox": [0, 0, 20, 40], "class": "person"})

            prediction = predictor.predict(1, occlusion_level=1)

        self.assertEqual(predictor.backend_status["mode"], "torchscript_stgnn")
        self.assertTrue(predictor.backend_status["model_loaded"])
        self.assertEqual(len(prediction), 3)
        self.assertEqual(len(prediction[0]), 2)


if __name__ == "__main__":
    unittest.main()
