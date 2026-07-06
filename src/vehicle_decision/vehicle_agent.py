"""
Vehicle Agent - Main entry point for vehicle-side decision making.
Subscribes to roadside perception, computes risk, issues brake commands.
"""
import time
import argparse
import numpy as np

from src.utils import load_config, get_config_path, setup_logger
from src.communication import MQTTClient, VehicleStatus, DecisionMessage, make_timestamp
from src.communication.mqtt_config import apply_mqtt_env_overrides
from src.vehicle_decision import RiskAssessor, BrakeController, FallbackManager


class VehicleAgent:
    def __init__(self, config_path: str = None):
        self.config = load_config(config_path or get_config_path("vehicle.yaml"))
        mqtt_config = apply_mqtt_env_overrides(load_config(get_config_path("mqtt.yaml")))
        self.logger = setup_logger("vehicle_agent", log_dir="logs")

        self.vehicle_id = self.config.get("vehicle_id", "vehicle_001")
        self.scene_id = self.config.get("scene_id", "scene_001")

        # MQTT
        self.mqtt = MQTTClient(
            client_id=f"vehicle_{self.vehicle_id}",
            broker_host=mqtt_config["broker"]["host"],
            broker_port=mqtt_config["broker"]["port"],
        )

        # Decision modules
        risk_config = self.config.get("risk", {})
        self.risk_assessor = RiskAssessor(
            ttc_thresholds=risk_config.get("ttc_thresholds", {}),
            lateral_threshold=risk_config.get("lateral_distance_threshold", 3.5),
        )

        self.brake_controller = BrakeController(
            max_deceleration=self.config.get("ego", {}).get("max_deceleration", 8.0)
        )

        fb_config = self.config.get("fallback", {})
        self.fallback = FallbackManager(
            timeout_ms=fb_config.get("timeout_ms", 200),
            max_missed_frames=fb_config.get("max_missed_frames", 3),
            degraded_speed_factor=fb_config.get("degraded_speed_factor", 0.5),
            recovery_sec=fb_config.get("recovery_transition_sec", 3.0),
        )

        # Ego state simulation
        ego_cfg = self.config.get("ego", {})
        self.position = np.array(ego_cfg.get("initial_position", [50.0, 0.0]), dtype=np.float64)
        self.velocity = np.array(ego_cfg.get("initial_velocity", [8.0, 0.0]), dtype=np.float64)
        self.heading = ego_cfg.get("initial_heading", 180.0)
        self.speed = np.linalg.norm(self.velocity)

        self._latest_perception = None
        self._running = False

    def start(self):
        self.mqtt.connect()

        # Subscribe to roadside perception
        topic = f"v2x/{self.scene_id}/roadside/+/perception"
        self.mqtt.subscribe(topic, self._on_perception)

        self._running = True
        self.logger.info(f"Vehicle agent [{self.vehicle_id}] started")

    def _on_perception(self, topic: str, payload: dict):
        """Handle incoming roadside perception messages."""
        self._latest_perception = payload
        self.fallback.on_message_received()
        self._process_decision(payload)

    def _process_decision(self, perception: dict):
        """Run decision pipeline on new perception data."""
        objects = perception.get("objects", [])
        timestamp = perception.get("timestamp", make_timestamp())
        frame_id = perception.get("frame_id", 0)

        # Build predicted trajectory map
        predicted_trajs = {}
        for obj in objects:
            if obj.get("predicted_traj"):
                predicted_trajs[obj["track_id"]] = obj["predicted_traj"]

        # Risk assessment
        risk = self.risk_assessor.assess(
            ego_position=self.position.tolist(),
            ego_velocity=self.velocity.tolist(),
            objects=objects,
            predicted_trajs=predicted_trajs,
        )

        # Brake control
        brake_cmd = self.brake_controller.compute(risk.level, self.speed)

        # Update ego state (simulation)
        self._update_ego_state(brake_cmd.deceleration)

        # Publish vehicle status
        status = VehicleStatus(
            timestamp=timestamp,
            frame_id=frame_id,
            vehicle_id=self.vehicle_id,
            position=self.position.tolist(),
            velocity=self.velocity.tolist(),
            heading=self.heading,
            speed=round(self.speed, 2),
            mode=self.fallback.mode,
            risk_level=risk.level,
        )
        self.mqtt.publish(
            f"v2x/{self.scene_id}/vehicle/{self.vehicle_id}/status",
            status.to_dict()
        )

        # Publish decision
        decision = DecisionMessage(
            timestamp=timestamp,
            frame_id=frame_id,
            vehicle_id=self.vehicle_id,
            risk_level=risk.level,
            ttc=risk.ttc,
            collision_prob=risk.collision_prob,
            brake_decel=brake_cmd.deceleration,
            target_object={
                "track_id": risk.target_track_id,
                "class": risk.target_class,
            } if risk.target_track_id is not None else None,
            mode=self.fallback.mode,
            fusion_weight=self.fallback.fusion_weight,
        )
        self.mqtt.publish(
            f"v2x/{self.scene_id}/vehicle/{self.vehicle_id}/decision",
            decision.to_dict()
        )

    def _update_ego_state(self, deceleration: float):
        """Simple kinematic update for ego vehicle simulation."""
        dt = 0.1  # 10Hz
        direction = self.velocity / max(self.speed, 0.01)

        # Apply deceleration
        if deceleration > 0 and self.speed > 0:
            new_speed = max(0.0, self.speed - deceleration * dt)
            self.velocity = direction * new_speed
        self.speed = np.linalg.norm(self.velocity)

        # Update position
        self.position += self.velocity * dt

    def tick(self):
        """Called each frame to check fallback status."""
        self.fallback.on_frame_tick()

    def stop(self):
        self._running = False
        self.mqtt.disconnect()
        self.logger.info("Vehicle agent stopped")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Vehicle Decision Agent")
    parser.add_argument("--config", default=None, help="Config file path")
    args = parser.parse_args()

    agent = VehicleAgent(config_path=args.config)
    agent.start()
    print(f"Vehicle agent running. Press Ctrl+C to stop.")
    try:
        while True:
            agent.tick()
            time.sleep(0.1)
    except KeyboardInterrupt:
        agent.stop()
