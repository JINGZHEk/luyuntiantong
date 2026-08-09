import unittest

from src.roadside_perception.roadside_agent import RoadsideAgent


class InvalidCoordinateDetector:
    mode = "yolo"

    def detect(self, _image):
        return [{
            "track_id": 4,
            "class": "car",
            "bbox": [10, 20, 30, 40],
            "confidence": 0.9,
        }]


class InvalidCoordinateMapper:
    def image_bbox_to_world(self, _bbox):
        return {"status": "invalid", "world_pos": None, "reason": "calibration missing"}


class PredictorMustNotRun:
    def update(self, *_args, **_kwargs):
        raise AssertionError("invalid coordinates must not update predictor")

    def predict(self, *_args, **_kwargs):
        raise AssertionError("invalid coordinates must not predict")


class ZeroOcclusion:
    def estimate(self, _detection):
        return 0


class CaptureMqtt:
    def __init__(self):
        self.published = []

    def publish(self, topic, payload):
        self.published.append((topic, payload))


class RoadsideAgentCoordinateTest(unittest.TestCase):
    def test_invalid_coordinate_is_not_replaced_with_zero_position(self):
        agent = RoadsideAgent.__new__(RoadsideAgent)
        agent.detector = InvalidCoordinateDetector()
        agent.coordinate_mapper = InvalidCoordinateMapper()
        agent.predictor = PredictorMustNotRun()
        agent.occlusion = ZeroOcclusion()
        agent.mqtt = CaptureMqtt()
        agent.node_id = "pc_roadside_001"
        agent.scene_id = "scene_test"
        agent.config = {
            "detection": {"mode": "yolo"},
            "tracking": {"backend": "deepsort"},
        }
        agent._frame_count = 0
        agent._last_heartbeat = 10**12
        agent.prediction_location = "cloud"

        agent.process_frame({"frame_id": 1, "timestamp": 100, "image": object()})

        obj = agent.mqtt.published[0][1]["objects"][0]
        self.assertIsNone(obj["world_pos"])
        self.assertEqual(obj["coordinate_status"], "invalid")
        self.assertEqual(obj["prediction_status"], "invalid_coordinate")
        self.assertEqual(obj["predicted_traj"], [])
        source = agent.mqtt.published[0][1]["source"]
        self.assertEqual(source["detector"], "yolo")
        self.assertEqual(source["tracker"], "deepsort")


if __name__ == "__main__":
    unittest.main()
