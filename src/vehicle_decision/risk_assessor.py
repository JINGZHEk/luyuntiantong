import numpy as np
from dataclasses import dataclass
from typing import Optional
from src.utils import setup_logger


@dataclass
class RiskResult:
    level: str  # SAFE, WARNING, DANGER, EMERGENCY
    ttc: float
    collision_prob: float
    target_track_id: Optional[int] = None
    target_class: Optional[str] = None
    min_distance: float = float('inf')


class RiskAssessor:
    """
    TTC-based risk assessment with trajectory-aware collision probability.
    """

    def __init__(self, ttc_thresholds: dict = None, lateral_threshold: float = 3.5):
        self.logger = setup_logger("vehicle.risk")
        self.thresholds = ttc_thresholds or {
            "safe": 4.0,
            "warning": 2.0,
            "danger": 1.0,
        }
        self.lateral_threshold = lateral_threshold
        self._prev_level = "SAFE"
        self._downgrade_count = 0
        self._downgrade_needed = 5

    def assess(self, ego_position: list, ego_velocity: list,
               objects: list, predicted_trajs: dict = None) -> RiskResult:
        """
        Assess risk from all detected objects.

        Args:
            ego_position: [x, y] current vehicle position
            ego_velocity: [vx, vy] current vehicle velocity
            objects: list of detected objects with world_pos, velocity
            predicted_trajs: {track_id: [[x,y], ...]} predicted trajectories
        """
        ego_pos = np.array(ego_position[:2], dtype=np.float64)
        ego_vel = np.array(ego_velocity[:2], dtype=np.float64)
        ego_speed = np.linalg.norm(ego_vel)

        worst_risk = RiskResult(level="SAFE", ttc=float('inf'), collision_prob=0.0)

        for obj in objects:
            obj_pos = np.array(obj.get("world_pos", [0, 0])[:2], dtype=np.float64)
            obj_vel = np.array(obj.get("velocity", [0, 0])[:2], dtype=np.float64)

            # Distance and relative velocity
            rel_pos = obj_pos - ego_pos
            distance = np.linalg.norm(rel_pos)
            rel_vel = ego_vel - obj_vel

            # Lateral distance check
            if ego_speed > 0.1:
                ego_dir = ego_vel / ego_speed
                lateral_dist = abs(np.cross(ego_dir, rel_pos))
                if lateral_dist > self.lateral_threshold:
                    continue

            # TTC calculation
            closing_speed = np.dot(rel_vel, rel_pos) / max(distance, 0.01)
            if closing_speed <= 0.1:
                ttc = float('inf')
            else:
                ttc = distance / closing_speed

            # Collision probability from predicted trajectory
            collision_prob = 0.0
            track_id = obj.get("track_id")
            if predicted_trajs and track_id in predicted_trajs:
                collision_prob = self._trajectory_collision_prob(
                    ego_pos, ego_vel, predicted_trajs[track_id]
                )

            # Determine risk level
            level = self._ttc_to_level(ttc, collision_prob)

            if self._level_severity(level) > self._level_severity(worst_risk.level):
                worst_risk = RiskResult(
                    level=level,
                    ttc=round(ttc, 2),
                    collision_prob=round(collision_prob, 3),
                    target_track_id=track_id,
                    target_class=obj.get("class", "unknown"),
                    min_distance=round(distance, 2),
                )

        # Apply hysteresis
        worst_risk.level = self._apply_hysteresis(worst_risk.level)
        return worst_risk

    def _ttc_to_level(self, ttc: float, collision_prob: float) -> str:
        if ttc <= self.thresholds["danger"] or collision_prob > 0.8:
            return "EMERGENCY"
        elif ttc <= self.thresholds["warning"] or collision_prob > 0.5:
            return "DANGER"
        elif ttc <= self.thresholds["safe"] or collision_prob > 0.3:
            return "WARNING"
        return "SAFE"

    def _trajectory_collision_prob(self, ego_pos: np.ndarray, ego_vel: np.ndarray,
                                    predicted_traj: list) -> float:
        """Calculate collision probability based on predicted trajectory proximity."""
        if not predicted_traj:
            return 0.0

        ego_speed = np.linalg.norm(ego_vel)
        min_dist = float('inf')
        dt = 0.1  # 10Hz prediction

        for i, point in enumerate(predicted_traj):
            future_ego = ego_pos + ego_vel * (i + 1) * dt
            pred_pos = np.array(point[:2])
            dist = np.linalg.norm(future_ego - pred_pos)
            min_dist = min(min_dist, dist)

        # Convert minimum distance to probability
        if min_dist < 1.0:
            return 0.95
        elif min_dist < 2.0:
            return 0.7
        elif min_dist < 3.5:
            return 0.3
        elif min_dist < 5.0:
            return 0.1
        return 0.0

    def _apply_hysteresis(self, new_level: str) -> str:
        """Upgrade immediately, downgrade requires consecutive confirmation."""
        if self._level_severity(new_level) >= self._level_severity(self._prev_level):
            self._prev_level = new_level
            self._downgrade_count = 0
            return new_level
        else:
            self._downgrade_count += 1
            if self._downgrade_count >= self._downgrade_needed:
                self._prev_level = new_level
                self._downgrade_count = 0
                return new_level
            return self._prev_level

    @staticmethod
    def _level_severity(level: str) -> int:
        return {"SAFE": 0, "WARNING": 1, "DANGER": 2, "EMERGENCY": 3}.get(level, 0)
