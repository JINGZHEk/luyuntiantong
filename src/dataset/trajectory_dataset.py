from __future__ import annotations

import json
import math
import sqlite3
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable, Iterator, Sequence


@dataclass(frozen=True)
class TrajectoryPoint:
    track_id: int | str
    class_name: str
    x: float
    y: float
    vx: float
    vy: float
    timestamp: int
    confidence: float

    def to_dict(self) -> dict[str, Any]:
        row = asdict(self)
        row["class"] = row.pop("class_name")
        return row


class TrajectoryDataset(Sequence[list[TrajectoryPoint]]):
    """Clean, uniformly sampled trajectory segments from JSON or SQLite."""

    def __init__(
        self,
        points: Iterable[TrajectoryPoint | dict[str, Any]],
        *,
        confidence_threshold: float = 0.3,
        coordinate_bound: float = 200.0,
        sample_hz: float = 10.0,
        max_interpolation_gap: int = 3,
    ) -> None:
        if sample_hz <= 0:
            raise ValueError("sample_hz must be positive")
        if max_interpolation_gap < 0:
            raise ValueError("max_interpolation_gap must be non-negative")
        self.confidence_threshold = float(confidence_threshold)
        self.coordinate_bound = float(coordinate_bound)
        self.sample_hz = float(sample_hz)
        self.interval_ms = int(round(1000.0 / sample_hz))
        self.max_interpolation_gap = int(max_interpolation_gap)
        normalized: list[TrajectoryPoint] = []
        for point in points:
            try:
                normalized.append(self._coerce_point(point))
            except (KeyError, TypeError, ValueError, OverflowError):
                # A malformed input row must not invalidate the remaining tracks.
                continue
        self._segments = self._clean(normalized)

    def __len__(self) -> int:
        return len(self._segments)

    def __getitem__(self, index: int | slice):
        return self._segments[index]

    def __iter__(self) -> Iterator[list[TrajectoryPoint]]:
        return iter(self._segments)

    @property
    def points(self) -> list[TrajectoryPoint]:
        return [point for segment in self._segments for point in segment]

    def to_dicts(self) -> list[list[dict[str, Any]]]:
        return [[point.to_dict() for point in segment] for segment in self._segments]

    def to_supervised_samples(
        self,
        input_steps: int = 20,
        future_steps: int = 20,
        stride: int = 1,
    ) -> list[dict[str, Any]]:
        if input_steps <= 0 or future_steps <= 0 or stride <= 0:
            raise ValueError("input_steps, future_steps, and stride must be positive")
        window = input_steps + future_steps
        samples: list[dict[str, Any]] = []
        for segment_index, segment in enumerate(self._segments):
            for start in range(0, len(segment) - window + 1, stride):
                observed = segment[start:start + input_steps]
                future = segment[start + input_steps:start + window]
                samples.append(
                    {
                        "sample_id": f"{segment_index}_{observed[-1].track_id}_{observed[-1].timestamp}",
                        "track_id": observed[-1].track_id,
                        "class": observed[-1].class_name,
                        "input_seq": [point.to_dict() for point in observed],
                        "gt_seq": [point.to_dict() for point in future],
                    }
                )
        return samples

    @classmethod
    def from_json(cls, path: str | Path, **kwargs: Any) -> "TrajectoryDataset":
        source = Path(path)
        if source.suffix.lower() == ".jsonl":
            payload: Any = [
                json.loads(line)
                for line in source.read_text(encoding="utf-8").splitlines()
                if line.strip()
            ]
        else:
            payload = json.loads(source.read_text(encoding="utf-8"))
        return cls(cls._points_from_json_payload(payload), **kwargs)

    @classmethod
    def from_sqlite(
        cls,
        path: str | Path,
        *,
        scenario_id: str | None = None,
        **kwargs: Any,
    ) -> "TrajectoryDataset":
        connection = sqlite3.connect(str(path))
        connection.row_factory = sqlite3.Row
        try:
            tables = {
                row[0]
                for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")
            }
            if "scenario_keyframes" in tables and "scenario_actors" in tables:
                points = cls._points_from_scenario_tables(
                    connection,
                    scenario_id,
                    sample_hz=float(kwargs.get("sample_hz", 10.0)),
                )
            elif "frames" in tables:
                points = cls._points_from_frames_table(connection)
            else:
                raise ValueError("SQLite database has no supported trajectory tables")
        finally:
            connection.close()
        return cls(points, **kwargs)

    @staticmethod
    def _points_from_json_payload(payload: Any) -> list[dict[str, Any]]:
        if isinstance(payload, list):
            return [row for row in payload if isinstance(row, dict)]
        if not isinstance(payload, dict):
            raise ValueError("JSON trajectory source must be an object or array")
        if isinstance(payload.get("trajectories"), list):
            return [
                row
                for trajectory in payload["trajectories"]
                for row in (trajectory if isinstance(trajectory, list) else [])
                if isinstance(row, dict)
            ]
        frames = payload.get("frames")
        if not isinstance(frames, list):
            return [payload]
        points: list[dict[str, Any]] = []
        for frame in frames:
            if not isinstance(frame, dict):
                continue
            timestamp = frame.get("timestamp", frame.get("frame_id"))
            objects = frame.get("annotations", frame.get("objects", []))
            for obj in objects if isinstance(objects, list) else []:
                if not isinstance(obj, dict):
                    continue
                point = dict(obj)
                point.setdefault("timestamp", timestamp)
                points.append(point)
        return points

    @classmethod
    def _points_from_scenario_tables(
        cls,
        connection: sqlite3.Connection,
        scenario_id: str | None,
        sample_hz: float,
    ) -> list[dict[str, Any]]:
        sql = (
            "SELECT k.scenario_id, a.track_id, a.actor_class, k.t_ms, "
            "k.position_x, k.position_y, k.velocity_x, k.velocity_y, k.confidence "
            "FROM scenario_keyframes k JOIN scenario_actors a "
            "ON a.scenario_id = k.scenario_id AND a.actor_id = k.actor_id"
        )
        params: tuple[Any, ...] = ()
        if scenario_id:
            sql += " WHERE k.scenario_id = ?"
            params = (scenario_id,)
        sql += " ORDER BY k.scenario_id, a.track_id, k.t_ms"
        rows = connection.execute(sql, params).fetchall()
        multiple_scenarios = not scenario_id and len({row["scenario_id"] for row in rows}) > 1
        interval_ms = int(round(1000.0 / sample_hz))
        grouped: dict[tuple[str, int | str], list[sqlite3.Row]] = {}
        for row in rows:
            grouped.setdefault((row["scenario_id"], row["track_id"]), []).append(row)

        points: list[dict[str, Any]] = []
        for (row_scenario_id, track_id), track_rows in grouped.items():
            output_track_id = f"{row_scenario_id}:{track_id}" if multiple_scenarios else track_id
            if len(track_rows) == 1:
                timestamps = [int(track_rows[0]["t_ms"])]
            else:
                timestamps = list(
                    range(
                        int(track_rows[0]["t_ms"]),
                        int(track_rows[-1]["t_ms"]) + 1,
                        interval_ms,
                    )
                )
            right = 1
            for timestamp in timestamps:
                while right < len(track_rows) and int(track_rows[right]["t_ms"]) < timestamp:
                    right += 1
                if right >= len(track_rows):
                    left_row = right_row = track_rows[-1]
                elif timestamp <= int(track_rows[0]["t_ms"]):
                    left_row = right_row = track_rows[0]
                else:
                    left_row, right_row = track_rows[right - 1], track_rows[right]
                duration = int(right_row["t_ms"]) - int(left_row["t_ms"])
                ratio = 0.0 if duration == 0 else (timestamp - int(left_row["t_ms"])) / duration
                points.append(
                    {
                        "track_id": output_track_id,
                        "class": left_row["actor_class"] if ratio < 0.5 else right_row["actor_class"],
                        "x": cls._lerp(float(left_row["position_x"]), float(right_row["position_x"]), ratio),
                        "y": cls._lerp(float(left_row["position_y"]), float(right_row["position_y"]), ratio),
                        "vx": cls._lerp(float(left_row["velocity_x"]), float(right_row["velocity_x"]), ratio),
                        "vy": cls._lerp(float(left_row["velocity_y"]), float(right_row["velocity_y"]), ratio),
                        "timestamp": timestamp,
                        "confidence": cls._lerp(float(left_row["confidence"]), float(right_row["confidence"]), ratio),
                    }
                )
        return points

    @staticmethod
    def _points_from_frames_table(connection: sqlite3.Connection) -> list[dict[str, Any]]:
        rows = connection.execute(
            "SELECT timestamp, perception_data FROM frames "
            "WHERE perception_data IS NOT NULL ORDER BY timestamp"
        ).fetchall()
        points: list[dict[str, Any]] = []
        for row in rows:
            try:
                payload = json.loads(row["perception_data"])
            except (TypeError, json.JSONDecodeError):
                continue
            for obj in payload.get("objects", []):
                point = dict(obj)
                point["timestamp"] = payload.get("timestamp", row["timestamp"])
                points.append(point)
        return points

    @staticmethod
    def _coerce_point(value: TrajectoryPoint | dict[str, Any]) -> TrajectoryPoint:
        if isinstance(value, TrajectoryPoint):
            return value
        if not isinstance(value, dict):
            raise TypeError("trajectory point must be a mapping")
        position = value.get("world_pos", value.get("position"))
        velocity = value.get("velocity")
        x = value.get("x", position[0] if isinstance(position, (list, tuple)) and len(position) >= 2 else None)
        y = value.get("y", position[1] if isinstance(position, (list, tuple)) and len(position) >= 2 else None)
        vx = value.get("vx", velocity[0] if isinstance(velocity, (list, tuple)) and len(velocity) >= 2 else math.nan)
        vy = value.get("vy", velocity[1] if isinstance(velocity, (list, tuple)) and len(velocity) >= 2 else math.nan)
        return TrajectoryPoint(
            track_id=value["track_id"],
            class_name=str(value.get("class", value.get("class_name", "unknown"))),
            x=float(x),
            y=float(y),
            vx=float(vx),
            vy=float(vy),
            timestamp=int(round(float(value["timestamp"]))),
            confidence=float(value.get("confidence", 1.0)),
        )

    def _clean(self, points: list[TrajectoryPoint]) -> list[list[TrajectoryPoint]]:
        deduplicated: dict[tuple[int | str, int], TrajectoryPoint] = {}
        for point in points:
            if not self._valid(point):
                continue
            key = (point.track_id, point.timestamp)
            current = deduplicated.get(key)
            if current is None or point.confidence > current.confidence:
                deduplicated[key] = point
        grouped: dict[int | str, list[TrajectoryPoint]] = {}
        for point in deduplicated.values():
            grouped.setdefault(point.track_id, []).append(point)
        segments: list[list[TrajectoryPoint]] = []
        max_delta = self.interval_ms * (self.max_interpolation_gap + 1)
        for track_points in grouped.values():
            track_points.sort(key=lambda point: point.timestamp)
            raw_segments: list[list[TrajectoryPoint]] = [[]]
            for point in track_points:
                if raw_segments[-1] and point.timestamp - raw_segments[-1][-1].timestamp > max_delta:
                    raw_segments.append([])
                raw_segments[-1].append(point)
            for raw_segment in raw_segments:
                sampled = self._resample(raw_segment)
                if sampled:
                    segments.append(sampled)
        segments.sort(key=lambda segment: (str(segment[0].track_id), segment[0].timestamp))
        return segments

    def _valid(self, point: TrajectoryPoint) -> bool:
        return (
            point.confidence >= self.confidence_threshold
            and all(math.isfinite(value) for value in (point.x, point.y, point.confidence))
            and abs(point.x) <= self.coordinate_bound
            and abs(point.y) <= self.coordinate_bound
        )

    def _resample(self, points: list[TrajectoryPoint]) -> list[TrajectoryPoint]:
        if not points:
            return []
        if len(points) == 1:
            point = points[0]
            timestamp = int(round(point.timestamp / self.interval_ms) * self.interval_ms)
            return [self._with_velocity(point, 0.0, 0.0, timestamp)]
        start = int(math.ceil(points[0].timestamp / self.interval_ms) * self.interval_ms)
        end = int(math.floor(points[-1].timestamp / self.interval_ms) * self.interval_ms)
        if start > end:
            return []
        sampled: list[TrajectoryPoint] = []
        right = 1
        for timestamp in range(start, end + 1, self.interval_ms):
            while right < len(points) and points[right].timestamp < timestamp:
                right += 1
            if right >= len(points):
                break
            left_point = points[right - 1]
            right_point = points[right]
            duration = right_point.timestamp - left_point.timestamp
            ratio = 0.0 if duration == 0 else (timestamp - left_point.timestamp) / duration
            fallback_vx = (right_point.x - left_point.x) / max(duration / 1000.0, 1e-9)
            fallback_vy = (right_point.y - left_point.y) / max(duration / 1000.0, 1e-9)
            sampled.append(
                TrajectoryPoint(
                    track_id=left_point.track_id,
                    class_name=left_point.class_name if ratio < 0.5 else right_point.class_name,
                    x=round(self._lerp(left_point.x, right_point.x, ratio), 6),
                    y=round(self._lerp(left_point.y, right_point.y, ratio), 6),
                    vx=round(self._lerp_finite(left_point.vx, right_point.vx, ratio, fallback_vx), 6),
                    vy=round(self._lerp_finite(left_point.vy, right_point.vy, ratio, fallback_vy), 6),
                    timestamp=timestamp,
                    confidence=round(self._lerp(left_point.confidence, right_point.confidence, ratio), 6),
                )
            )
        return sampled

    @staticmethod
    def _with_velocity(point: TrajectoryPoint, vx: float, vy: float, timestamp: int) -> TrajectoryPoint:
        return TrajectoryPoint(
            track_id=point.track_id,
            class_name=point.class_name,
            x=point.x,
            y=point.y,
            vx=point.vx if math.isfinite(point.vx) else vx,
            vy=point.vy if math.isfinite(point.vy) else vy,
            timestamp=timestamp,
            confidence=point.confidence,
        )

    @staticmethod
    def _lerp(left: float, right: float, ratio: float) -> float:
        return left + (right - left) * ratio

    @classmethod
    def _lerp_finite(cls, left: float, right: float, ratio: float, fallback: float) -> float:
        if math.isfinite(left) and math.isfinite(right):
            return cls._lerp(left, right, ratio)
        if math.isfinite(left):
            return left
        if math.isfinite(right):
            return right
        return fallback
