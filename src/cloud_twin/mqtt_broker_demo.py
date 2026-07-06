from __future__ import annotations

import socket
import time
from pathlib import Path
from typing import Iterable

from src.cloud_twin.demo_engine import generate_demo_frame

LATENCY_TARGET_MS = 100.0


def is_broker_available(host: str = "127.0.0.1", port: int = 1883, timeout_sec: float = 1.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout_sec):
            return True
    except OSError:
        return False


def wait_for_mqtt_clients(clients: Iterable[object], timeout_sec: float = 5.0) -> bool:
    deadline = time.time() + timeout_sec
    client_list = list(clients)
    while time.time() < deadline:
        if all(client.connected for client in client_list):
            return True
        time.sleep(0.05)
    return all(client.connected for client in client_list)


def validate_broker_demo_result(
    result: dict,
    min_complete_frames: int = 20,
    require_fallback: bool = False,
) -> None:
    if not result.get("broker_available"):
        raise RuntimeError("MQTT Broker is not available")
    if result.get("complete_frames", 0) < min_complete_frames:
        raise RuntimeError(
            f"Expected at least {min_complete_frames} complete merged frames, "
            f"got {result.get('complete_frames', 0)}"
        )
    if result.get("event_count", 0) <= 0:
        raise RuntimeError("No ghost-probe events were produced")
    if require_fallback and not result.get("fallback_verified"):
        raise RuntimeError("Fallback degraded/recovering transition was not verified")
    if result.get("latency_target_passed") is False:
        raise RuntimeError(
            f"latency target failed: max={result.get('max_e2e_latency_ms')}ms "
            f"target={result.get('latency_target_ms', LATENCY_TARGET_MS)}ms"
        )


def _remove_sqlite_files(db_path: str) -> None:
    db_file = Path(db_path)
    for candidate in (db_file, Path(f"{db_path}-wal"), Path(f"{db_path}-shm"), Path(f"{db_path}-journal")):
        if candidate.exists():
            candidate.unlink()


def _count_complete_frames(store: DataStore, frame_count: int) -> int:
    complete = 0
    for frame_id in range(frame_count):
        frame = store.get_frame(frame_id)
        if (
            frame
            and frame.get("perception_data")
            and frame.get("vehicle_status")
            and frame.get("decision_data")
        ):
            complete += 1
    return complete


def summarize_e2e_latency(
    store: DataStore,
    frame_count: int,
    target_ms: float = LATENCY_TARGET_MS,
) -> dict:
    latencies: list[float] = []
    for frame_id in range(frame_count):
        frame = store.get_frame(frame_id)
        if not frame:
            continue
        perception = frame.get("perception_data") or {}
        decision = frame.get("decision_data") or {}
        perception_ts = perception.get("timestamp")
        decision_ts = decision.get("timestamp")
        if isinstance(perception_ts, (int, float)) and isinstance(decision_ts, (int, float)):
            latency = float(decision_ts) - float(perception_ts)
            if latency >= 0:
                latencies.append(latency)

    avg_latency = round(sum(latencies) / len(latencies), 2) if latencies else 0.0
    max_latency = round(max(latencies), 2) if latencies else 0.0
    return {
        "avg_e2e_latency_ms": avg_latency,
        "max_e2e_latency_ms": max_latency,
        "e2e_latency_sample_count": len(latencies),
        "latency_target_ms": float(target_ms),
        "latency_target_passed": bool(latencies) and max_latency <= target_ms,
    }


def summarize_brake_decisions(store: DataStore, frame_count: int) -> dict:
    brake_values: list[float] = []
    for frame_id in range(frame_count):
        frame = store.get_frame(frame_id)
        if not frame:
            continue
        decision = frame.get("decision_data") or {}
        brake_decel = decision.get("brake_decel")
        if isinstance(brake_decel, (int, float)) and brake_decel > 0:
            brake_values.append(float(brake_decel))

    max_brake = round(max(brake_values), 2) if brake_values else 0.0
    return {
        "brake_frame_count": len(brake_values),
        "max_brake_decel": max_brake,
        "brake_decision_passed": len(brake_values) > 0 and max_brake > 0,
    }


def build_scenario_perception_frame(
    frame_index: int,
    timestamp: int,
    scene_id: str = "scene_001",
    scenario: str = "heavy",
) -> dict:
    demo_frame = generate_demo_frame(
        frame_index=frame_index,
        timestamp=timestamp,
        scene_id=scene_id,
        scenario=scenario,
    )
    for obj in demo_frame["perception"]["objects"]:
        if obj.get("class") == "car":
            obj["world_pos"] = [15.0, 4.0]
            obj["predicted_traj"] = [[15.0, 4.0] for _ in obj.get("predicted_traj", range(10))]
    return {
        "frame_id": demo_frame["frame_id"],
        "timestamp": demo_frame["timestamp"],
        "perception": demo_frame["perception"],
    }


