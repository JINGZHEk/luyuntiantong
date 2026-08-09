import tempfile
import unittest
from pathlib import Path

from src.communication.in_memory_mqtt import InMemoryBroker, InMemoryMQTTClient
from src.scenario_library.playback_service import ScenarioPlaybackService
from src.scenario_library.repository import ScenarioRepository
from src.scenario_library.seed_data import seed_scenario_library


class ScenarioPlaybackTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addAsyncCleanup(self._cleanup)
        repository = ScenarioRepository(str(Path(self.tmp.name) / "scenario.db"))
        seed_scenario_library(repository)
        self.broker = InMemoryBroker()
        self.publisher = InMemoryMQTTClient("scenario-publisher", broker=self.broker)
        self.subscriber = InMemoryMQTTClient("scenario-subscriber", broker=self.broker)
        self.received = {"perception": [], "status": [], "decision": []}
        self.subscriber.subscribe(
            "v2x/intersection-demo/roadside/+/perception",
            lambda topic, payload: self.received["perception"].append(payload),
        )
        self.subscriber.subscribe(
            "v2x/intersection-demo/vehicle/+/status",
            lambda topic, payload: self.received["status"].append(payload),
        )
        self.subscriber.subscribe(
            "v2x/intersection-demo/vehicle/+/decision",
            lambda topic, payload: self.received["decision"].append(payload),
        )
        self.subscriber.connect()
        self.publisher.connect()
        self.service = ScenarioPlaybackService(repository, self.publisher)

    async def _cleanup(self):
        if self.service.status()["status"] == "running":
            await self.service.stop()
        self.subscriber.disconnect()
        self.publisher.disconnect()
        self.tmp.cleanup()

    async def test_playback_publishes_three_topics(self):
        frame = await self.service.step_once("GP-01")

        self.assertIsNotNone(frame)
        self.assertEqual(len(self.received["perception"]), 1)
        self.assertEqual(len(self.received["status"]), 1)
        self.assertEqual(len(self.received["decision"]), 1)
        self.assertTrue(self.received["perception"][0]["source"]["simulation"])
        self.assertEqual(self.received["perception"][0]["scenario_id"], "GP-01")
        self.assertEqual(self.received["status"][0]["run_id"], frame["run_id"])
        self.assertEqual(self.received["decision"][0]["message_type"], "decision")

    async def test_stop_publishes_clear_frame_and_freezes_index(self):
        await self.service.step_once("GP-01")
        before = self.service.status()["frame_index"]
        await self.service.stop()
        after = self.service.status()
        self.assertEqual(after["status"], "stopped")
        self.assertEqual(after["frame_index"], before)
        self.assertEqual(self.received["perception"][-1]["objects"], [])

    async def test_start_and_stop_update_run_status(self):
        started = await self.service.start("NM-03", fps=20, loop=False, random_seed=7)
        self.assertEqual(started["status"], "running")
        await self.service.stop()
        run = self.service.repository.get_run(started["run_id"])
        self.assertEqual(run["status"], "stopped")
        self.assertGreaterEqual(run["current_frame"], 0)

    async def test_loop_restarts_from_first_frame_after_duration(self):
        await self.service.step_once("GP-01")
        self.service._loop_enabled = True
        self.service._duration_ms = 0
        self.service._frame_index = 0

        await self.service.step_once()

        self.assertEqual(self.service.status()["status"], "running")
        self.assertEqual(self.service.status()["frame_index"], 0)


if __name__ == "__main__":
    unittest.main()
