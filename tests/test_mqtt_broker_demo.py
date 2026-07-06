import unittest

from src.utils import get_config_path, load_config
from src.cloud_twin.mqtt_broker_demo import (
    apply_scenario_vehicle_profile,
    build_scenario_perception_frame,
    validate_broker_demo_result,
)


class MqttBrokerDemoValidationTest(unittest.TestCase):
    def test_default_vehicle_motion_approaches_replay_intersection(self):
        config = load_config(get_config_path("vehicle.yaml"))

        self.assertLess(config["ego"]["initial_velocity"][0], 0.0)

    def test_build_scenario_perception_frame_uses_heavy_demo_objects(self):
        frame = build_scenario_perception_frame(
            frame_index=36,
            timestamp=123456,
            scene_id="scene_test",
            scenario="heavy",
        )

        self.assertEqual(frame["frame_id"], 36)
        self.assertEqual(frame["timestamp"], 123456)
        self.assertEqual(frame["perception"]["scenario"], "heavy")
        self.assertEqual(frame["perception"]["node_id"], "roadside_001")
        self.assertGreaterEqual(len(frame["perception"]["objects"]), 2)
        occluder = frame["perception"]["objects"][0]
        self.assertEqual(occluder["class"], "car")
        self.assertGreater(occluder["world_pos"][1], 3.5)
        pedestrian = frame["perception"]["objects"][1]
        self.assertEqual(pedestrian["class"], "person")
        self.assertIn("predicted_traj", pedestrian)

    def test_heavy_scenario_vehicle_profile_uses_high_closing_speed(self):
        class FakeVehicle:
            def __init__(self):
                self.velocity = [-8.0, 0.0]
                self.speed = 8.0

        vehicle = FakeVehicle()

        apply_scenario_vehicle_profile(vehicle, "heavy")

        self.assertEqual(vehicle.velocity, [-12.0, 0.0])
        self.assertEqual(vehicle.speed, 12.0)

    def test_validation_accepts_complete_result_with_fallback(self):
        result = {
            "broker_available": True,
            "complete_frames": 80,
            "event_count": 1,
            "fallback_verified": True,
        }

        validate_broker_demo_result(result, min_complete_frames=20, require_fallback=True)

    def test_validation_rejects_missing_broker(self):
        result = {
            "broker_available": False,
            "complete_frames": 0,
            "event_count": 0,
        }

        with self.assertRaisesRegex(RuntimeError, "MQTT Broker is not available"):
            validate_broker_demo_result(result)

    def test_validation_rejects_incomplete_frame_merge(self):
        result = {
            "broker_available": True,
            "complete_frames": 3,
            "event_count": 1,
        }

        with self.assertRaisesRegex(RuntimeError, "complete merged frames"):
            validate_broker_demo_result(result, min_complete_frames=20)

    def test_validation_rejects_missing_fallback_when_required(self):
        result = {
            "broker_available": True,
            "complete_frames": 80,
            "event_count": 1,
            "fallback_verified": False,
        }

        with self.assertRaisesRegex(RuntimeError, "Fallback"):
            validate_broker_demo_result(result, min_complete_frames=20, require_fallback=True)


if __name__ == "__main__":
    unittest.main()
