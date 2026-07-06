import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from src.dataset.stgnn_training_data import build_stgnn_samples, export_stgnn_training_data


def _clip(frame_count: int = 6) -> dict:
    frames = []
    for frame_id in range(frame_count):
        frames.append(
            {
                "frame_id": frame_id,
                "timestamp": frame_id * 100,
                "annotations": [
                    {
                        "track_id": 1,
                        "class": "person",
                        "bbox": [10, 20, 30, 40],
                        "world_pos": [float(frame_id), float(frame_id * 0.5)],
                        "occlusion_level": 2 if frame_id < frame_count - 1 else 0,
                    },
                    {
                        "track_id": 2,
                        "class": "car",
                        "bbox": [0, 0, 80, 40],
                        "world_pos": [5.0, 0.0],
                        "occlusion_level": 0,
                    },
                ],
            }
        )
    return {"scene_id": "sample_scene", "frames": frames}


class STGNNTrainingDataTest(unittest.TestCase):
    def test_build_stgnn_samples_from_replay_clip(self):
        samples = build_stgnn_samples(_clip(), history_length=3, predict_steps=2, fps=10.0, target_classes=["person"])

        self.assertEqual(len(samples), 2)
        first = samples[0]
        self.assertEqual(first["sample_id"], "sample_scene_000002_1")
        self.assertEqual(first["track_id"], 1)
        self.assertEqual(first["frame_id"], 2)
        self.assertEqual(first["occlusion_label"], 2)
        self.assertEqual(first["input_features"][-1], [2.0, 1.0, 30.0, 40.0, 10.0, 5.0, 1.0, 0.667])
        self.assertEqual(first["target_trajectory"], [[3.0, 1.5], [4.0, 2.0]])

    def test_export_stgnn_training_data_writes_jsonl_and_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            clip_path = Path(tmp) / "clip.json"
            output_dir = Path(tmp) / "stgnn"
            clip_path.write_text(json.dumps(_clip()), encoding="utf-8")

            manifest = export_stgnn_training_data(
                clip_path=clip_path,
                output_dir=output_dir,
                history_length=3,
                predict_steps=2,
                fps=10.0,
                target_classes=["person"],
            )

            jsonl_path = Path(manifest["samples_path"])
            rows = [json.loads(line) for line in jsonl_path.read_text(encoding="utf-8").splitlines()]

        self.assertEqual(manifest["sample_count"], 2)
        self.assertEqual(manifest["history_length"], 3)
        self.assertEqual(manifest["predict_steps"], 2)
        self.assertEqual(rows[0]["target_trajectory"], [[3.0, 1.5], [4.0, 2.0]])

    def test_build_script_exports_training_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            clip_path = Path(tmp) / "clip.json"
            output_dir = Path(tmp) / "stgnn"
            clip_path.write_text(json.dumps(_clip()), encoding="utf-8")

            result = subprocess.run(
                [
                    sys.executable,
                    "scripts/build_stgnn_training_data.py",
                    "--clip",
                    str(clip_path),
                    "--output",
                    str(output_dir),
                    "--history-length",
                    "3",
                    "--predict-steps",
                    "2",
                    "--target-class",
                    "person",
                ],
                cwd=Path(__file__).resolve().parents[1],
                text=True,
                capture_output=True,
                check=True,
            )
            manifest = json.loads(result.stdout)

        self.assertEqual(manifest["sample_count"], 2)
        self.assertTrue(manifest["samples_path"].endswith("samples.jsonl"))


if __name__ == "__main__":
    unittest.main()