def apply_scenario_vehicle_profile(vehicle: object, scenario: str | None) -> None:
    speed_by_scenario = {
        "light": 8.0,
        "moderate": 10.0,
        "heavy": 12.0,
    }
    speed = speed_by_scenario.get(scenario or "")
    if speed is None:
        return

    vehicle.velocity[0] = -speed
    vehicle.velocity[1] = 0.0
    vehicle.speed = speed


def run_real_mqtt_three_agent_demo(
    broker_host: str = "127.0.0.1",
    broker_port: int = 1883,
    db_path: str = "data/v2x_mqtt_broker_demo.db",
    frame_count: int = 80,
    fps: float = 10.0,
    scenario: str | None = "heavy",
    verify_fallback: bool = False,
    reset_db: bool = True,
) -> dict:
    """Run Roadside -> MQTT -> Vehicle -> MQTT -> Cloud against a real broker."""
    if not is_broker_available(broker_host, broker_port):
        return {
            "broker_available": False,
            "broker": f"{broker_host}:{broker_port}",
            "complete_frames": 0,
            "event_count": 0,
        }

    from src.cloud_twin.cloud_agent import CloudAgent
    from src.cloud_twin.data_store import DataStore
    from src.communication.mqtt_client import MQTTClient
    from src.roadside_perception.replay_engine import ReplayEngine
    from src.roadside_perception.roadside_agent import RoadsideAgent
    from src.vehicle_decision.vehicle_agent import VehicleAgent

    if reset_db:
        _remove_sqlite_files(db_path)

    run_id = int(time.time() * 1000)
    cloud = CloudAgent(config_path=None)
    cloud.mqtt = MQTTClient(f"verify_cloud_{run_id}", broker_host=broker_host, broker_port=broker_port)
    cloud.store = DataStore(db_path)

    vehicle = VehicleAgent(config_path=None)
    vehicle.mqtt = MQTTClient(f"verify_vehicle_{run_id}", broker_host=broker_host, broker_port=broker_port)
    apply_scenario_vehicle_profile(vehicle, scenario)

    roadside = RoadsideAgent(config_path=None)
    roadside.mqtt = MQTTClient(f"verify_roadside_{run_id}", broker_host=broker_host, broker_port=broker_port)

    started = []
    try:
        cloud.start()
        started.append(cloud)
        vehicle.start()
        started.append(vehicle)
        roadside.start()
        started.append(roadside)

        if not wait_for_mqtt_clients([cloud.mqtt, vehicle.mqtt, roadside.mqtt], timeout_sec=8.0):
            return {
                "broker_available": True,
                "broker": f"{broker_host}:{broker_port}",
                "complete_frames": 0,
                "event_count": 0,
                "connected": False,
            }

        if scenario:
            base_timestamp = int(time.time() * 1000)
            frame_interval_ms = int(1000 / max(fps, 1.0))
            frames = [
                build_scenario_perception_frame(
                    frame_index=frame_index,
                    timestamp=base_timestamp + frame_index * frame_interval_ms,
                    scene_id=cloud.scene_id,
                    scenario=scenario,
                )
                for frame_index in range(frame_count)
            ]
        else:
            replay = ReplayEngine(fps=fps)
            frames = replay.load_clip()[:frame_count]
        for frame_index, frame in enumerate(frames):
            frame["frame_id"] = frame_index
            roadside.process_frame(frame)
            vehicle.tick()
            time.sleep(max(0.01, 1.0 / max(fps, 1.0)))

        fallback_modes = []
        if verify_fallback:
            fallback_modes.append(vehicle.fallback.mode)
            for _ in range(4):
                time.sleep(0.25)
                vehicle.tick()
            fallback_modes.append(vehicle.fallback.mode)

            if frames:
                if scenario:
                    recovery_frame = build_scenario_perception_frame(
                        frame_index=frame_count,
                        timestamp=int(time.time() * 1000),
                        scene_id=cloud.scene_id,
                        scenario=scenario,
                    )
                else:
                    recovery_frame = dict(frames[-1])
                    recovery_frame["frame_id"] = frame_count
                roadside.process_frame(recovery_frame)
                time.sleep(0.3)
                fallback_modes.append(vehicle.fallback.mode)

        time.sleep(1.0)
        event_count, events = cloud.store.get_events(scene_id=cloud.scene_id)
        result = {
            "broker_available": True,
            "broker": f"{broker_host}:{broker_port}",
            "connected": True,
            "frame_count": len(frames),
            "complete_frames": _count_complete_frames(cloud.store, len(frames)),
            "event_count": event_count,
            "events": events,
            "db_path": cloud.store.db_path,
            **summarize_e2e_latency(cloud.store, len(frames)),
            **summarize_brake_decisions(cloud.store, len(frames)),
        }
        if verify_fallback:
            result["fallback_modes"] = fallback_modes
            result["fallback_verified"] = fallback_modes[:3] == ["cooperative", "degraded", "recovering"]
        return result
    finally:
        for agent in reversed(started):
            agent.stop()
