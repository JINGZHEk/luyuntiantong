import numpy as np
from collections import deque
from typing import Optional
from src.utils import setup_logger


class TrajectoryPredictor:
    """
    Constant Velocity Model with linear regression for trajectory prediction.
    Maintains a history buffer per tracked object and extrapolates future positions.
    """

    def __init__(self, history_length: int = 10, predict_steps: int = 30,
                 fps: float = 10.0, smoothing_alpha: float = 0.3):
        self.history_length = history_length
        self.predict_steps = predict_steps
        self.dt = 1.0 / fps
        self.smoothing_alpha = smoothing_alpha
        self.logger = setup_logger("roadside.predictor")
        self._histories: dict[int, deque] = {}

    def update(self, track_id: int, position: list):
        """Add a new observation for a tracked object."""
        if track_id not in self._histories:
            self._histories[track_id] = deque(maxlen=self.history_length)
        self._histories[track_id].append(np.array(position[:2], dtype=np.float64))

    def predict(self, track_id: int, occlusion_level: int = 0) -> list:
        """
        Predict future trajectory for a tracked object.
        Returns list of [x, y] predicted positions.
        """
        if track_id not in self._histories:
            return []

        history = list(self._histories[track_id])
        if len(history) < 2:
            return []

        positions = np.array(history)
        n = len(positions)

        # Linear regression on x and y separately
        t = np.arange(n, dtype=np.float64)
        vx = self._fit_velocity(t, positions[:, 0])
        vy = self._fit_velocity(t, positions[:, 1])

        # Exponential smoothing on velocity
        if n >= 3:
            raw_vx = (positions[-1, 0] - positions[-2, 0]) / self.dt
            raw_vy = (positions[-1, 1] - positions[-2, 1]) / self.dt
            vx = self.smoothing_alpha * raw_vx + (1 - self.smoothing_alpha) * vx
            vy = self.smoothing_alpha * raw_vy + (1 - self.smoothing_alpha) * vy

        last_pos = positions[-1]
        predicted = []

        for step in range(1, self.predict_steps + 1):
            future_t = step * self.dt
            px = last_pos[0] + vx * future_t
            py = last_pos[1] + vy * future_t

            # Add uncertainty for occluded targets
            if occlusion_level >= 2:
                lateral_noise = 0.3 * occlusion_level * future_t
                px += np.random.uniform(-lateral_noise, lateral_noise) * 0.1
                py += np.random.uniform(-lateral_noise, lateral_noise) * 0.1

            predicted.append([round(px, 3), round(py, 3)])

        return predicted

    def get_velocity(self, track_id: int) -> Optional[list]:
        """Get current estimated velocity for a tracked object."""
        if track_id not in self._histories:
            return None
        history = list(self._histories[track_id])
        if len(history) < 2:
            return [0.0, 0.0]

        dt = self.dt
        vx = (history[-1][0] - history[-2][0]) / dt
        vy = (history[-1][1] - history[-2][1]) / dt
        return [round(vx, 3), round(vy, 3)]

    def clear_track(self, track_id: int):
        """Remove history for a track that is no longer valid."""
        self._histories.pop(track_id, None)

    def cleanup_stale(self, active_ids: set):
        """Remove histories for tracks no longer active."""
        stale = [tid for tid in self._histories if tid not in active_ids]
        for tid in stale:
            del self._histories[tid]

    def _fit_velocity(self, t: np.ndarray, values: np.ndarray) -> float:
        """Least squares linear fit, return slope as velocity."""
        n = len(t)
        if n < 2:
            return 0.0
        t_mean = t.mean()
        v_mean = values.mean()
        numerator = np.sum((t - t_mean) * (values - v_mean))
        denominator = np.sum((t - t_mean) ** 2)
        if denominator < 1e-10:
            return 0.0
        slope = numerator / denominator
        return slope / self.dt
