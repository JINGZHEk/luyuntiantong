import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.cloud_twin.in_memory_demo import run_in_memory_three_agent_demo


def main():
    parser = argparse.ArgumentParser(description="Verify brokerless V2X MQTT three-agent flow")
    parser.add_argument("--frames", type=int, default=80, help="Number of frames to replay")
    parser.add_argument(
        "--scenario",
        choices=["light", "moderate", "heavy"],
        default="heavy",
        help="Demo scenario intensity",
    )
    parser.add_argument(
        "--db",
        default="data/v2x_inmemory_mqtt.db",
        help="SQLite path for verification output",
    )
    parser.add_argument(
        "--verify-fallback",
        action="store_true",
        help="Also simulate roadside outage and verify vehicle degraded/recovering transitions",
    )
    args = parser.parse_args()

    db_path = Path(args.db)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    result = run_in_memory_three_agent_demo(
        db_path=str(db_path),
        frame_count=args.frames,
        scenario=args.scenario,
        verify_fallback=args.verify_fallback,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))

    if result["complete_frames"] <= 0:
        raise SystemExit("No complete merged frames were produced")
    if result["event_count"] <= 0:
        raise SystemExit("No ghost-probe events were produced")
    if args.verify_fallback and not result.get("fallback_verified"):
        raise SystemExit("Fallback degraded/recovering transition was not verified")


if __name__ == "__main__":
    main()
