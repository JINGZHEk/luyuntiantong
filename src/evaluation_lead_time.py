from typing import Any


RISK_WARNING_LEVELS = {"WARNING", "DANGER", "EMERGENCY"}


def occlusion_lead_time_seconds(
    frames: list[dict[str, Any]],
    occlusion_threshold: int = 1,
) -> float:
    """Time from first roadside-only occluded sighting to target reveal."""
    first_occluded_ts_by_track: dict[int, float] = {}
    lead_times: list[float] = []

    for frame in frames:
        timestamp = frame.get("timestamp")
        if not isinstance(timestamp, (int, float)):
            continue

        for annotation in frame.get("annotations", []):
            if not isinstance(annotation, dict) or "track_id" not in annotation:
                continue

            track_id = int(annotation["track_id"])
            occlusion_level = int(annotation.get("occlusion_level", 0))
            if occlusion_level >= occlusion_threshold:
                first_occluded_ts_by_track.setdefault(track_id, float(timestamp))
                continue

            first_occluded_ts = first_occluded_ts_by_track.pop(track_id, None)
            if first_occluded_ts is not None and float(timestamp) >= first_occluded_ts:
                lead_times.append((float(timestamp) - first_occluded_ts) / 1000.0)

    return round(sum(lead_times) / len(lead_times), 2) if lead_times else 0.0


def runtime_lead_time_seconds(frames: list[dict[str, Any]], events: list[dict[str, Any]]) -> float:
    """Time from first cooperative risk warning frame to first ghost-probe event."""
    first_warning_ts = None
    for frame in frames:
        decision = frame.get("decision_data") or {}
        if decision.get("risk_level") not in RISK_WARNING_LEVELS:
            continue

        timestamp = frame.get("timestamp")
        if isinstance(timestamp, (int, float)):
            first_warning_ts = float(timestamp)
            break

    event_timestamps = [
        float(event["timestamp"])
        for event in events
        if event.get("event_type") == "ghost_probe" and isinstance(event.get("timestamp"), (int, float))
    ]
    if first_warning_ts is None or not event_timestamps:
        return 0.0

    first_event_ts = min(event_timestamps)
    if first_event_ts < first_warning_ts:
        return 0.0
    return round((first_event_ts - first_warning_ts) / 1000.0, 2)
