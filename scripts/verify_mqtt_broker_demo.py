import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.cloud_twin.mqtt_broker_demo import (
    run_real_mqtt_three_agent_demo,
    validate_broker_demo_result,
)


def main():
    parser = argparse.ArgumentParser(description="Verify V2X three-agent flow against a real MQTT Broker")
    parser.add_argument("--host", default="127.0.0.1", help="MQTT Broker host")
    parser.add_argument("--port", type=int, default=1883, help="MQTT Broker port")
    parser.add_argument("--frames", type=int, default=80, help="Number of replay frames")
    parser.add_argument("--fps", type=float, default=10.0, help="Replay FPS")
    parser.add_argument(
        "--scenario",
        choices=["light", "moderate", "heavy", "replay"],
        default="heavy",
        help="Demo scenario to publish through the roadside agent; use replay for ReplayEngine clip data",
    )
    parser.add_argument(
        "--db",
        default="data/v2x_mqtt_broker_demo.db",
        help="SQLite path for verification output",
    )
    parser.add_argument(
        "--verify-fallback",
        action="store_true",
        help="Also verify vehicle cooperative -> degraded -> recovering transition",
    )
    parser.add_argument(
        "--min-complete-frames",
        type=int,
        default=20,
        help="Minimum complete merged frames required for success",
    )
    args = parser.parse_args()

    result = run_real_mqtt_three_agent_demo(
        broker_host=args.host,
        broker_port=args.port,
        db_path=args.db,
        frame_count=args.frames,
        fps=args.fps,
        scenario=None if args.scenario == "replay" else args.scenario,
        verify_fallback=args.verify_fallback,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))

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
