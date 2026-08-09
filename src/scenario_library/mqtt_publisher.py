"""Run a SQLite scenario over a real MQTT connection without hardware."""

from __future__ import annotations

import argparse
import asyncio
import json
import time
from typing import Any

from src.communication.mqtt_client import MQTTClient

from .playback_service import ScenarioPlaybackService
from .repository import ScenarioRepository
from .seed_data import seed_scenario_library


def _wait_for_connection(client: MQTTClient, timeout_sec: float = 10.0) -> None:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        if client.connected:
            return
        time.sleep(0.05)
    raise TimeoutError(
        f"MQTT publisher did not connect to {client.broker_host}:{client.broker_port}"
    )


async def publish_scenario(
    scenario_id: str,
    database_path: str,
    broker_host: str = "127.0.0.1",
    broker_port: int = 1883,
    scene_id: str = "scene_001",
    fps: float = 10.0,
    loop: bool = False,
    random_seed: int = 42,
) -> dict[str, Any]:
    repository = ScenarioRepository(database_path)
    if not repository.list_scenarios():
        seed_scenario_library(repository)

    publisher = MQTTClient(
        client_id=f"scenario-{scenario_id.lower()}-{int(time.time())}",
        broker_host=broker_host,
        broker_port=broker_port,
    )
    service = ScenarioPlaybackService(
        repository=repository,
        publisher=publisher,
        scene_id=scene_id,
    )
    publisher.connect()
    try:
        _wait_for_connection(publisher)
        started = await service.start(
            scenario_id,
            fps=fps,
            loop=loop,
            random_seed=random_seed,
        )
        while service.status()["status"] == "running":
            await asyncio.sleep(min(0.2, 1.0 / max(fps, 1.0)))
        return started | {"final_status": service.status()["status"]}
    finally:
        await service.stop()
        publisher.disconnect()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenario-id", default="GP-01")
    parser.add_argument("--database-path", default="data/v2x_cloud.db")
    parser.add_argument("--broker-host", default="127.0.0.1")
    parser.add_argument("--broker-port", type=int, default=1883)
    parser.add_argument("--scene-id", default="scene_001")
    parser.add_argument("--fps", type=float, default=10.0)
    parser.add_argument("--loop", action="store_true")
    parser.add_argument("--random-seed", type=int, default=42)
    args = parser.parse_args()

    result = asyncio.run(
        publish_scenario(
            scenario_id=args.scenario_id,
            database_path=args.database_path,
            broker_host=args.broker_host,
            broker_port=args.broker_port,
            scene_id=args.scene_id,
            fps=args.fps,
            loop=args.loop,
            random_seed=args.random_seed,
        )
    )
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
