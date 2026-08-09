import tempfile
import unittest
from collections import Counter
from pathlib import Path

from src.cloud_twin.cloud_agent import CloudAgent
from src.cloud_twin.data_store import DataStore
from src.communication.in_memory_mqtt import InMemoryBroker, InMemoryMQTTClient
from src.scenario_library.playback_service import ScenarioPlaybackService
from src.scenario_library.repository import ScenarioRepository
from src.scenario_library.seed_data import seed_scenario_library


class CountingPublisher:
    def __init__(self, client: InMemoryMQTTClient):
        self.client = client
        self.topic_counts = Counter()

    @property
    def connected(self):
        return self.client.connected

    def publish(self, topic: str, payload: dict):
        self.topic_counts[topic.rsplit("/", 1)[-1]] += 1
        self.client.publish(topic, payload)


def _count_original_image_fields(value) -> int:
    if isinstance(value, dict):
        image_keys = {"image", "image_path", "raw_image", "frame_image"}
        return sum(key in image_keys for key in value) + sum(
            _count_original_image_fields(item) for item in value.values()
        )
    if isinstance(value, list):
        return sum(_count_original_image_fields(item) for item in value)
    return 0


async def run_scenario_mqtt_e2e(
    scenario_id: str,
    database_path: str,
    frame_count: int = 30,
) -> dict:
    broker = InMemoryBroker()
    scene_id = "scene_001"
    repository = ScenarioRepository(database_path)
    seed_scenario_library(repository)

    cloud = CloudAgent(database_path=database_path)
    cloud.scene_id = scene_id
    cloud.store = DataStore(database_path)
    cloud.mqtt = InMemoryMQTTClient("e2e-cloud", broker=broker)
    broadcasts = []
    cloud._broadcast = lambda message_type, payload: broadcasts.append((message_type, payload))

    publisher_client = InMemoryMQTTClient("e2e-scenario-publisher", broker=broker)
    publisher = CountingPublisher(publisher_client)
    playback = ScenarioPlaybackService(
        repository=repository,
        publisher=publisher,
        scene_id=scene_id,
    )

    cloud.start()
    publisher_client.connect()
    try:
        result = None
        for index in range(frame_count):
            result = await playback.step_once(scenario_id if index == 0 else None)

        run_id = result["run_id"]
        stored_frames = cloud.store.list_frames(run_id=run_id, limit=frame_count + 1)
        perception_broadcasts = [
            payload for message_type, payload in broadcasts if message_type == "perception"
        ]
        prediction_statuses = {
            payload.get("prediction", {}).get("status")
            for payload in perception_broadcasts
        }
        stored_perception = {
            frame["frame_id"]: frame.get("perception_data") for frame in stored_frames
        }
        broadcast_perception = {
            payload["frame_id"]: payload for payload in perception_broadcasts
        }
        return {
            "scenario_id": scenario_id,
            "run_id": run_id,
            "perception_messages": publisher.topic_counts["perception"],
            "status_messages": publisher.topic_counts["status"],
            "decision_messages": publisher.topic_counts["decision"],
            "stored_frames": len(stored_frames),
            "broadcast_frames": len(perception_broadcasts),
            "broadcast_scenario_ids": {
                payload.get("scenario_id") for payload in perception_broadcasts
            },
            "prediction_statuses": prediction_statuses,
            "original_image_fields": sum(
                _count_original_image_fields(payload) for payload in perception_broadcasts
            ),
            "enriched_perception_matches_storage": stored_perception == broadcast_perception,
        }
    finally:
        publisher_client.disconnect()
        cloud.stop()


class ScenarioE2ETest(unittest.IsolatedAsyncioTestCase):
    async def test_representative_scenarios_use_the_full_inmemory_mqtt_path(self):
        for scenario_id in ("GP-01", "GP-07", "NM-03", "IC-02"):
            with self.subTest(scenario_id=scenario_id), tempfile.TemporaryDirectory() as tmp:
                result = await run_scenario_mqtt_e2e(
                    scenario_id=scenario_id,
                    database_path=str(Path(tmp) / "e2e.db"),
                )

                self.assertEqual(result["perception_messages"], 30)
                self.assertEqual(result["status_messages"], 30)
                self.assertEqual(result["decision_messages"], 30)
                self.assertEqual(result["stored_frames"], 30)
                self.assertEqual(result["broadcast_frames"], 30)
                self.assertEqual(result["broadcast_scenario_ids"], {scenario_id})
                self.assertIn("deferred", result["prediction_statuses"])
                self.assertEqual(result["original_image_fields"], 0)
                self.assertTrue(result["enriched_perception_matches_storage"])


if __name__ == "__main__":
    unittest.main()
