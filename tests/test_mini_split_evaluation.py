import json
import os
import tempfile
import unittest
from pathlib import Path

from src.cloud_twin.data_store import DataStore
from src.dataset.mini_split_evaluator import evaluate_replay_clip, evaluate_replay_directory


class MiniSplitEvaluationTest(unittest.TestCase):
    def test_constant_velocity_baseline_reports_prediction_and_occlusion_metrics(self):
        with tempfile.TemporaryDirectory() as tmp:
            clip_path = Path(tmp) / "clip_001.json"
            clip_path.write_text(
                json.dumps(
                    {
                        "scene_id": "dair_mini_001",
                        "frames": [
                            {
                                "frame_id": 0,
                                "timestamp": 0,
                                "perception_ts": 1000,
                                "decision_ts": 1016,
                                "annotations": [
                                    {
                                        "track_id": 1,
                                        "class": "person",
                                        "world_pos": [0.0, 0.0],
                                        "occlusion_level": 2,
                                    }
                                ],
                            },
                            {
                                "frame_id": 1,
                                "timestamp": 100,
                                "perception_ts": 1100,
                                "decision_ts": 1118,
                                "annotations": [
                                    {
                                        "track_id": 1,
                                        "class": "person",
                                        "world_pos": [1.0, 0.0],
                                        "occlusion_level": 2,
                                    }
                                ],
                            },
                            {
                                "frame_id": 2,
                                "timestamp": 200,
                                "perception_ts": 1200,
                                "decision_ts": 1214,
                                "annotations": [
                                    {
                                        "track_id": 1,
                                        "class": "person",
                                        "world_pos": [3.0, 0.0],
                                        "occlusion_level": 2,
                                    }
                                ],
                            },
                            {
                                "frame_id": 3,
                                "timestamp": 300,
                                "e2e_latency_ms": 20,
                                "annotations": [
                                    {
                                        "track_id": 1,
                                        "class": "person",
                                        "world_pos": [6.0, 0.0],
                                        "occlusion_level": 2,
                                    }
                                ],
                            },
                        ],
                    }
                ),
                encoding="utf-8",
            )

            report = evaluate_replay_clip(clip_path, horizon=2)

        self.assertEqual(report["source"], "mini_split_offline")
        self.assertEqual(report["scene_id"], "dair_mini_001")
        self.assertEqual(report["sample_count"], 4)
        self.assertEqual(report["metrics"]["precision"], 1.0)
        self.assertEqual(report["metrics"]["recall"], 1.0)
        self.assertEqual(report["metrics"]["f1Score"], 1.0)
        self.assertEqual(report["metrics"]["ade"], 1.67)
        self.assertEqual(report["metrics"]["fde"], 2.0)
        self.assertEqual(report["metrics"]["occAde"], 1.67)
        self.assertEqual(report["metrics"]["occAcc"], 1.0)
        self.assertEqual(report["metrics"]["e2eLatency"], 17.0)
        self.assertEqual(report["metrics"]["fps"], 10.0)
        self.assertEqual(report["baselines"][0]["model"], "Constant Velocity Baseline")
        target_status = {item["key"]: item for item in report["targetStatus"]}
        self.assertEqual(target_status["ade"]["status"], "fail")
        self.assertEqual(target_status["fde"]["status"], "fail")
        self.assertEqual(target_status["occAde"]["status"], "fail")
        self.assertEqual(target_status["occAcc"]["status"], "pass")
        self.assertEqual(target_status["fps"]["status"], "pass")
        self.assertEqual(target_status["e2eLatency"]["status"], "pass")

    def test_replay_clip_reports_occlusion_lead_time_until_target_reveal(self):
        with tempfile.TemporaryDirectory() as tmp:
            clip_path = Path(tmp) / "clip_lead_time.json"
            clip_path.write_text(
                json.dumps(
                    {
                        "scene_id": "dair_mini_lead_time",
                        "frames": [
                            {
                                "frame_id": 0,
                                "timestamp": 0,
                                "annotations": [{"track_id": 7, "world_pos": [0.0, 0.0], "occlusion_level": 2}],
                            },
                            {
                                "frame_id": 1,
                                "timestamp": 1000,
                                "annotations": [{"track_id": 7, "world_pos": [1.0, 0.0], "occlusion_level": 2}],
                            },
                            {
                                "frame_id": 2,
                                "timestamp": 2000,
                                "annotations": [{"track_id": 7, "world_pos": [2.0, 0.0], "occlusion_level": 0}],
                            },
                        ],
                    }
                ),
                encoding="utf-8",
            )

            report = evaluate_replay_clip(clip_path, horizon=1)

        self.assertEqual(report["metrics"]["leadTime"], 2.0)
        target_status = {item["key"]: item for item in report["targetStatus"]}
        self.assertEqual(target_status["leadTime"]["status"], "pass")

    def test_data_store_prefers_offline_evaluation_artifact_when_configured(self):
        previous = os.environ.get("V2X_EVALUATION_REPORT")
        with tempfile.TemporaryDirectory() as tmp:
            artifact_path = Path(tmp) / "evaluation.json"
            artifact_path.write_text(
                json.dumps(
                    {
                        "source": "mini_split_offline",
                        "scene_id": "dair_mini_001",
                        "sample_count": 4,
                        "event_count": 0,
                        "high_risk_frames": 3,
                        "min_ttc": None,
                        "metrics": {
                            "precision": 1.0,
                            "recall": 1.0,
                            "f1Score": 1.0,
                            "ade": 1.67,
                            "fde": 2.0,
                            "occAde": 1.67,
                            "occAcc": 1.0,
                            "avgLatency": 0.0,
                            "e2eLatency": 17.0,
                            "fps": 10.0,
                        },
                        "baselines": [],
                        "ablations": [],
                    }
                ),
                encoding="utf-8",
            )
            os.environ["V2X_EVALUATION_REPORT"] = str(artifact_path)
            try:
                store = DataStore(str(Path(tmp) / "demo.db"))
                report = store.get_evaluation_report(scene_id="dair_mini_001")
            finally:
                if previous is None:
                    os.environ.pop("V2X_EVALUATION_REPORT", None)
                else:
                    os.environ["V2X_EVALUATION_REPORT"] = previous

        self.assertEqual(report["source"], "mini_split_offline")
        self.assertEqual(report["metrics"]["occAcc"], 1.0)
        target_status = {item["key"]: item for item in report["targetStatus"]}
        self.assertEqual(target_status["occAcc"]["status"], "pass")

    def test_data_store_lists_and_loads_named_offline_evaluation_reports(self):
        previous_dir = os.environ.get("V2X_EVALUATION_DIR")
        with tempfile.TemporaryDirectory() as tmp:
            reports_dir = Path(tmp) / "reports"
            reports_dir.mkdir()
            mini_report = {
                "source": "mini_split_offline",
                "scene_id": "dair_mini_001",
                "sample_count": 4,
                "event_count": 0,
                "high_risk_frames": 3,
                "min_ttc": None,
                "metrics": {"ade": 0.8, "fde": 1.2, "occAde": 0.9, "occAcc": 1.0, "fps": 10.0},
                "baselines": [],
                "ablations": [],
            }
            stgnn_report = {
                "source": "stgnn_checkpoint_offline",
                "scene_id": "dair_mini_001",
                "sample_count": 2,
                "event_count": 0,
                "high_risk_frames": 2,
                "min_ttc": None,
                "metrics": {"ade": 0.4, "fde": 0.7, "occAde": 0.5, "occAcc": 0.75, "fps": 12.0},
                "baselines": [{"model": "OccAware-STGNN Checkpoint"}],
                "ablations": [],
            }
            yolo_report = {
                "source": "yolo_detection_offline",
                "scene_id": "dair_mini_001",
                "sample_count": 5,
                "event_count": 0,
                "high_risk_frames": 0,
                "metrics": {"precision": 0.8, "recall": 0.75, "f1Score": 0.774, "fps": 9.5},
                "baselines": [{"model": "YOLO Detection"}],
                "ablations": [],
                "detection": {"true_positive": 6, "false_positive": 1, "false_negative": 2},
            }
            (reports_dir / "evaluation.json").write_text(json.dumps(mini_report), encoding="utf-8")
            (reports_dir / "stgnn_evaluation.json").write_text(json.dumps(stgnn_report), encoding="utf-8")
            (reports_dir / "yolo_detection.json").write_text(json.dumps(yolo_report), encoding="utf-8")
            os.environ["V2X_EVALUATION_DIR"] = str(reports_dir)
            try:
                store = DataStore(str(Path(tmp) / "demo.db"))
                reports = store.list_evaluation_reports(scene_id="dair_mini_001")
                report_by_key = {item["key"]: item for item in reports}
                loaded = store.get_evaluation_report(scene_id="dair_mini_001", report_key="stgnn_checkpoint")
                yolo_loaded = store.get_evaluation_report(scene_id="dair_mini_001", report_key="yolo_detection")
            finally:
                if previous_dir is None:
                    os.environ.pop("V2X_EVALUATION_DIR", None)
                else:
                    os.environ["V2X_EVALUATION_DIR"] = previous_dir

        self.assertTrue(report_by_key["mini_split"]["available"])
        self.assertEqual(report_by_key["mini_split"]["source"], "mini_split_offline")
        self.assertTrue(report_by_key["stgnn_checkpoint"]["available"])
        self.assertEqual(report_by_key["stgnn_checkpoint"]["source"], "stgnn_checkpoint_offline")
        self.assertTrue(report_by_key["yolo_detection"]["available"])
        self.assertEqual(report_by_key["yolo_detection"]["source"], "yolo_detection_offline")
        self.assertEqual(loaded["source"], "stgnn_checkpoint_offline")
        self.assertEqual(loaded["baselines"][0]["model"], "OccAware-STGNN Checkpoint")
        self.assertEqual(yolo_loaded["source"], "yolo_detection_offline")
        self.assertEqual(yolo_loaded["detection"]["true_positive"], 6)
        target_status = {item["key"]: item for item in loaded["targetStatus"]}
        self.assertEqual(target_status["ade"]["status"], "pass")

    def test_replay_directory_evaluation_aggregates_multiple_clips(self):
        with tempfile.TemporaryDirectory() as tmp:
            replay_dir = Path(tmp) / "replay"
            replay_dir.mkdir()
            (replay_dir / "clip_001.json").write_text(
                json.dumps(
                    {
                        "scene_id": "dair_clip_001",
                        "frames": [
                            {
                                "frame_id": 0,
                                "timestamp": 0,
                                "perception_ts": 1000,
                                "decision_ts": 1010,
                                "annotations": [{"track_id": 1, "world_pos": [0.0, 0.0], "occlusion_level": 2}],
                            },
                            {
                                "frame_id": 1,
                                "timestamp": 100,
                                "perception_ts": 1100,
                                "decision_ts": 1120,
                                "annotations": [{"track_id": 1, "world_pos": [1.0, 0.0], "occlusion_level": 2}],
                            },
                            {
                                "frame_id": 2,
                                "timestamp": 200,
                                "perception_ts": 1200,
                                "decision_ts": 1230,
                                "annotations": [{"track_id": 1, "world_pos": [3.0, 0.0], "occlusion_level": 2}],
                            },
                            {
                                "frame_id": 3,
                                "timestamp": 300,
                                "perception_ts": 1300,
                                "decision_ts": 1340,
                                "annotations": [{"track_id": 1, "world_pos": [6.0, 0.0], "occlusion_level": 2}],
                            },
                        ],
                    }
                ),
                encoding="utf-8",
            )
            (replay_dir / "clip_002.json").write_text(
                json.dumps(
                    {
                        "scene_id": "dair_clip_002",
                        "frames": [
                            {
                                "frame_id": 0,
                                "timestamp": 0,
                                "e2e_latency_ms": 5,
                                "annotations": [{"track_id": 2, "world_pos": [0.0, 0.0], "occlusion_level": 0}],
                            },
                            {
                                "frame_id": 1,
                                "timestamp": 100,
                                "e2e_latency_ms": 15,
                                "annotations": [{"track_id": 2, "world_pos": [1.0, 0.0], "occlusion_level": 0}],
                            },
                            {
                                "frame_id": 2,
                                "timestamp": 200,
                                "e2e_latency_ms": 25,
                                "annotations": [{"track_id": 2, "world_pos": [2.0, 0.0], "occlusion_level": 0}],
                            },
                        ],
                    }
                ),
                encoding="utf-8",
            )

            report = evaluate_replay_directory(replay_dir, horizon=2)

        self.assertEqual(report["source"], "mini_split_offline_batch")
        self.assertEqual(report["scene_id"], "mini_split_batch")
        self.assertEqual(report["clip_count"], 2)
        self.assertEqual(report["sample_count"], 7)
        self.assertEqual(report["high_risk_frames"], 4)
        self.assertEqual(report["metrics"]["ade"], 0.95)
        self.assertEqual(report["metrics"]["fde"], 1.14)
        self.assertEqual(report["metrics"]["occAde"], 1.67)
        self.assertEqual(report["metrics"]["occAcc"], 1.0)
        self.assertEqual(report["metrics"]["e2eLatency"], 20.71)
        self.assertEqual(report["metrics"]["fps"], 10.0)
        self.assertEqual([clip["scene_id"] for clip in report["clips"]], ["dair_clip_001", "dair_clip_002"])
        target_status = {item["key"]: item for item in report["targetStatus"]}
        self.assertEqual(target_status["ade"]["status"], "pass")
        self.assertEqual(target_status["fde"]["status"], "pass")
        self.assertEqual(target_status["occAde"]["status"], "fail")
        self.assertEqual(target_status["occAcc"]["status"], "pass")


if __name__ == "__main__":
    unittest.main()
