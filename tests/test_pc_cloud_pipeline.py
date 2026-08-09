import tempfile
import unittest
from pathlib import Path

from src.cloud_twin.cloud_agent import CloudAgent
from src.cloud_twin.data_store import DataStore
from src.cloud_twin.stgnn_service import CloudSTGNNService
from src.communication.in_memory_mqtt import InMemoryBroker, InMemoryMQTTClient
from src.utils import setup_logger


class PipelinePredictor:
    def __init__(self, **kwargs):
        self.histories = {}
        self.backend_status = {
            "mode": "test_stgnn",
            "model_loaded": True,
            "model_path": kwargs.get("model_path"),
            "reason": None,
        }

    def update(self, track_id, position, metadata=None):
        self.histories.setdefault(track_id, []).append(position)

    def predict(self, track_id, occlusion_level=0):
        if len(self.histories.get(track_id, [])) < 2:
            return []
        x, y = self.histories[track_id][-1]
        return [[x + 0.5, y], [x + 1.0, y]]

    def get_velocity(self, track_id):
        return [1.0, 0.0]

    def cleanup_stale(self, active_ids):
        self.histories = {
            track_id: history
            for track_id, history in self.histories.items()
            if track_id in active_ids
        }


class PcCloudPipelineTest(unittest.TestCase):
    def test_perception_frames_are_enriched_stored_and_broadcast(self):
        with tempfile.TemporaryDirectory() as tmp:
            broker = InMemoryBroker()
            cloud = CloudAgent.__new__(CloudAgent)
            cloud.scene_id = "scene_test"
            cloud.logger = setup_logger("test.pc_cloud_pipeline")
            cloud.mqtt = InMemoryMQTTClient("cloud_agent_test", broker)
            cloud.store = DataStore(str(Path(tmp) / "pipeline.db"))
            cloud.stgnn_service = CloudSTGNNService(
                model_path="test-model.ts",
                min_history=2,
                predictor_factory=lambda **kwargs: PipelinePredictor(**kwargs),
            )
            broadcasts = []
            cloud._broadcast = lambda msg_type, payload: broadcasts.append((msg_type, payload))
            cloud.start()

            pc = InMemoryMQTTClient("pc_roadside_test", broker)
            pc.connect()
            topic = "v2x/scene_test/roadside/pc_roadside_001/perception"
            for frame_id in range(3):
                pc.publish(
                    topic,
                    {
                        "schema_version": 1,
                        "message_type": "perception",
                        "scene_id": "scene_test",
                        "timestamp": 1000 + frame_id * 100,
                        "frame_id": frame_id,
                        "node_id": "pc_roadside_001",
                        "source": {
                            "device_type": "pc_replay",
                            "input_type": "video",
                            "detector": "yolo",
                            "tracker": "deepsort",
                        },
                        "coordinate_frame": "road_xy",
                        "objects": [{
                            "track_id": 7,
                            "class": "car",
                            "bbox": [420, 210, 96, 80],
                            "world_pos": [float(frame_id), 3.8],
                            "velocity": [1.0, 0.0],
                            "confidence": 0.9,
                            "coordinate_status": "valid",
                            "prediction_status": "deferred",
                        }],
                    },
                )

            self.assertEqual(len(broadcasts), 3)
            self.assertTrue(all(kind == "perception" for kind, _ in broadcasts))
            self.assertEqual(broadcasts[0][1]["prediction"]["status"], "deferred")
            self.assertEqual(broadcasts[1][1]["prediction"]["status"], "ready")
            self.assertEqual(len(broadcasts[1][1]["objects"][0]["predicted_traj"]), 2)
            self.assertNotIn("image", broadcasts[1][1])

            stored = cloud.store.get_frame(1)
            self.assertIsNotNone(stored)
            self.assertEqual(stored["perception_data"]["prediction"]["status"], "ready")
            self.assertEqual(stored["perception_data"]["objects"][0]["track_id"], 7)
            cloud.stop()


if __name__ == "__main__":
    unittest.main()
