from dataclasses import dataclass
from src.utils import setup_logger


@dataclass
class BrakeCommand:
    deceleration: float  # m/s^2
    is_emergency: bool
    target_speed: float  # m/s, 0 for full stop


class BrakeController:
    """
    Graded braking controller based on risk level.
    Maps risk levels to deceleration values with rate limiting.
    """

    DECEL_MAP = {
        "SAFE": 0.0,
        "WARNING": 2.0,
        "DANGER": 5.0,
        "EMERGENCY": 8.0,
    }

    def __init__(self, max_deceleration: float = 8.0, max_jerk: float = 10.0,
                 dt: float = 0.1):
        self.max_decel = max_deceleration
        self.max_jerk = max_jerk
        self.dt = dt
        self.logger = setup_logger("vehicle.brake")
        self._current_decel = 0.0

    def compute(self, risk_level: str, current_speed: float) -> BrakeCommand:
        """
        Compute brake command from risk level.
        Applies jerk limiting to prevent mechanical shock.
        """
        target_decel = self.DECEL_MAP.get(risk_level, 0.0)
        target_decel = min(target_decel, self.max_decel)

        # Jerk limiting: limit rate of deceleration change
        decel_diff = target_decel - self._current_decel
        max_change = self.max_jerk * self.dt
        if abs(decel_diff) > max_change:
            target_decel = self._current_decel + max_change * (1 if decel_diff > 0 else -1)

        self._current_decel = target_decel

        # Target speed
        if risk_level == "EMERGENCY":
            target_speed = 0.0
        elif risk_level == "DANGER":
            target_speed = max(0.0, current_speed * 0.3)
        elif risk_level == "WARNING":
            target_speed = max(0.0, current_speed * 0.7)
        else:
            target_speed = current_speed

        return BrakeCommand(
            deceleration=round(self._current_decel, 2),
            is_emergency=(risk_level == "EMERGENCY"),
            target_speed=round(target_speed, 2),
        )

    def reset(self):
        self._current_decel = 0.0
