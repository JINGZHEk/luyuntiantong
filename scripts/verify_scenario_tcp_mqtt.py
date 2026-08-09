"""Smoke-test one SQLite scenario through a real TCP MQTT broker."""

from __future__ import annotations

import argparse
import asyncio
import importlib.util
import json
import socket
import sys
import tempfile
import time
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.cloud_twin.cloud_agent import CloudAgent  # noqa: E402
from src.communication.mqtt_client import MQTTClient  # noqa: E402
from src.scenario_library.playback_service import ScenarioPlaybackService  # noqa: E402
from src.scenario_library.repository import ScenarioRepository  # noqa: E402
from src.scenario_library.seed_data import seed_scenario_library  # noqa: E402


RAW_IMAGE_KEYS = {"image", "image_path", "raw_image", "frame_image"}


def _pick_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _count_raw_image_fields(value: Any) -> int:
    if isinstance(value, dict):
        return sum(key in RAW_IMAGE_KEYS for key in value) + sum(
            _count_raw_image_fields(item) for item in value.values()
        )
    if isinstance(value, (list, tuple)):
        return sum(_count_raw_image_fields(item) for item in value)
    return 0


async def _wait_for_connections(*clients: MQTTClient, timeout_sec: float = 10.0) -> None:
    deadline = time.monotonic() + timeout_sec
    while time.monotonic() < deadline:
        if all(client.connected for client in clients):
            return
        await asyncio.sleep(0.05)
    raise TimeoutError("one or more MQTT clients did not connect to the TCP broker")


async def _wait_for_broadcasts(
    broadcasts: list[tuple[str, dict[str, Any]]],
    message_type: str,
    expected_count: int,
    timeout_sec: float = 10.0,
) -> None:
    deadline = time.monotonic() + timeout_sec
    while time.monotonic() < deadline:
        count = sum(1 for item_type, _ in broadcasts if item_type == message_type)
        if count >= expected_count:
            return
        await asyncio.sleep(0.05)
    raise TimeoutError(
        f"received fewer than {expected_count} {message_type} messages over TCP MQTT"
    )


def _disconnect_without_waiting_on_socket(client: MQTTClient) -> None:
    """Close the socket before stopping paho's loop thread.

    Some amqtt versions leave the socket readable during shutdown. Calling
    ``loop_stop`` first (the production helper's conservative order) can then
    wait for the broker keepalive timeout, which is undesirable in a smoke
    test.
    """

    try:
        client.client.disconnect()
    finally:
        client.client.loop_stop()
        client._connected = False


async def run_tcp_smoke(
    scenario_id: str,
    frame_count: int,
    fps: float,
    database_path: str,
) -> dict[str, Any]:
    if importlib.util.find_spec("amqtt") is None:
        raise RuntimeError("amqtt is required; install it in the algorithm environment")

    from amqtt.broker import Broker

    port = _pick_free_port()
    broker = Broker(
        {
            "listeners": {
                "default": {"type": "tcp", "bind": f"127.0.0.1:{port}"}
            },
            "sys_interval": 10,
            "auth": {"allow-anonymous": True},
            "topic-check": {"enabled": False},
        }
    )
    await broker.start()

    repository = ScenarioRepository(database_path)
    seed_scenario_library(repository)
    scene_id = "scene_001"
    cloud = CloudAgent(database_path=database_path)
    cloud.scene_id = scene_id
    cloud.mqtt = MQTTClient("scenario-tcp-cloud", broker_host="127.0.0.1", broker_port=port)
    broadcasts: list[tuple[str, dict[str, Any]]] = []
    cloud._broadcast = lambda message_type, payload: broadcasts.append((message_type, payload))

    publisher = MQTTClient(
        f"scenario-tcp-publisher-{scenario_id.lower()}",
        broker_host="127.0.0.1",
        broker_port=port,
    )
    playback = ScenarioPlaybackService(
        repository=repository,
        publisher=publisher,
        scene_id=scene_id,
    )

    try:
        cloud.start()
        publisher.connect()
        await _wait_for_connections(cloud.mqtt, publisher)

        result: dict[str, Any] | None = await playback.step_once(scenario_id)
        playback._fps = float(fps)
        for _ in range(1, frame_count):
            result = await playback.step_once()
            await asyncio.sleep(0.05)
        if result is None:
            raise RuntimeError("scenario playback did not publish a frame")

        await _wait_for_broadcasts(broadcasts, "perception", frame_count)
        await _wait_for_broadcasts(broadcasts, "vehicle_status", frame_count)
        await _wait_for_broadcasts(broadcasts, "decision", frame_count)

        perception_messages = [
            payload for message_type, payload in broadcasts if message_type == "perception"
        ]
        status_messages = [
            payload for message_type, payload in broadcasts if message_type == "vehicle_status"
        ]
        decision_messages = [
            payload for message_type, payload in broadcasts if message_type == "decision"
        ]
        run_id = result["run_id"]
        stored_frames = cloud.store.list_frames(run_id=run_id, limit=frame_count + 1)
        report = {
            "broker": "amqtt",
            "broker_transport": "tcp",
            "broker_port": port,
            "scenario_id": scenario_id,
            "run_id": run_id,
            "published_frames": frame_count,
            "received_perception": len(perception_messages),
            "received_vehicle_status": len(status_messages),
            "received_decision": len(decision_messages),
            "stored_frames": len(stored_frames),
            "scenario_ids": sorted(
                {payload.get("scenario_id") for payload in perception_messages}
            ),
            "prediction_statuses": sorted(
                {
                    payload.get("prediction", {}).get("status")
                    for payload in perception_messages
                }
            ),
            "raw_image_fields": sum(
                _count_raw_image_fields(payload) for payload in perception_messages
            ),
        }
        if (
            report["received_perception"] < frame_count
            or report["received_vehicle_status"] < frame_count
            or report["received_decision"] < frame_count
            or report["stored_frames"] < frame_count
            or report["scenario_ids"] != [scenario_id]
            or report["raw_image_fields"] != 0
        ):
            raise RuntimeError(f"TCP scenario smoke assertions failed: {report}")
        return report
    finally:
        await playback.stop()
        _disconnect_without_waiting_on_socket(publisher)
        _disconnect_without_waiting_on_socket(cloud.mqtt)
        await broker.shutdown()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenario-id", default="GP-01")
    parser.add_argument("--frames", type=int, default=8)
    parser.add_argument("--fps", type=float, default=10.0)
    parser.add_argument("--database", default=None)
    args = parser.parse_args()
    if args.frames < 1 or args.fps <= 0:
        parser.error("--frames must be >= 1 and --fps must be > 0")

    temporary_directory: tempfile.TemporaryDirectory[str] | None = None
    if args.database:
        database_path = args.database
    else:
        temporary_directory = tempfile.TemporaryDirectory(prefix="scenario_tcp_smoke_")
        database_path = str(Path(temporary_directory.name) / "scenario.db")
    try:
        report = asyncio.run(
            run_tcp_smoke(
                scenario_id=args.scenario_id,
                frame_count=args.frames,
                fps=args.fps,
                database_path=database_path,
            )
        )
        print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
        return 0
    finally:
        if temporary_directory is not None:
            temporary_directory.cleanup()


if __name__ == "__main__":
    raise SystemExit(main())
