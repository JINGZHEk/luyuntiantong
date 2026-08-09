import unittest

from src.communication.protocol import (
    CloudEvent,
    DecisionMessage,
    DetectedObject,
    PerceptionMessage,
    VehicleStatus,
)


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
        self.assertIsNone(payload["scenario_id"])
        self.assertIsNone(payload["run_id"])
        self.assertIsNone(payload["scenario"])

    def test_perception_message_emits_scenario_alias_and_run_metadata(self):
        payload = PerceptionMessage(
            timestamp=123456,
            frame_id=7,
            node_id="roadside_001",
            objects=[],
            scenario_id="GP-01",
            run_id="run-001",
        ).to_dict()

        self.assertEqual(payload["scenario_id"], "GP-01")
        self.assertEqual(payload["run_id"], "run-001")
        self.assertEqual(payload["scenario"], "GP-01")


class RuntimeProtocolTest(unittest.TestCase):
    def test_runtime_messages_include_scenario_run_metadata(self):
        source = {"device_type": "scenario_replay", "simulation": True}
        status = VehicleStatus(
            timestamp=1000,
            vehicle_id="vehicle_001",
            position=[10.0, 0.0],
            velocity=[-8.0, 0.0],
            heading=180.0,
            speed=8.0,
            scene_id="intersection-demo",
            scenario_id="GP-01",
            run_id="run-001",
            source=source,
        ).to_dict()
        decision = DecisionMessage(
            timestamp=1000,
            vehicle_id="vehicle_001",
            risk_level="DANGER",
            ttc=1.4,
            collision_prob=0.7,
            brake_decel=5.0,
            scene_id="intersection-demo",
            scenario_id="GP-01",
            run_id="run-001",
            source=source,
            scenario_event={"event_key": "occluded_crossing"},
        ).to_dict()
        event = CloudEvent(
            event_id="evt-001",
            timestamp=1000,
            event_type="occluded_pedestrian_crossing",
            severity="high",
            scene_id="intersection-demo",
            involved_objects=[{"type": "person", "track_id": 1}],
            min_ttc=1.4,
            scenario_id="GP-01",
            run_id="run-001",
            source={"device_type": "cloud_agent"},
        ).to_dict()

        for payload, message_type in (
            (status, "vehicle_status"),
            (decision, "decision"),
            (event, "event"),
        ):
            self.assertEqual(payload["schema_version"], 1)
            self.assertEqual(payload["message_type"], message_type)
            self.assertEqual(payload["scene_id"], "intersection-demo")
            self.assertEqual(payload["scenario_id"], "GP-01")
            self.assertEqual(payload["run_id"], "run-001")

        self.assertEqual(status["source"], source)
        self.assertEqual(decision["scenario_event"], {"event_key": "occluded_crossing"})
        self.assertEqual(event["source"], {"device_type": "cloud_agent"})

    def test_legacy_message_defaults_remain_stable(self):
        status = VehicleStatus(
            timestamp=1000,
            vehicle_id="vehicle_001",
            position=[0.0, 0.0],
            velocity=[0.0, 0.0],
            heading=0.0,
            speed=0.0,
        ).to_dict()
        decision = DecisionMessage(
            timestamp=1000,
            vehicle_id="vehicle_001",
            risk_level="SAFE",
            ttc=8.0,
            collision_prob=0.0,
            brake_decel=0.0,
        ).to_dict()
        event = CloudEvent(
            event_id="evt-legacy",
            timestamp=1000,
            event_type="ghost_probe",
            severity="high",
            scene_id="scene_001",
            involved_objects=[],
            min_ttc=8.0,
        ).to_dict()

        for payload, message_type in (
            (status, "vehicle_status"),
            (decision, "decision"),
            (event, "event"),
        ):
            self.assertEqual(payload["schema_version"], 1)
            self.assertEqual(payload["message_type"], message_type)
            self.assertEqual(payload["scene_id"], "scene_001")
            self.assertIsNone(payload["scenario_id"])
            self.assertIsNone(payload["run_id"])
            self.assertEqual(payload["source"], {})

        self.assertIsNone(decision["scenario_event"])

    def test_detected_object_emits_optional_rendering_metadata(self):
        payload = DetectedObject(
            track_id=1,
            obj_class="person",
            bbox=[350, 150, 40, 100],
            world_pos=[15.0, 4.2],
            velocity=[0.0, -1.2],
            confidence=0.68,
            occlusion_level=3,
            subtype="adult",
            heading=270.0,
            actor_id="person_001",
        ).to_dict()

        self.assertEqual(payload["subtype"], "adult")
        self.assertEqual(payload["heading"], 270.0)
        self.assertEqual(payload["actor_id"], "person_001")

    def test_legacy_detected_object_output_omits_optional_metadata(self):
        payload = DetectedObject(
            1,
            "car",
            [0, 0, 10, 10],
            [1.0, 2.0],
            [0.0, 0.0],
            0.9,
            0,
        ).to_dict()

        self.assertNotIn("subtype", payload)
        self.assertNotIn("heading", payload)
        self.assertNotIn("actor_id", payload)

    def test_legacy_positional_message_arguments_keep_their_meaning(self):
        status = VehicleStatus(
            1000,
            "vehicle_001",
            [10.0, 0.0],
            [-8.0, 0.0],
            180.0,
            8.0,
            7,
            [0.0, 0.0],
            "cooperative",
            "SAFE",
        ).to_dict()
        decision = DecisionMessage(
            1000,
            "vehicle_001",
            "SAFE",
            8.0,
            0.0,
            0.0,
            7,
            None,
            "cooperative",
            1.0,
        ).to_dict()

        self.assertEqual(status["frame_id"], 7)
        self.assertEqual(status["risk_level"], "SAFE")
        self.assertEqual(decision["frame_id"], 7)
        self.assertEqual(decision["fusion_weight"], 1.0)


if __name__ == "__main__":
    unittest.main()
