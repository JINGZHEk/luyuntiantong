import argparse
import contextlib
import json
import sys
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def _check(status: bool, detail: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": "pass" if status else "fail",
        **detail,
    }


def build_m1_acceptance_report(
    result: dict[str, Any],
    min_complete_frames: int,
) -> dict[str, Any]:
    complete_frames = int(result.get("complete_frames", 0))
    event_count = int(result.get("event_count", 0))
    fallback_verified = bool(result.get("fallback_verified"))
    latency_passed = bool(result.get("latency_target_passed"))
    brake_passed = bool(result.get("brake_decision_passed"))
    lead_time_passed = bool(result.get("lead_time_target_passed"))

    checks = {
        "complete_frames": _check(
            complete_frames >= min_complete_frames,
            {
                "actual": complete_frames,
                "target": min_complete_frames,
            },
        ),
        "ghost_probe_event": _check(
            event_count > 0,
            {
                "actual": event_count,
                "target": "> 0",
            },
        ),
        "fallback_recovery": _check(
            fallback_verified,
            {
                "modes": result.get("fallback_modes", []),
                "target": ["cooperative", "degraded", "recovering"],
            },
        ),
        "brake_decision": _check(
            brake_passed,
            {
                "brake_frame_count": result.get("brake_frame_count", 0),
                "max_brake_decel": result.get("max_brake_decel", 0.0),
                "target": "brake_decel > 0",
            },
        ),
        "early_warning_lead_time": _check(
            lead_time_passed,
            {
                "actual_sec": result.get("lead_time_seconds", 0.0),
                "target_sec": result.get("lead_time_target_sec", 0.5),
                "max_sec": result.get("lead_time_max_sec", 3.0),
            },
        ),
        "latency_target": _check(
            latency_passed,
            {
                "max_e2e_latency_ms": result.get("max_e2e_latency_ms"),
                "target_ms": result.get("latency_target_ms"),
                "sample_count": result.get("e2e_latency_sample_count"),
            },
        ),
    }
    ready = all(item["status"] == "pass" for item in checks.values())
    return {
        "stage": "M1",
        "ready": ready,
        "scenario": result.get("scenario"),
        "frame_count": result.get("frame_count"),
        "checks": checks,
        "metrics": {
            "complete_frames": complete_frames,
            "event_count": event_count,
            "avg_e2e_latency_ms": result.get("avg_e2e_latency_ms"),
            "max_e2e_latency_ms": result.get("max_e2e_latency_ms"),
            "e2e_latency_sample_count": result.get("e2e_latency_sample_count"),
            "latency_target_ms": result.get("latency_target_ms"),
            "brake_frame_count": result.get("brake_frame_count", 0),
            "max_brake_decel": result.get("max_brake_decel", 0.0),
            "lead_time_seconds": result.get("lead_time_seconds", 0.0),
            "lead_time_target_sec": result.get("lead_time_target_sec", 0.5),
            "lead_time_max_sec": result.get("lead_time_max_sec", 3.0),
        },
        "db_path": result.get("db_path"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify M1 brokerless three-agent acceptance gates")
    parser.add_argument("--frames", type=int, default=80, help="Number of frames to replay")
    parser.add_argument(
        "--scenario",
        choices=["light", "moderate", "heavy"],
        default="heavy",
        help="Demo scenario intensity",
    )
    parser.add_argument(
        "--db",
        default="data/v2x_m1_acceptance.db",
        help="SQLite path for verification output",
    )
    parser.add_argument("--min-complete-frames", type=int, default=20, help="Minimum merged frames required")
    args = parser.parse_args()

    db_path = Path(args.db)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with contextlib.redirect_stdout(sys.stderr):
        from src.cloud_twin.in_memory_demo import run_in_memory_three_agent_demo

        result = run_in_memory_three_agent_demo(
            db_path=str(db_path),
            frame_count=args.frames,
            scenario=args.scenario,
            verify_fallback=True,
        )
    result["scenario"] = args.scenario

    report = build_m1_acceptance_report(result, min_complete_frames=args.min_complete_frames)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
