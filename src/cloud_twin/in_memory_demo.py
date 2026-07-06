from pathlib import Path

from src.cloud_twin.cloud_agent import CloudAgent
from src.cloud_twin.data_store import DataStore
from src.cloud_twin.demo_engine import generate_demo_frame
from src.cloud_twin.mqtt_broker_demo import summarize_brake_decisions, summarize_e2e_latency
from src.communication.in_memory_mqtt import InMemoryBroker, InMemoryMQTTClient
from src.vehicle_decision.fallback_manager import FallbackManager


class ManualClock:
    def __init__(self):
        self.value = 1_000_000.0

    def __call__(self) -> float:
        return self.value

    def advance(self, seconds: float):
        self.value += seconds


class InMemoryRoadsideDemo:
    def __init__(self, broker: InMemoryBroker, scene_id: str = "scene_001"):
        self.scene_id = scene_id
        self.mqtt = InMemoryMQTTClient("inmemory_roadside", broker=broker)

    def start(self):
        self.mqtt.connect()

    def stop(self):
        self.mqtt.disconnect()

    def publish_frame(self, frame: dict):
        topic = f"v2x/{self.scene_id}/roadside/roadside_001/perception"
        self.mqtt.publish(topic, frame["perception"])


class InMemoryVehicleDemo:
    def __init__(self, broker: InMemoryBroker, scene_id: str = "scene_001", clock=None):
        self.scene_id = scene_id
        self.mqtt = InMemoryMQTTClient("inmemory_vehicle", broker=broker)
        self.fallback = FallbackManager(
            timeout_ms=200,
            max_missed_frames=3,
            recovery_sec=0.5,
            clock=clock,
        )

    def start(self):
        self.mqtt.connect()
        self.mqtt.subscribe(
            f"v2x/{self.scene_id}/roadside/+/perception",
            self._on_perception,
        )

    def stop(self):
        self.mqtt.disconnect()

    def _on_perception(self, topic: str, perception: dict):
        self.fallback.on_message_received()
        frame = generate_demo_frame(
            frame_index=perception.get("frame_id", 0),
            timestamp=perception.get("timestamp", 0),
            scene_id=self.scene_id,
            scenario=perception.get("scenario", "moderate"),
        )
        frame["vehicle_status"]["mode"] = self.fallback.mode
        frame["decision"]["mode"] = self.fallback.mode
        frame["decision"]["fusion_weight"] = self.fallback.fusion_weight
        self.mqtt.publish(
            f"v2x/{self.scene_id}/vehicle/vehicle_001/status",
            frame["vehicle_status"],
        )
        self.mqtt.publish(
            f"v2x/{self.scene_id}/vehicle/vehicle_001/decision",
            frame["decision"],
        )

    def tick(self):
        self.fallback.on_frame_tick()


def run_in_memory_three_agent_demo(
    db_path: str,
    frame_count: int = 80,
    scene_id: str = "scene_001",
    scenario: str = "heavy",
    reset_db: bool = True,
    verify_fallback: bool = False,
) -> dict:
    """Run a brokerless three-agent MQTT flow and return a verification summary."""
    if reset_db:
        db_file = Path(db_path)
        for candidate in (db_file, Path(f"{db_path}-wal"), Path(f"{db_path}-shm"), Path(f"{db_path}-journal")):
            if candidate.exists():
                candidate.unlink()

    broker = InMemoryBroker()
    clock = ManualClock() if verify_fallback else None
    cloud = CloudAgent(config_path=None)
    cloud.scene_id = scene_id
    cloud.mqtt = InMemoryMQTTClient("inmemory_cloud", broker=broker)
    cloud.store = DataStore(db_path)

    roadside = InMemoryRoadsideDemo(broker=broker, scene_id=scene_id)
    vehicle = InMemoryVehicleDemo(broker=broker, scene_id=scene_id, clock=clock)

    cloud.start()
    vehicle.start()
    roadside.start()
    try:
        fallback_modes = []

        for frame_index in range(frame_count):
            frame = generate_demo_frame(
                frame_index=frame_index,
                timestamp=1_000_000 + frame_index * 100,
                scene_id=scene_id,
                scenario=scenario,
            )
            roadside.publish_frame(frame)
            if clock:
                clock.advance(0.1)

        if verify_fallback and clock:
            fallback_modes.append(vehicle.fallback.mode)
            for _ in range(3):
                clock.advance(0.25)
                vehicle.tick()
            fallback_modes.append(vehicle.fallback.mode)

            recovery_frame = generate_demo_frame(
                frame_index=frame_count,
                timestamp=1_000_000 + frame_count * 100,
                scene_id=scene_id,
                scenario=scenario,
            )
            roadside.publish_frame(recovery_frame)
            fallback_modes.append(vehicle.fallback.mode)

        complete_frames = 0
        for frame_id in range(frame_count):
            frame = cloud.store.get_frame(frame_id)
            if (
                frame
                and frame.get("perception_data")
                and frame.get("vehicle_status")
                and frame.get("decision_data")
            ):
                complete_frames += 1

        event_count, events = cloud.store.get_events(scene_id=scene_id)
        result = {
            "frame_count": frame_count,
            "complete_frames": complete_frames,
            "event_count": event_count,
            "events": events,
            "db_path": cloud.store.db_path,
            **summarize_e2e_latency(cloud.store, frame_count),
            **summarize_brake_decisions(cloud.store, frame_count),
        }
        if verify_fallback:
            result["fallback_modes"] = fallback_modes
            result["fallback_verified"] = fallback_modes[:3] == ["cooperative", "degraded", "recovering"]
        return result
    finally:
        roadside.stop()
        vehicle.stop()
        cloud.stop()
