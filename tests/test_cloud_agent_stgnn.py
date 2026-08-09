import unittest
import tempfile
from pathlib import Path

from src.cloud_twin.cloud_agent import CloudAgent


class FakeService:
    def __init__(self):
        self.payloads = []

    def update_and_predict(self, payload):
        self.payloads.append(payload)
        return {
            **payload,
            "prediction": {"location": "cloud", "backend": "stgnn", "status": "ready"},
            "objects": [{**payload["objects"][0], "predicted_traj": [[1.0, 2.0]]}],
        }


class FakeStore:
    def __init__(self):
        self.frames = []

    def store_frame(self, **kwargs):
        self.frames.append(kwargs)


class CloudAgentSTGNNTest(unittest.TestCase):
    def test_database_path_can_be_overridden_for_pc_cloud_runs(self):
        with tempfile.TemporaryDirectory() as tmp:
            database_path = Path(tmp) / "pc_cloud.db"
            agent = CloudAgent(database_path=str(database_path))

            self.assertEqual(Path(agent.store.db_path), database_path.resolve())
            agent.stop()

    def test_perception_is_enriched_before_persistence_and_broadcast(self):
        agent = CloudAgent.__new__(CloudAgent)
        agent.scene_id = "scene_test"
        agent.stgnn_service = FakeService()
        agent.store = FakeStore()
        broadcasts = []
        agent._broadcast = lambda msg_type, payload: broadcasts.append((msg_type, payload))

        payload = {
            "frame_id": 7,
            "timestamp": 123,
            "node_id": "pc_roadside_001",
            "objects": [{"track_id": 1, "world_pos": [1.0, 2.0]}],
        }
        agent._on_perception("topic", payload)

        self.assertEqual(agent.stgnn_service.payloads, [payload])
        self.assertEqual(agent.store.frames[0]["perception"]["prediction"]["status"], "ready")
        self.assertEqual(broadcasts[0][0], "perception")
        self.assertEqual(broadcasts[0][1]["objects"][0]["predicted_traj"], [[1.0, 2.0]])


if __name__ == "__main__":
    unittest.main()
