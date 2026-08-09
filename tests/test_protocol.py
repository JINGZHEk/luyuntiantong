import unittest

from src.communication.protocol import PerceptionMessage


class PerceptionProtocolTest(unittest.TestCase):
    def test_perception_message_adds_cloud_prediction_metadata(self):
        message = PerceptionMessage(
            timestamp=123456,
            frame_id=7,
            node_id="pc_roadside_001",
            objects=[
                {
                    "track_id": 3,
                    "class": "car",
                    "bbox": [10, 20, 30, 40],
                    "world_pos": [1.2, 3.4],
                    "velocity": [0.5, 0.0],
                    "confidence": 0.9,
                    "occlusion_level": 0,
                    "predicted_traj": [],
                }
            ],
            scene_id="scene_test",
            source={"device_type": "pc_replay", "camera_id": "cam_001"},
            coordinate_frame="road_xy",
            prediction={
                "location": "cloud",
                "backend": "stgnn",
                "status": "deferred",
                "reason": "insufficient_history",
            },
        )

        payload = message.to_dict()

        self.assertEqual(payload["schema_version"], 1)
        self.assertEqual(payload["message_type"], "perception")
        self.assertEqual(payload["scene_id"], "scene_test")
        self.assertEqual(payload["source"]["device_type"], "pc_replay")
        self.assertEqual(payload["coordinate_frame"], "road_xy")
        self.assertEqual(payload["prediction"]["status"], "deferred")

    def test_legacy_perception_call_keeps_safe_defaults(self):
        payload = PerceptionMessage(
            timestamp=123456,
            frame_id=1,
            node_id="roadside_001",
            objects=[],
        ).to_dict()

        self.assertEqual(payload["schema_version"], 1)
        self.assertEqual(payload["message_type"], "perception")
        self.assertEqual(payload["scene_id"], "scene_001")
        self.assertEqual(payload["source"], {})
        self.assertEqual(payload["coordinate_frame"], "road_xy")
        self.assertEqual(payload["prediction"]["status"], "deferred")


if __name__ == "__main__":
    unittest.main()
