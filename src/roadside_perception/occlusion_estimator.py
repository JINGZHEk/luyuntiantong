import numpy as np
from typing import Optional
from src.utils import setup_logger


class OcclusionEstimator:
    """
    Estimates occlusion level for detected objects based on:
    1. Bounding box area ratio (vs expected full-size)
    2. Position relative to known occlusion zones
    """

    EXPECTED_AREA = {
        "person": 50 * 120,    # typical full-body bbox area in pixels
        "car": 200 * 80,
        "truck": 300 * 100,
        "bicycle": 80 * 100,
    }

    def __init__(self, area_ratio_threshold: float = 0.6):
        self.area_ratio_threshold = area_ratio_threshold
        self.logger = setup_logger("roadside.occlusion")
        self._occlusion_zones: list = []

    def set_occlusion_zones(self, zones: list):
        """
        Set known occlusion zones (e.g., parked vehicles, buildings).
        Each zone: {"id": str, "bbox": [x_min, y_min, x_max, y_max], "type": str}
        """
        self._occlusion_zones = zones

    def estimate(self, detection: dict) -> int:
        """
        Estimate occlusion level for a single detection.
        Returns: 0=none, 1=light, 2=moderate, 3=heavy
        """
        bbox = detection.get("bbox", [0, 0, 0, 0])
        cls = detection.get("class", "person")
        w, h = bbox[2], bbox[3]
        actual_area = w * h

        expected = self.EXPECTED_AREA.get(cls, 6000)
        if expected <= 0:
            return 0

        area_ratio = actual_area / expected

        # Zone-based occlusion check
        zone_occlusion = self._check_zone_occlusion(detection)

        # Combine area ratio and zone-based estimate
        if area_ratio < 0.3 or zone_occlusion >= 3:
            return 3  # heavy
        elif area_ratio < 0.5 or zone_occlusion >= 2:
            return 2  # moderate
        elif area_ratio < self.area_ratio_threshold or zone_occlusion >= 1:
            return 1  # light
        return 0  # none

    def estimate_zones(self, detections: list, ego_position: list = None) -> list:
        """
        Estimate occlusion zones based on large static objects in the scene.
        Returns list of occlusion zone dicts for MQTT publishing.
        """
        zones = []
        for det in detections:
            if det.get("class") in ("car", "truck", "bus") and det.get("confidence", 0) > 0.7:
                bbox = det.get("bbox", [0, 0, 0, 0])
                # Large stationary vehicles create occlusion zones behind them
                w, h = bbox[2], bbox[3]
                if w * h > 10000:  # significant size
                    world_pos = det.get("world_pos", [0, 0])
                    vel = det.get("velocity", [0, 0])
                    speed = np.sqrt(vel[0]**2 + vel[1]**2) if vel else 0
                    if speed < 0.5:  # nearly stationary
                        zone = {
                            "id": f"occ_zone_{det.get('track_id', 0)}",
                            "center": world_pos,
                            "radius": max(w, h) * 0.02,
                            "source_object": det.get("track_id"),
                            "severity": 2,
                        }
                        zones.append(zone)
        return zones

    def _check_zone_occlusion(self, detection: dict) -> int:
        """Check if detection is within any known occlusion zone."""
        world_pos = detection.get("world_pos")
        if world_pos is None or not self._occlusion_zones:
            return 0

        x, y = world_pos[0], world_pos[1]
        max_level = 0
        for zone in self._occlusion_zones:
            zbbox = zone.get("bbox", [0, 0, 0, 0])
            if zbbox[0] <= x <= zbbox[2] and zbbox[1] <= y <= zbbox[3]:
                max_level = max(max_level, zone.get("severity", 2))
        return max_level
