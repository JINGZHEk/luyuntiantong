"""Validate all seeded SQLite scenarios and their compiled realtime frames."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.scenario_library.compiler import ScenarioCompiler  # noqa: E402
from src.scenario_library.repository import ScenarioRepository  # noqa: E402


RAW_IMAGE_KEYS = {"image", "image_path", "raw_image", "frame_image"}


def _count_raw_image_fields(value: Any) -> int:
    if isinstance(value, dict):
        return sum(key in RAW_IMAGE_KEYS for key in value) + sum(
            _count_raw_image_fields(item) for item in value.values()
        )
    if isinstance(value, (list, tuple)):
        return sum(_count_raw_image_fields(item) for item in value)
    return 0


def _assert_finite(value: Any, path: str) -> None:
    if isinstance(value, bool):
        return
    if isinstance(value, (int, float)):
        if not math.isfinite(float(value)):
            raise ValueError(f"{path} is not finite")
        return
    if isinstance(value, dict):
        for key, item in value.items():
            _assert_finite(item, f"{path}.{key}")
        return
    if isinstance(value, (list, tuple)):
        for index, item in enumerate(value):
            _assert_finite(item, f"{path}[{index}]")


def _validate_frame(frame: Any, scenario_id: str) -> None:
    payload = frame.to_dict()
    if _count_raw_image_fields(payload):
        raise ValueError("compiled frame contains raw image fields")

    _assert_finite(payload["perception"], f"{scenario_id}.perception")
    _assert_finite(payload["vehicle_status"], f"{scenario_id}.vehicle_status")

    objects = payload["perception"].get("objects", [])
    track_ids = [item.get("track_id") for item in objects]
    if any(track_id is None for track_id in track_ids):
        raise ValueError("perception object is missing track_id")
    if len(track_ids) != len(set(track_ids)):
        raise ValueError("perception object track_id values are not unique")
    for index, obj in enumerate(objects):
        for field in ("class", "world_pos", "velocity", "occlusion_level"):
            if field not in obj:
                raise ValueError(f"object {index} is missing {field}")


def verify_scenario_library(database: str, frames_per_scenario: int) -> dict[str, Any]:
    repository = ScenarioRepository(database)
    scenarios = repository.list_scenarios()
    compiler = ScenarioCompiler(repository)
    failed_scenarios: list[str] = []
    frames_checked = 0
    raw_image_fields = 0

    for summary in scenarios:
        scenario_id = summary.scenario_id
        try:
            detail = repository.get_scenario(scenario_id)
            if not detail.events:
                raise ValueError("scenario has no event rules")
            if len(detail.actors) < 2:
                raise ValueError("scenario has fewer than two actors")
            if frames_per_scenario == 1:
                sample_times = [0]
            else:
                sample_times = [
                    int(round(summary.duration_ms * index / (frames_per_scenario - 1)))
                    for index in range(frames_per_scenario)
                ]

            previous_timestamp: int | None = None
            active_event_seen = False
            for index, t_ms in enumerate(sample_times):
                timestamp = 1_000_000 + t_ms
                frame = compiler.compile_at(
                    scenario_id=scenario_id,
                    run_id=f"verify-{scenario_id}",
                    t_ms=t_ms,
                    timestamp=timestamp,
                )
                if previous_timestamp is not None and timestamp < previous_timestamp:
                    raise ValueError("compiled timestamps are not monotonic")
                previous_timestamp = timestamp
                active_event_seen = active_event_seen or bool(frame.active_events)
                _validate_frame(frame, scenario_id)
                raw_image_fields += _count_raw_image_fields(frame.to_dict())
                frames_checked += 1
                if index == len(sample_times) - 1 and not frame.active_events:
                    raise ValueError("last sampled frame has no active event")
            if not active_event_seen:
                raise ValueError("sampled frames contain no active event")
        except Exception as exc:  # keep validating the remaining scenarios
            failed_scenarios.append(f"{scenario_id}: {exc}")

    report = {
        "scenario_count": len(scenarios),
        "validated_count": len(scenarios) - len(failed_scenarios),
        "failed_scenarios": failed_scenarios,
        "frames_checked": frames_checked,
        "raw_image_fields": raw_image_fields,
    }
    return report


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Compile and validate the SQLite-backed 16-scenario library"
    )
    parser.add_argument("--database", default="data/scenario_demo.db")
    parser.add_argument("--frames-per-scenario", type=int, default=15)
    args = parser.parse_args()
    if args.frames_per_scenario < 1:
        parser.error("--frames-per-scenario must be at least 1")

    report = verify_scenario_library(args.database, args.frames_per_scenario)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if (
        report["scenario_count"] == 16
        and report["validated_count"] == 16
        and not report["failed_scenarios"]
        and report["raw_image_fields"] == 0
    ) else 1


if __name__ == "__main__":
    raise SystemExit(main())
