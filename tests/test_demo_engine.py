import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from src.cloud_twin.data_store import DataStore
from src.cloud_twin.demo_engine import DemoEngine, generate_demo_frame
from src.cloud_twin.cloud_agent import CloudAgent, apply_api_overrides
from src.cloud_twin.in_memory_demo import run_in_memory_three_agent_demo
from src.cloud_twin.runtime_config import RuntimeConfigStore
from src.cloud_twin import api as api_module
from src.communication.protocol import DecisionMessage, VehicleStatus
from src.communication.in_memory_mqtt import InMemoryBroker, InMemoryMQTTClient


class DemoFrameGenerationTest(unittest.TestCase):
    def test_generates_canonical_payloads(self):
        frame = generate_demo_frame(frame_index=12, timestamp=123456, scene_id="scene_001")

        self.assertEqual(frame["frame_id"], 12)
        self.assertEqual(frame["timestamp"], 123456)
        self.assertEqual(frame["scene_id"], "scene_001")
        self.assertIn("perception", frame)
        self.assertIn("vehicle_status", frame)
        self.assertIn("decision", frame)

        perception = frame["perception"]
        self.assertEqual(perception["frame_id"], 12)
        self.assertGreaterEqual(len(perception["objects"]), 1)
        self.assertIn("predicted_traj", perception["objects"][0])

        decision = frame["decision"]
        self.assertIn(decision["risk_level"], ["SAFE", "WARNING", "DANGER", "EMERGENCY"])
        self.assertIn("ttc", decision)
        self.assertIn("brake_decel", decision)

    def test_generates_event_during_high_risk_window(self):
        frame = generate_demo_frame(frame_index=54, timestamp=123456, scene_id="scene_001")

        self.assertIsNotNone(frame["event"])
        self.assertEqual(frame["event"]["event_type"], "ghost_probe")
        self.assertIn(frame["event"]["severity"], ["high", "critical"])
        self.assertLessEqual(frame["event"]["min_ttc"], 2.0)

    def test_demo_scenarios_change_risk_profile(self):
        light = generate_demo_frame(
            frame_index=42,
            timestamp=123456,
            scene_id="scene_001",
            scenario="light",
        )
        heavy = generate_demo_frame(
            frame_index=42,
            timestamp=123456,
            scene_id="scene_001",
            scenario="heavy",
        )

        self.assertLess(heavy["decision"]["ttc"], light["decision"]["ttc"])
        self.assertGreaterEqual(
            heavy["decision"]["brake_decel"],
            light["decision"]["brake_decel"],
        )
        self.assertEqual(light["scenario"], "light")
        self.assertEqual(heavy["scenario"], "heavy")

    def test_decision_message_includes_frame_id_when_available(self):
        msg = DecisionMessage(
            timestamp=123456,
            frame_id=7,
            vehicle_id="vehicle_001",
            risk_level="DANGER",
            ttc=1.2,
            collision_prob=0.7,
            brake_decel=5.0,
        )

        self.assertEqual(msg.to_dict()["frame_id"], 7)

    def test_vehicle_status_includes_frame_id_when_available(self):
        msg = VehicleStatus(
            timestamp=123456,
            frame_id=7,
            vehicle_id="vehicle_001",
            position=[1.0, 0.0],
            velocity=[-6.0, 0.0],
            heading=180.0,
            speed=6.0,
        )

        self.assertEqual(msg.to_dict()["frame_id"], 7)


