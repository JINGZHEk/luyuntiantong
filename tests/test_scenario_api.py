import asyncio
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from src.cloud_twin.cloud_agent import CloudAgent
from src.cloud_twin.data_store import DataStore
from src.cloud_twin.runtime_config import RuntimeConfigStore
from src.cloud_twin import api as api_module
from src.cloud_twin.demo_engine import DemoEngine
from src.scenario_library.repository import ScenarioRepository
from src.scenario_library.seed_data import seed_scenario_library


class ScenarioApiTest(unittest.TestCase):
    def test_list_and_detail_endpoints_expose_seeded_library(self):
        with tempfile.TemporaryDirectory() as tmp:
            original = (api_module.store, api_module.demo_engine, api_module.config_store, api_module.scenario_repository)
            api_module.store = DataStore(str(Path(tmp) / "api.db"))
            api_module.demo_engine = None
            api_module.config_store = RuntimeConfigStore(str(Path(tmp) / "runtime.json"))
            api_module.scenario_repository = None
            try:
                with TestClient(api_module.app) as client:
                    response = client.get("/api/v1/scenarios")
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.json()["total"], 16)
                    detail = client.get("/api/v1/scenarios/GP-08")
                    self.assertEqual(detail.status_code, 200)
                    self.assertEqual(detail.json()["summary"]["scenario_id"], "GP-08")
                    missing = client.get("/api/v1/scenarios/unknown")
                    self.assertEqual(missing.status_code, 404)
            finally:
                api_module.store, api_module.demo_engine, api_module.config_store, api_module.scenario_repository = original

    def test_demo_start_accepts_scenario_id_and_returns_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            original = (api_module.store, api_module.demo_engine, api_module.config_store, api_module.scenario_repository)
            api_module.store = DataStore(str(Path(tmp) / "api.db"))
            api_module.demo_engine = None
            api_module.config_store = RuntimeConfigStore(str(Path(tmp) / "runtime.json"))
            api_module.scenario_repository = None
            try:
                with TestClient(api_module.app) as client:
                    response = client.post("/api/v1/demo/start?scenario_id=GP-08&fps=10&loop=false")
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.json()["scenario_id"], "GP-08")
                    self.assertTrue(response.json()["run_id"])
                    client.post("/api/v1/demo/stop")
            finally:
                api_module.store, api_module.demo_engine, api_module.config_store, api_module.scenario_repository = original

    def test_cloud_event_uses_scenario_event_metadata(self):
        with tempfile.TemporaryDirectory() as tmp:
            agent = CloudAgent(database_path=str(Path(tmp) / "cloud.db"))
            agent._check_event(
                {
                    "timestamp": 1000,
                    "scenario_id": "NM-01",
                    "run_id": "run-001",
                    "risk_level": "DANGER",
                    "ttc": 1.2,
                    "brake_decel": 5.0,
                    "vehicle_id": "mock-vehicle-001",
                    "target_object": {"track_id": 4, "class": "motorcycle"},
                    "scenario_event": {
                        "event_type": "high_speed_occluded_crossing",
                        "severity": "high",
                        "description": "电动车从遮挡处高速穿出",
                        "involved_actor_ids": ["ego", "target-bike", "occluder-van"],
                    },
                }
            )
            total, events = agent.store.get_events(scene_id="scene_001")
            self.assertEqual(total, 1)
            self.assertEqual(events[0]["event_type"], "high_speed_occluded_crossing")
            self.assertEqual(events[0]["scenario_id"], "NM-01")
            self.assertEqual(events[0]["run_id"], "run-001")

    def test_legacy_demo_mode_does_not_use_scenario_playback(self):
        async def run_test():
            with tempfile.TemporaryDirectory() as tmp:
                database_path = str(Path(tmp) / "legacy.db")
                store = DataStore(database_path)
                repository = ScenarioRepository(database_path)
                seed_scenario_library(repository)
                sent = []

                async def broadcast(msg_type, data):
                    sent.append((msg_type, data))

                engine = DemoEngine(
                    store=store,
                    broadcaster=broadcast,
                    scene_id="scene_001",
                    scenario_repository=repository,
                )
                await engine.start(fps=30, scenario="moderate")
                await asyncio.sleep(0.03)
                await engine.stop()
                frame_count = len(store.get_frames_range(0, 9999999999999, "scene_001"))

                self.assertFalse(engine.status()["running"])
                self.assertEqual(engine.status()["scenario"], "moderate")
                self.assertGreater(frame_count, 0)
                self.assertTrue(sent)
                self.assertEqual(sent[0][1]["scenario"], "moderate")

        asyncio.run(run_test())


if __name__ == "__main__":
    unittest.main()
