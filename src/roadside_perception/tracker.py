"""Tracking backends used by the roadside detector."""

from __future__ import annotations

from typing import Any, Callable


def _track_id(value: Any) -> int | str:
    try:
        return int(value)
    except (TypeError, ValueError):
        return str(value)


def _confirmed(track: Any) -> bool:
    value = getattr(track, "is_confirmed", False)
    return bool(value() if callable(value) else value)


def _track_value(track: Any, method_name: str, attribute_name: str, default: Any = None) -> Any:
    method = getattr(track, method_name, None)
    if callable(method):
        value = method()
        if value is not None:
            return value
    return getattr(track, attribute_name, default)


class DeepSortTracker:
    """Normalize ``deep-sort-realtime`` tracks for project messages."""

    def __init__(
        self,
        max_age: int = 30,
        n_init: int = 2,
        max_iou_distance: float = 0.7,
        tracker_factory: Callable[..., Any] | None = None,
        tracker_instance: Any | None = None,
    ):
        if tracker_instance is not None and tracker_factory is not None:
            raise ValueError("provide tracker_instance or tracker_factory, not both")

        if tracker_instance is not None:
            self.tracker = tracker_instance
            return

        if tracker_factory is None:
            try:
                from deep_sort_realtime.deepsort_tracker import DeepSort
            except ImportError as exc:
                raise RuntimeError(
                    "deep-sort-realtime is required for the DeepSORT backend"
                ) from exc
            tracker_factory = DeepSort

        self.tracker = tracker_factory(
            max_age=max_age,
            n_init=n_init,
            max_iou_distance=max_iou_distance,
        )

    def update(self, detections: list[dict[str, Any]], frame: Any = None) -> list[dict[str, Any]]:
        if not detections:
            return []

        raw_detections = [
            (
                list(detection.get("bbox", [0, 0, 0, 0])),
                float(detection.get("confidence", 0.0)),
                detection.get("class", "unknown"),
            )
            for detection in detections
        ]
        tracks = self.tracker.update_tracks(raw_detections, frame=frame)
        normalized = []

        for track in tracks:
            if not _confirmed(track):
                continue

            left, top, right, bottom = [float(value) for value in track.to_ltrb()]
            obj_class = _track_value(track, "get_det_class", "det_class", "unknown")
            confidence = _track_value(track, "get_det_conf", "det_conf", 0.0)
            normalized.append(
                {
                    "track_id": _track_id(getattr(track, "track_id", "unknown")),
                    "bbox": [left, top, right - left, bottom - top],
                    "class": obj_class or "unknown",
                    "confidence": round(float(confidence or 0.0), 3),
                }
            )

        return normalized