class DataStoreEventTest(unittest.TestCase):
    def test_store_event_persists_and_reads_event(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = DataStore(str(Path(tmp) / "demo.db"))
            event = {
                "event_id": "evt_test_001",
                "timestamp": 123456,
                "event_type": "ghost_probe",
                "severity": "critical",
                "scene_id": "scene_001",
                "min_ttc": 1.2,
                "outcome": "avoided",
                "description": "test event",
                "involved_objects": [{"type": "pedestrian", "track_id": 1}],
                "replay_start_frame": 40,
                "replay_end_frame": 60,
            }

            store.store_event(event)
            total, events = store.get_events(scene_id="scene_001", severity="critical")

        self.assertEqual(total, 1)
        self.assertEqual(events[0]["event_id"], "evt_test_001")
        self.assertEqual(json.loads(events[0]["involved_objects"])[0]["track_id"], 1)

    def test_get_event_replay_returns_matching_frames(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = DataStore(str(Path(tmp) / "demo.db"))
            for frame_id in range(40, 43):
                store.store_frame(
                    frame_id=frame_id,
                    timestamp=1000 + frame_id,
                    scene_id="scene_001",
                    node_id="roadside_001",
                    perception={"frame_id": frame_id, "objects": []},
                    decision={"frame_id": frame_id, "ttc": 1.2},
                    vehicle_status={"frame_id": frame_id, "speed": 4.5},
                )
            store.store_event(
                {
                    "event_id": "evt_replay_001",
                    "timestamp": 2000,
                    "event_type": "ghost_probe",
                    "severity": "critical",
                    "scene_id": "scene_001",
                    "min_ttc": 1.2,
                    "outcome": "avoided",
                    "description": "replay event",
                    "involved_objects": [],
                    "replay_start_frame": 40,
                    "replay_end_frame": 42,
                }
            )

            replay = store.get_event_replay("evt_replay_001")

        self.assertIsNotNone(replay)
        self.assertEqual(replay["event_id"], "evt_replay_001")
        self.assertEqual(len(replay["replay_frames"]), 3)
        self.assertEqual(replay["replay_frames"][0]["frame_id"], 40)

    def test_store_frame_merges_partial_updates_for_same_frame(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = DataStore(str(Path(tmp) / "demo.db"))
            store.store_frame(
                frame_id=7,
                timestamp=1007,
                scene_id="scene_001",
                node_id="roadside_001",
                perception={"frame_id": 7, "objects": [{"track_id": 1}]},
            )
            store.store_frame(
                frame_id=7,
                timestamp=1008,
                scene_id="scene_001",
                vehicle_status={"frame_id": 7, "speed": 6.5},
            )
            store.store_frame(
                frame_id=7,
                timestamp=1009,
                scene_id="scene_001",
                decision={"frame_id": 7, "risk_level": "DANGER"},
            )

            frame = store.get_frame(7)

        self.assertEqual(frame["node_id"], "roadside_001")
        self.assertEqual(frame["perception_data"]["objects"][0]["track_id"], 1)
        self.assertEqual(frame["vehicle_status"]["speed"], 6.5)
        self.assertEqual(frame["decision_data"]["risk_level"], "DANGER")

    def test_cloud_agent_merges_mqtt_messages_into_one_frame(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = str(Path(tmp) / "cloud.db")
            agent = CloudAgent(config_path=None)
            agent.scene_id = "scene_001"
            agent.store = DataStore(db_path)

            agent._on_perception(
                "v2x/scene_001/roadside/roadside_001/perception",
                {
                    "timestamp": 1000,
                    "frame_id": 9,
                    "node_id": "roadside_001",
                    "objects": [{"track_id": 1}],
                    "processing_time_ms": 30.0,
                },
            )
            agent._on_vehicle_status(
                "v2x/scene_001/vehicle/vehicle_001/status",
                {
                    "timestamp": 1001,
                    "frame_id": 9,
                    "vehicle_id": "vehicle_001",
                    "speed": 7.2,
                    "risk_level": "WARNING",
                },
            )
            agent._on_decision(
                "v2x/scene_001/vehicle/vehicle_001/decision",
                {
                    "timestamp": 1002,
                    "frame_id": 9,
                    "vehicle_id": "vehicle_001",
                    "risk_level": "DANGER",
                    "ttc": 1.4,
                    "collision_prob": 0.7,
                    "brake_decel": 5.0,
                    "target_object": {"track_id": 1, "class": "person"},
                },
            )

            frame = agent.store.get_frame(9)

        agent.stop()
        self.assertEqual(frame["perception_data"]["objects"][0]["track_id"], 1)
        self.assertEqual(frame["vehicle_status"]["speed"], 7.2)
        self.assertEqual(frame["decision_data"]["ttc"], 1.4)

    def test_apply_api_overrides_updates_cloud_config(self):
        config = {"api": {"host": "0.0.0.0", "port": 8000}}

        apply_api_overrides(config, host="127.0.0.1", port=8010)

        self.assertEqual(config["api"]["host"], "127.0.0.1")
        self.assertEqual(config["api"]["port"], 8010)

    def test_in_memory_mqtt_delivers_wildcard_subscriptions(self):
        broker = InMemoryBroker()
        received = []
        subscriber = InMemoryMQTTClient("subscriber", broker=broker)
        publisher = InMemoryMQTTClient("publisher", broker=broker)

        subscriber.connect()
        publisher.connect()
        subscriber.subscribe("v2x/scene_001/roadside/+/perception", lambda topic, payload: received.append((topic, payload)))
        publisher.publish(
            "v2x/scene_001/roadside/roadside_001/perception",
            {"frame_id": 1, "objects": []},
        )

        self.assertEqual(received[0][0], "v2x/scene_001/roadside/roadside_001/perception")
        self.assertEqual(received[0][1]["frame_id"], 1)

    def test_in_memory_three_agent_loop_persists_merged_frames(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = run_in_memory_three_agent_demo(
                db_path=str(Path(tmp) / "cloud.db"),
                frame_count=80,
                scenario="heavy",
            )

        self.assertGreater(result["complete_frames"], 0)
        self.assertGreaterEqual(result["event_count"], 1)
        self.assertEqual(result["events"][0]["event_type"], "ghost_probe")

    def test_in_memory_three_agent_loop_reports_current_run_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = str(Path(tmp) / "cloud.db")
            first = run_in_memory_three_agent_demo(
                db_path=db_path,
                frame_count=80,
                scenario="heavy",
            )
            second = run_in_memory_three_agent_demo(
                db_path=db_path,
                frame_count=80,
                scenario="heavy",
            )

        self.assertGreaterEqual(first["event_count"], 1)
        self.assertEqual(second["event_count"], first["event_count"])

    def test_in_memory_three_agent_loop_verifies_fallback_recovery(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = run_in_memory_three_agent_demo(
                db_path=str(Path(tmp) / "cloud.db"),
                frame_count=20,
                scenario="heavy",
                verify_fallback=True,
            )

        self.assertTrue(result["fallback_verified"])
        self.assertEqual(result["fallback_modes"][:3], ["cooperative", "degraded", "recovering"])

    def test_api_lifespan_reuses_injected_cloud_agent_store(self):
        async def run_test():
            original_store = api_module.store
            original_demo_engine = api_module.demo_engine
            try:
                with tempfile.TemporaryDirectory() as tmp:
                    injected_store = DataStore(str(Path(tmp) / "shared.db"))
                    api_module.store = injected_store
                    api_module.demo_engine = None

                    async with api_module.lifespan(api_module.app):
                        self.assertIs(api_module.store, injected_store)
                        self.assertIs(api_module.demo_engine.store, injected_store)
            finally:
                api_module.store = original_store
                api_module.demo_engine = original_demo_engine

        asyncio.run(run_test())

    def test_get_evaluation_report_uses_persisted_runtime_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = DataStore(str(Path(tmp) / "demo.db"))
            for frame_id, latency_ms in enumerate([20.0, 30.0, 40.0]):
                store.store_frame(
                    frame_id=frame_id,
                    timestamp=1000 + frame_id * 100,
                    scene_id="scene_001",
                    node_id="roadside_001",
                    perception={
                        "frame_id": frame_id,
                        "timestamp": 1000 + frame_id * 100,
                        "processing_time_ms": latency_ms,
                        "objects": [],
                    },
                    decision={
                        "frame_id": frame_id,
                        "timestamp": 1015 + frame_id * 100,
                        "ttc": 1.5,
                        "risk_level": "EMERGENCY" if frame_id == 1 else "DANGER",
                    },
                    vehicle_status={"frame_id": frame_id, "speed": 4.5},
                )
            store.store_event(
                {
                    "event_id": "evt_eval_001",
                    "timestamp": 1200,
                    "event_type": "ghost_probe",
                    "severity": "critical",
                    "scene_id": "scene_001",
                    "min_ttc": 1.2,
                    "outcome": "avoided",
                    "description": "evaluation event",
                    "involved_objects": [],
                    "replay_start_frame": 0,
                    "replay_end_frame": 2,
                }
            )

            report = store.get_evaluation_report(scene_id="scene_001")

        self.assertEqual(report["source"], "demo_runtime")
        self.assertEqual(report["sample_count"], 3)
        self.assertEqual(report["event_count"], 1)
        self.assertAlmostEqual(report["metrics"]["avgLatency"], 30.0)
        self.assertAlmostEqual(report["metrics"]["e2eLatency"], 15.0)
        self.assertAlmostEqual(report["metrics"]["leadTime"], 0.2)
        self.assertAlmostEqual(report["metrics"]["fps"], 10.0)
        self.assertEqual(report["baselines"][0]["model"], "V2X Demo Runtime")
        target_status = {item["key"]: item for item in report["targetStatus"]}
        self.assertEqual(target_status["ade"]["status"], "pass")
        self.assertEqual(target_status["fde"]["status"], "pass")
        self.assertEqual(target_status["occAde"]["status"], "unknown")
        self.assertEqual(target_status["e2eLatency"]["status"], "pass")
        self.assertEqual(target_status["leadTime"]["status"], "fail")

    def test_evaluation_api_lists_and_selects_offline_reports(self):
        original_config_store = getattr(api_module, "config_store", None)
        original_store = api_module.store
        original_demo_engine = api_module.demo_engine
        previous_dir = os.environ.get("V2X_EVALUATION_DIR")
        with tempfile.TemporaryDirectory() as tmp:
            reports_dir = Path(tmp) / "reports"
            reports_dir.mkdir()
            (reports_dir / "evaluation.json").write_text(
                json.dumps(
                    {
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
                ),
                encoding="utf-8",
            )
            (reports_dir / "stgnn_evaluation.json").write_text(
                json.dumps(
                    {
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
                ),
                encoding="utf-8",
            )
            os.environ["V2X_EVALUATION_DIR"] = str(reports_dir)
            api_module.config_store = RuntimeConfigStore(Path(tmp) / "runtime_config.json")
            api_module.store = DataStore(str(Path(tmp) / "demo.db"))
            try:
                with TestClient(api_module.app) as client:
                    list_response = client.get("/api/v1/evaluation/reports?scene_id=dair_mini_001")
                    selected_response = client.get(
                        "/api/v1/evaluation?scene_id=dair_mini_001&report=stgnn_checkpoint"
                    )
            finally:
                if previous_dir is None:
                    os.environ.pop("V2X_EVALUATION_DIR", None)
                else:
                    os.environ["V2X_EVALUATION_DIR"] = previous_dir
                api_module.config_store = original_config_store
                api_module.store = original_store
                api_module.demo_engine = original_demo_engine

        self.assertEqual(list_response.status_code, 200)
        reports = {item["key"]: item for item in list_response.json()["reports"]}
        self.assertTrue(reports["mini_split"]["available"])
        self.assertTrue(reports["stgnn_checkpoint"]["available"])
        self.assertEqual(selected_response.status_code, 200)
        self.assertEqual(selected_response.json()["source"], "stgnn_checkpoint_offline")
        self.assertEqual(selected_response.json()["baselines"][0]["model"], "OccAware-STGNN Checkpoint")


class RuntimeConfigApiTest(unittest.TestCase):
    def test_runtime_config_store_persists_scene_settings(self):
        with tempfile.TemporaryDirectory() as tmp:
            config_path = Path(tmp) / "runtime_config.json"
            store = RuntimeConfigStore(config_path)

            updated = store.update_scene_config(
                "scene_001",
                {
                    "riskThreshold": 0.72,
                    "ttcThreshold": 2.4,
                    "refreshInterval": 1000,
                    "cloudApiBaseUrl": "http://localhost:8010/api/v1",
                },
            )
            reloaded = RuntimeConfigStore(config_path).get_scene_config("scene_001")

        self.assertEqual(updated["riskThreshold"], 0.72)
        self.assertEqual(reloaded["ttcThreshold"], 2.4)
        self.assertEqual(reloaded["refreshInterval"], 1000)
        self.assertEqual(reloaded["cloudApiBaseUrl"], "http://localhost:8010/api/v1")

    def test_config_api_reads_and_updates_scene_settings(self):
        original_config_store = getattr(api_module, "config_store", None)
        original_store = api_module.store
        original_demo_engine = api_module.demo_engine
        with tempfile.TemporaryDirectory() as tmp:
            api_module.config_store = RuntimeConfigStore(Path(tmp) / "runtime_config.json")
            api_module.store = DataStore(str(Path(tmp) / "demo.db"))
            try:
                with TestClient(api_module.app) as client:
                    response = client.put(
                        "/api/v1/config/scene_001",
                        json={
                            "riskThreshold": 0.8,
                            "ttcThreshold": 1.8,
                            "refreshInterval": 5000,
                            "cloudApiBaseUrl": "http://localhost:8001/api/v1",
                        },
                    )
                    self.assertEqual(response.status_code, 200)

                    get_response = client.get("/api/v1/config/scene_001")
                    self.assertEqual(get_response.status_code, 200)
                    payload = get_response.json()
            finally:
                api_module.config_store = original_config_store
                api_module.store = original_store
                api_module.demo_engine = original_demo_engine

        self.assertEqual(payload["scene_id"], "scene_001")
        self.assertEqual(payload["riskThreshold"], 0.8)
        self.assertEqual(payload["ttcThreshold"], 1.8)
        self.assertEqual(payload["refreshInterval"], 5000)
        self.assertEqual(payload["cloudApiBaseUrl"], "http://localhost:8001/api/v1")

    def test_config_api_rejects_invalid_thresholds(self):
        original_config_store = getattr(api_module, "config_store", None)
        original_store = api_module.store
        original_demo_engine = api_module.demo_engine
        with tempfile.TemporaryDirectory() as tmp:
            api_module.config_store = RuntimeConfigStore(Path(tmp) / "runtime_config.json")
            api_module.store = DataStore(str(Path(tmp) / "demo.db"))
            try:
                with TestClient(api_module.app) as client:
                    response = client.put(
                        "/api/v1/config/scene_001",
                        json={"riskThreshold": 1.5},
                    )
            finally:
                api_module.config_store = original_config_store
                api_module.store = original_store
                api_module.demo_engine = original_demo_engine

        self.assertEqual(response.status_code, 400)
        self.assertIn("riskThreshold", response.json()["detail"])


class DemoEngineTest(unittest.TestCase):
    def test_step_once_stores_frame_and_broadcasts_messages(self):
        async def run_test():
            with tempfile.TemporaryDirectory() as tmp:
                store = DataStore(str(Path(tmp) / "demo.db"))
                sent = []

                async def broadcast(msg_type, data):
                    sent.append((msg_type, data))

                engine = DemoEngine(store=store, broadcaster=broadcast, scene_id="scene_001")
                status = await engine.step_once()

                frame = store.get_frame(0)
                self.assertEqual(status["frame_index"], 1)
                self.assertIsNotNone(frame)
                self.assertIsNotNone(frame["perception_data"])
                self.assertIsNotNone(frame["decision_data"])
                self.assertEqual([item[0] for item in sent[:3]], ["perception", "vehicle_status", "decision"])

        asyncio.run(run_test())

    def test_start_and_step_preserve_selected_scenario(self):
        async def run_test():
            with tempfile.TemporaryDirectory() as tmp:
                store = DataStore(str(Path(tmp) / "demo.db"))
                sent = []

                async def broadcast(msg_type, data):
                    sent.append((msg_type, data))

                engine = DemoEngine(store=store, broadcaster=broadcast, scene_id="scene_001")
                status = await engine.start(fps=10, scenario="heavy")
                await engine.stop()
                step_status = await engine.step_once()

                self.assertEqual(status["scenario"], "heavy")
                self.assertEqual(step_status["scenario"], "heavy")
                self.assertEqual(sent[0][1]["scenario"], "heavy")

        asyncio.run(run_test())

    def test_step_once_can_override_scenario(self):
        async def run_test():
            with tempfile.TemporaryDirectory() as tmp:
                store = DataStore(str(Path(tmp) / "demo.db"))
                sent = []

                async def broadcast(msg_type, data):
                    sent.append((msg_type, data))

                engine = DemoEngine(store=store, broadcaster=broadcast, scene_id="scene_001")
                status = await engine.step_once(scenario="light")

                self.assertEqual(status["scenario"], "light")
                self.assertEqual(sent[0][1]["scenario"], "light")

        asyncio.run(run_test())


if __name__ == "__main__":
    unittest.main()
