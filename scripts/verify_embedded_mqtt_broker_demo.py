import argparse
import asyncio
import importlib.util
import json
import socket
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.cloud_twin.mqtt_broker_demo import run_real_mqtt_three_agent_demo, validate_broker_demo_result


def pick_free_port(host: str = "127.0.0.1") -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return int(sock.getsockname()[1])


def build_embedded_broker_config(host: str, port: int) -> dict[str, Any]:
    return {
        "listeners": {
            "default": {
                "type": "tcp",
                "bind": f"{host}:{port}",
            }
        },
        "sys_interval": 10,
        "auth": {"allow-anonymous": True},
        "topic-check": {"enabled": False},
    }


def amqtt_available() -> bool:
    return importlib.util.find_spec("amqtt") is not None


async def _run_with_embedded_broker(args: argparse.Namespace) -> dict[str, Any]:
    if not amqtt_available():
        return {
            "embedded_broker": "amqtt",
            "broker_started": False,
            "dependency_missing": "amqtt",
            "install": "pip install amqtt",
        }

    from amqtt.broker import Broker

    port = pick_free_port(args.host) if args.port == 0 else args.port
    broker = Broker(build_embedded_broker_config(args.host, port))
    await broker.start()
    try:
        result = await asyncio.to_thread(
            run_real_mqtt_three_agent_demo,
            broker_host=args.host,
            broker_port=port,
            db_path=args.db,
            frame_count=args.frames,
            fps=args.fps,
            scenario=None if args.scenario == "replay" else args.scenario,
            verify_fallback=args.verify_fallback,
        )
        result["embedded_broker"] = "amqtt"
        result["embedded_broker_port"] = port
        result["broker_started"] = True
        return result
    finally:
        await broker.shutdown()


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify V2X three-agent flow with an embedded TCP MQTT Broker")
    parser.add_argument("--host", default="127.0.0.1", help="Broker bind/connect host")
    parser.add_argument("--port", type=int, default=0, help="Broker port; 0 picks a free local port")
    parser.add_argument("--frames", type=int, default=80, help="Number of replay frames")
    parser.add_argument("--fps", type=float, default=10.0, help="Replay FPS")
    parser.add_argument(
        "--scenario",
        choices=["light", "moderate", "heavy", "replay"],
        default="heavy",
        help="Demo scenario to publish through the roadside agent; use replay for ReplayEngine clip data",
    )
    parser.add_argument("--db", default="data/v2x_embedded_mqtt_broker_demo.db", help="SQLite output path")
    parser.add_argument("--verify-fallback", action="store_true", help="Verify cooperative -> degraded -> recovering")
    parser.add_argument("--min-complete-frames", type=int, default=20, help="Minimum complete merged frames")
    parser.add_argument("--check-deps", action="store_true", help="Only check whether embedded broker dependency exists")
    args = parser.parse_args()

    if args.check_deps:
        print(json.dumps({"amqtt": {"found": amqtt_available()}}, ensure_ascii=False, indent=2))
        return

    result = asyncio.run(_run_with_embedded_broker(args))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if not result.get("broker_started"):
        raise SystemExit(f"Embedded MQTT broker dependency missing: {result.get('dependency_missing')}")

    try:
        validate_broker_demo_result(
            result,
            min_complete_frames=args.min_complete_frames,
            require_fallback=args.verify_fallback,
        )
    except RuntimeError as exc:
        raise SystemExit(str(exc)) from exc


if __name__ == "__main__":
    main()
