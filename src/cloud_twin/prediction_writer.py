from __future__ import annotations

import queue
import threading
from typing import Any


class PredictionWriter:
    """Bounded background SQLite writer so inference callbacks stay non-blocking."""

    def __init__(self, store: Any, maxsize: int = 2048) -> None:
        self.store = store
        self.queue: queue.Queue[tuple[str, tuple[Any, ...]] | None] = queue.Queue(maxsize=maxsize)
        self.dropped = 0
        self._stopped = False
        self._thread = threading.Thread(target=self._run, name="prediction-writer", daemon=True)
        self._thread.start()

    def _enqueue(self, kind: str, *args: Any) -> None:
        if self._stopped:
            return
        try:
            self.queue.put_nowait((kind, args))
        except queue.Full:
            self.dropped += 1

    def enqueue_predictions(self, track_id: int | str, timestamp: int, future_traj: list, confidence: float, prefix: str | None = None) -> None:
        self._enqueue("prediction", track_id, timestamp, future_traj, confidence, prefix)

    def enqueue_inference_log(self, record: dict) -> None:
        self._enqueue("inference_log", record)

    def enqueue_anomaly(self, track_id: int | str, timestamp: int, anomaly_type: str, details: dict | None = None) -> None:
        self._enqueue("anomaly", track_id, timestamp, anomaly_type, details)

    def _run(self) -> None:
        while True:
            item = self.queue.get()
            try:
                if item is None:
                    return
                kind, args = item
                if kind == "prediction":
                    self.store.store_predictions(*args)
                elif kind == "inference_log":
                    self.store.store_inference_log(*args)
                elif kind == "anomaly":
                    self.store.store_prediction_anomaly(*args)
            except Exception:
                # Persistence failures must not terminate the worker or inference path.
                pass
            finally:
                self.queue.task_done()

    def flush(self, timeout: float = 2.0) -> None:
        deadline = threading.Event()
        while self.queue.unfinished_tasks and timeout > 0:
            deadline.wait(min(0.01, timeout))
            timeout -= 0.01

    def close(self) -> None:
        if self._stopped:
            return
        self._stopped = True
        try:
            self.queue.put_nowait(None)
        except queue.Full:
            try:
                self.queue.get_nowait()
                self.queue.task_done()
            except queue.Empty:
                pass
            self.queue.put_nowait(None)
        self._thread.join(timeout=2.0)
