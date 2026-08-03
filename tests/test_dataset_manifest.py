import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from src.dataset.dair_manifest import build_dair_mini_split, generate_dair_demo_sample, load_dair_annotations
from src.dataset.mini_split_evaluator import evaluate_replay_clip
from src.roadside_perception.detector import Detector
from src.roadside_perception.roadside_agent import RoadsideAgent
from src.utils import get_config_path, load_config


class DairManifestTest(unittest.TestCase):
    def test_annotation_mode_does_not_load_yolo_model(self):
        detector = Detector(target_classes=["person"], mode="annotations")

        self.assertEqual(detector.mode, "annotations")
        self.assertIsNone(detector.model)

    def test_roadside_agent_yolo_mode_prefers_image_over_annotations(self):
        class FakeDetector:
            mode = "yolo"

            def __init__(self):
                self.detect_calls = 0
                self.annotation_calls = 0

            def detect(self, image):
                self.detect_calls += 1
                return [
                    {
                        "track_id": 9,
                        "class": "person",
                        "bbox": [1, 2, 3, 4],
                        "confidence": 0.91,
                        "world_pos": [1.0, 2.0],
                    }
                ]

            def detect_from_annotations(self, annotations):
                self.annotation_calls += 1
                return []

        class FakePredictor:
            def update(self, track_id, world_pos):
                pass

            def predict(self, track_id, occlusion_level):
                return [[1.0, 2.0]]

            def get_velocity(self, track_id):
                return [0.0, 0.0]

            def cleanup_stale(self, active_ids):
                pass

        class FakeOcclusion:
            def estimate(self, detection):
                return 0

        class FakeMqtt:
            def __init__(self):
                self.published = []

            def publish(self, topic, payload):
                self.published.append((topic, payload))

        agent = RoadsideAgent.__new__(RoadsideAgent)
        agent.detector = FakeDetector()
        agent.predictor = FakePredictor()
        agent.occlusion = FakeOcclusion()
        agent.mqtt = FakeMqtt()
        agent.node_id = "roadside_test"
        agent.scene_id = "scene_test"
        agent._frame_count = 0
        agent._last_heartbeat = 0

        agent.process_frame(
            {
                "frame_id": 1,
                "timestamp": 123,
                "image": object(),
                "annotations": [
                    {
                        "track_id": 1,
                        "class": "person",
                        "bbox": [0, 0, 10, 10],
                        "world_pos": [0.0, 0.0],
                    }
                ],
            }
        )

        self.assertEqual(agent.detector.detect_calls, 1)
        self.assertEqual(agent.detector.annotation_calls, 0)
        perception_payload = agent.mqtt.published[0][1]
        self.assertEqual(perception_payload["objects"][0]["track_id"], 9)

    def test_roadside_agent_publishes_precomputed_perception_frame(self):
        class FakeMqtt:
            def __init__(self):
                self.published = []

            def publish(self, topic, payload):
                self.published.append((topic, payload))

        agent = RoadsideAgent.__new__(RoadsideAgent)
        agent.mqtt = FakeMqtt()
        agent.node_id = "roadside_test"
        agent.scene_id = "scene_test"
        agent._frame_count = 0
        agent._last_heartbeat = 10**12

        agent.process_frame(
            {
                "frame_id": 3,
                "timestamp": 456,
                "perception": {
                    "frame_id": 3,
                    "timestamp": 456,
                    "node_id": "roadside_test",
                    "objects": [
                        {
                            "track_id": 1,
                            "class": "person",
                            "world_pos": [15.0, 0.0],
                            "velocity": [0.0, -1.3],
                            "predicted_traj": [[15.0, -0.2]],
                        }
                    ],
                    "processing_time_ms": 12.0,
                },
            }
        )

        self.assertEqual(len(agent.mqtt.published), 1)
        topic, payload = agent.mqtt.published[0]
        self.assertEqual(topic, "v2x/scene_test/roadside/roadside_test/perception")
        self.assertEqual(payload["objects"][0]["predicted_traj"], [[15.0, -0.2]])
        self.assertEqual(payload["frame_id"], 3)

    def test_roadside_default_config_uses_annotation_detector_mode(self):
        config = load_config(get_config_path("roadside.yaml"))

        self.assertEqual(config["detection"]["mode"], "annotations")

    def test_annotation_detector_preserves_occlusion_label(self):
        detector = Detector(target_classes=["person"], mode="annotations")

        detections = detector.detect_from_annotations(
            [
                {
                    "track_id": 7,
                    "class": "person",
                    "bbox": [1, 2, 10, 20],
                    "world_pos": [3.0, 4.0],
                    "velocity": [0.0, 0.0],
                    "occlusion_level": 3,
                }
            ]
        )

        self.assertEqual(detections[0]["occlusion_level"], 3)

    def test_load_dair_annotations_maps_core_fields(self):
        with tempfile.TemporaryDirectory() as tmp:
            label_path = Path(tmp) / "000001.json"
            label_path.write_text(
                json.dumps(
                    [
                        {
                            "type": "Pedestrian",
                            "occluded_state": 2,
                            "2d_box": {"xmin": 320, "ymin": 180, "xmax": 365, "ymax": 300},
                            "3d_location": {"x": 12.5, "y": 3.2, "z": 0.0},
                            "rotation": 1.57,
                        }
                    ]
                ),
                encoding="utf-8",
            )

            annotations = load_dair_annotations(label_path)

        self.assertEqual(annotations[0]["track_id"], 0)
        self.assertEqual(annotations[0]["class"], "person")
        self.assertEqual(annotations[0]["bbox"], [320, 180, 45, 120])
        self.assertEqual(annotations[0]["world_pos"], [12.5, 3.2])
        self.assertEqual(annotations[0]["occlusion_level"], 2)
        self.assertEqual(annotations[0]["rotation"], 1.57)

    def test_build_dair_mini_split_writes_manifest_and_replay_clip(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "DAIR-V2X"
            output = Path(tmp) / "mini_split"
            image_dir = root / "infrastructure-side" / "image"
            label_dir = root / "infrastructure-side" / "label"
            image_dir.mkdir(parents=True)
            label_dir.mkdir(parents=True)
            (image_dir / "000001.jpg").write_bytes(b"fake-image")
            (label_dir / "000001.json").write_text(
                json.dumps(
                    [
                        {
                            "type": "Car",
                            "occluded_state": 0,
                            "2d_box": {"xmin": 10, "ymin": 20, "xmax": 30, "ymax": 50},
                            "3d_location": {"x": 1.0, "y": 2.0, "z": 0.0},
                        }
                    ]
                ),
                encoding="utf-8",
            )

            manifest = build_dair_mini_split(root, output, max_frames=1)

            manifest_path = output / "manifest.json"
            clip_path = output / "replay" / "clip_001.json"
            saved_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            saved_clip = json.loads(clip_path.read_text(encoding="utf-8"))

        self.assertEqual(manifest["frame_count"], 1)
        self.assertEqual(saved_manifest["frames"][0]["frame_id"], 0)
        self.assertEqual(saved_manifest["frames"][0]["source_id"], "000001")
        self.assertEqual(saved_clip["frames"][0]["annotations"][0]["class"], "car")
        self.assertEqual(saved_clip["frames"][0]["annotations"][0]["bbox"], [10, 20, 20, 30])

    def test_generate_demo_sample_supports_build_and_evaluate_loop(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo_dair"
            output = Path(tmp) / "mini_split"

            sample = generate_dair_demo_sample(root, frame_count=24, scene_id="demo_dair_001")
            manifest = build_dair_mini_split(root, output, max_frames=24, scene_id="demo_dair_001")
            report = evaluate_replay_clip(output / "replay" / "clip_001.json", horizon=5)

            label_files = sorted((root / "infrastructure-side" / "label").glob("*.json"))
            image_files = sorted((root / "infrastructure-side" / "image").glob("*.jpg"))

        self.assertEqual(sample["dataset"], "DAIR-V2X-demo-sample")
        self.assertEqual(len(image_files), 24)
        self.assertEqual(len(label_files), 24)
        self.assertEqual(manifest["frame_count"], 24)
        self.assertGreater(report["metrics"]["leadTime"], 0.0)
        self.assertGreater(report["metrics"]["occAcc"], 0.9)

    def test_build_script_demo_sample_outputs_single_manifest_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo_dair"
            output = Path(tmp) / "mini_split"

            result = subprocess.run(
                [
                    sys.executable,
                    "scripts/build_dair_mini_split.py",
                    "--demo-sample",
                    "--demo-root",
                    str(root),
                    "--output",
                    str(output),
                    "--max-frames",
                    "3",
                ],
                cwd=Path(__file__).resolve().parents[1],
                text=True,
                capture_output=True,
                check=True,
            )

            manifest = json.loads(result.stdout)

        self.assertEqual(manifest["frame_count"], 3)
        self.assertEqual(manifest["demo_sample"]["dataset"], "DAIR-V2X-demo-sample")

    def test_verify_m2_demo_sample_script_outputs_evaluation_summary(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = subprocess.run(
                [
                    sys.executable,
                    "scripts/verify_m2_demo_sample.py",
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

        self.assertEqual(summary["frame_count"], 24)
        self.assertEqual(summary["evaluation_source"], "mini_split_offline")
        self.assertGreaterEqual(summary["metrics"]["leadTime"], 0.5)
        self.assertEqual(summary["target_status"]["leadTime"], "pass")
        self.assertGreater(summary["stgnn_training"]["sample_count"], 0)
        self.assertTrue(summary["stgnn_training"]["samples_path"].endswith("samples.jsonl"))
        self.assertEqual(summary["stgnn_checkpoint_evaluation"]["source"], "stgnn_checkpoint_dry_run")
        self.assertTrue(summary["stgnn_checkpoint_evaluation"]["evaluation_path"].endswith("stgnn_evaluation.json"))
        self.assertEqual(summary["stgnn_checkpoint_evaluation"]["target_status"]["ade"], "unknown")
        self.assertFalse(summary["stgnn_checkpoint_evaluation"]["model_loaded"])
        self.assertEqual(summary["yolo_detection_evaluation"]["source"], "yolo_detection_dry_run")
        self.assertTrue(summary["yolo_detection_evaluation"]["evaluation_path"].endswith("yolo_detection.json"))
        self.assertEqual(summary["yolo_detection_evaluation"]["sample_count"], 24)
        self.assertGreaterEqual(summary["yolo_detection_evaluation"]["metrics"]["recall"], 0.7)


if __name__ == "__main__":
    unittest.main()
