import time
from src.utils import setup_logger, ErrorCode


class FallbackManager:
    """
    Manages degraded operation when roadside communication is lost.
    Tracks heartbeat timing and transitions between cooperative/fallback modes.
    """

    def __init__(self, timeout_ms: float = 200, max_missed_frames: int = 3,
                 degraded_speed_factor: float = 0.5, recovery_sec: float = 3.0):
        self.timeout_ms = timeout_ms
        self.max_missed_frames = max_missed_frames
        self.degraded_speed_factor = degraded_speed_factor
        self.recovery_sec = recovery_sec
        self.logger = setup_logger("vehicle.fallback")

        self._last_msg_time: float = time.time()
        self._missed_frames: int = 0
        self._mode: str = "cooperative"  # cooperative, degraded, recovering
        self._recovery_start: float = 0.0

    @property
    def mode(self) -> str:
        return self._mode

    @property
    def fusion_weight(self) -> float:
        """Weight for roadside data fusion (0=ignore, 1=full trust)."""
        if self._mode == "cooperative":
            return 1.0
        elif self._mode == "recovering":
            elapsed = time.time() - self._recovery_start
            return min(1.0, elapsed / self.recovery_sec)
        return 0.0

    def on_message_received(self):
        """Called when a valid roadside message arrives."""
        self._last_msg_time = time.time()
        self._missed_frames = 0

        if self._mode == "degraded":
            self._mode = "recovering"
            self._recovery_start = time.time()
            self.logger.info("Entering recovery mode")
        elif self._mode == "recovering":
            elapsed = time.time() - self._recovery_start
            if elapsed >= self.recovery_sec:
                self._mode = "cooperative"
                self.logger.info("Recovered to cooperative mode")

    def on_frame_tick(self):
        """Called each processing frame to check timeout."""
        if self._mode == "cooperative" or self._mode == "recovering":
            elapsed_ms = (time.time() - self._last_msg_time) * 1000
            if elapsed_ms > self.timeout_ms:
                self._missed_frames += 1
                if self._missed_frames >= self.max_missed_frames:
                    self._mode = "degraded"
                    self.logger.warning(
                        f"[{ErrorCode.E2001}] Roadside timeout, entering degraded mode"
                    )

    def get_speed_limit_factor(self) -> float:
        """Speed limit multiplier in degraded mode."""
        if self._mode == "degraded":
            return self.degraded_speed_factor
        return 1.0
