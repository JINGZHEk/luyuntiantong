"""Map image detections into a 2D road coordinate frame."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any


class CoordinateMapper:
    def __init__(self, homography: list[list[float]], world_bounds: dict[str, list[float]] | None = None):
        self.homography = homography
        self.world_bounds = world_bounds or {}

    @classmethod
    def from_file(cls, path: str | Path) -> "CoordinateMapper":
        calibration_path = Path(path)
        if not calibration_path.exists():
            raise FileNotFoundError(f"calibration file not found: {calibration_path}")
        try:
            data = json.loads(calibration_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ValueError(f"invalid calibration file: {calibration_path}") from exc
        return cls(data.get("homography"), data.get("world_bounds"))

    def _matrix(self) -> list[list[float]]:
        if not isinstance(self.homography, list) or len(self.homography) != 3:
            raise ValueError("homography must be a 3x3 matrix")
        if any(not isinstance(row, list) or len(row) != 3 for row in self.homography):
            raise ValueError("homography must be a 3x3 matrix")
        matrix = [[float(value) for value in row] for row in self.homography]
        if not all(math.isfinite(value) for row in matrix for value in row):
            raise ValueError("homography contains non-finite values")
        return matrix

    def image_point_to_world(self, point: list[float]) -> list[float]:
        if len(point) != 2:
            raise ValueError("image point must contain x and y")
        matrix = self._matrix()
        x, y = float(point[0]), float(point[1])
        projected_x = matrix[0][0] * x + matrix[0][1] * y + matrix[0][2]
        projected_y = matrix[1][0] * x + matrix[1][1] * y + matrix[1][2]
        scale = matrix[2][0] * x + matrix[2][1] * y + matrix[2][2]
        if not math.isfinite(scale) or abs(scale) < 1e-9:
            raise ValueError("homography projection has invalid scale")
        world = [projected_x / scale, projected_y / scale]
        if not all(math.isfinite(value) for value in world):
            raise ValueError("homography projection is non-finite")
        return [round(value, 3) for value in world]

    def image_bbox_to_world(self, bbox: list[float]) -> dict[str, Any]:
        if len(bbox) != 4:
            return {"status": "invalid", "world_pos": None, "reason": "bbox must contain x,y,w,h"}

        try:
            x, y, width, height = [float(value) for value in bbox]
            world = self.image_point_to_world([x + width / 2.0, y + height])
            self._validate_bounds(world)
        except (TypeError, ValueError) as exc:
            return {"status": "invalid", "world_pos": None, "reason": str(exc)}
        return {"status": "valid", "world_pos": world, "reason": None}

    def _validate_bounds(self, world: list[float]) -> None:
        for axis, value in zip(("x", "y"), world):
            bounds = self.world_bounds.get(axis)
            if bounds is None:
                continue
            if not isinstance(bounds, list) or len(bounds) != 2:
                raise ValueError(f"world bounds for {axis} must contain min and max")
            if value < float(bounds[0]) or value > float(bounds[1]):
                raise ValueError(f"world position outside {axis} bounds")
