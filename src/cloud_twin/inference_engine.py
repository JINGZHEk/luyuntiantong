from __future__ import annotations

import queue
import threading
import time
from pathlib import Path
from typing import Any, Callable

from src.utils import setup_logger


class InferenceEngine:
    """Process-wide TorchScript runtime with batching, metrics, and hot reload."""

    _instance: "InferenceEngine | None" = None
    _instance_lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        with cls._instance_lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(
        self,
        model_path: str | None = None,
        *,
        batch_size: int = 8,
        device: str | None = None,
        batch_callback: Callable[[dict[str, Any]], None] | None = None,
        max_batch_wait_ms: float = 5.0,
        queue_size: int = 1024,
        history_length: int = 20,
    ) -> None:
        if getattr(self, "_initialized", False):
            if batch_callback is not None:
                self.batch_callback = batch_callback
            if model_path and model_path != self.model_path:
                self.reload_model(model_path)
            return
        self._initialized = True
        self.logger = setup_logger("cloud.inference_engine")
        self.batch_size = max(1, int(batch_size))
        self.device = device or "auto"
        self.batch_callback = batch_callback
        self.max_batch_wait_ms = max(0.0, float(max_batch_wait_ms))
        self.history_length = max(1, int(history_length))
        self.model_path = model_path
        self.model = None
        self.model_mtime: float | None = None
        self.model_loaded = False
        self.load_reason = "no checkpoint configured"
        self.last_infer_ms: float | None = None
        self.last_batch_size = 0
        self.last_inference_at: int | None = None
        self.consecutive_over_100ms = 0
        self.alert_active = False
        self.warmup_ms: float | None = None
        self._lock = threading.RLock()
        self._request_queue: queue.Queue[Any] = queue.Queue(maxsize=max(1, int(queue_size)))
        self._queue_sentinel = object()
        self._closed = False
        self._worker = threading.Thread(target=self._run_queue, name="stgnn-inference", daemon=True)
        self._worker.start()
        if model_path:
            self.reload_model(model_path)

    @classmethod
    def reset_instance(cls) -> None:
        with cls._instance_lock:
            if cls._instance is not None:
                cls._instance.close()
            cls._instance = None

    def reload_model(self, model_path: str | None = None) -> bool:
        with self._lock:
            if model_path is not None:
                self.model_path = model_path
            if not self.model_path:
                self.model = None
                self.model_loaded = False
                self.load_reason = "no checkpoint configured"
                self.warmup_ms = None
                return False
            path = Path(self.model_path)
            if not path.exists():
                self.model = None
                self.model_loaded = False
                self.load_reason = f"checkpoint not found: {self.model_path}"
                self.warmup_ms = None
                return False
            try:
                import torch

                resolved_device = self.device
                if resolved_device == "auto":
                    resolved_device = "cuda" if torch.cuda.is_available() else "cpu"
                if resolved_device.startswith("cuda") and not torch.cuda.is_available():
                    resolved_device = "cpu"
                self.device = resolved_device
                model = torch.jit.load(str(path), map_location=resolved_device)
                model.eval()
                warmup_started = time.perf_counter()
                with torch.no_grad():
                    model(torch.zeros(1, self.history_length, 8, dtype=torch.float32, device=resolved_device))
                if resolved_device.startswith("cuda"):
                    torch.cuda.synchronize()
                self.model = model
                self.warmup_ms = round((time.perf_counter() - warmup_started) * 1000.0, 3)
                self.model_mtime = path.stat().st_mtime
                self.model_loaded = True
                self.load_reason = None
                self.logger.info(f"TorchScript model loaded: {path}")
                return True
            except Exception as exc:
                self.model = None
                self.model_loaded = False
                self.load_reason = f"checkpoint load failed: {exc}"
                self.warmup_ms = None
                self.logger.warning(self.load_reason)
                return False

    def reload_if_changed(self) -> bool:
        if not self.model_path:
            return False
        path = Path(self.model_path)
        if not path.exists():
            return False
        mtime = path.stat().st_mtime
        if self.model_mtime is None or mtime > self.model_mtime:
            return self.reload_model()
        return False

    def predict_batch(self, features: list[list[list[float]]]) -> list[dict[str, Any]]:
        if not features:
            return []
        if self._closed:
            raise RuntimeError("InferenceEngine is closed")
        completed = threading.Event()
        result: dict[str, Any] = {}
        try:
            self._request_queue.put((features, completed, result), timeout=1.0)
        except queue.Full as exc:
            raise RuntimeError("Inference queue is full") from exc
        if not completed.wait(timeout=30.0):
            raise TimeoutError("Inference request timed out")
        if "error" in result:
            raise result["error"]
        return result["value"]

    def _run_queue(self) -> None:
        while True:
            first = self._request_queue.get()
            if first is self._queue_sentinel:
                self._request_queue.task_done()
                return
            requests = [first]
            feature_count = len(first[0])
            deadline = time.perf_counter() + self.max_batch_wait_ms / 1000.0
            while feature_count < self.batch_size:
                remaining = deadline - time.perf_counter()
                if remaining <= 0:
                    break
                try:
                    request = self._request_queue.get(timeout=remaining)
                except queue.Empty:
                    break
                if request is self._queue_sentinel:
                    self._request_queue.task_done()
                    self._closed = True
                    break
                requests.append(request)
                feature_count += len(request[0])

            flattened = [feature for request, _event, _result in requests for feature in request]
            try:
                outputs = self._infer_direct(flattened)
                offset = 0
                for request, completed, result in requests:
                    count = len(request)
                    result["value"] = outputs[offset:offset + count]
                    offset += count
                    completed.set()
            except Exception as exc:
                for _request, completed, result in requests:
                    result["error"] = exc
                    completed.set()
            finally:
                for _request in requests:
                    self._request_queue.task_done()

            if self._closed:
                return

    def _infer_direct(self, features: list[list[list[float]]]) -> list[dict[str, Any]]:
        with self._lock:
            self.reload_if_changed()
            if self.model is None:
                batch_record = self._record_batch(len(features), 0.0)
                if self.batch_callback:
                    self.batch_callback(batch_record)
                return [
                    {"trajectory": [], "confidence": 0.0, "infer_ms": 0.0, "anomaly": None}
                    for _ in features
                ]
            import torch

            results: list[dict[str, Any]] = []
            for start in range(0, len(features), self.batch_size):
                chunk = features[start:start + self.batch_size]
                tensor = torch.tensor(chunk, dtype=torch.float32, device=self.device)
                started = time.perf_counter()
                with torch.no_grad():
                    output = self.model(tensor)
                infer_ms = round((time.perf_counter() - started) * 1000.0, 3)
                trajectory_output = output[0] if isinstance(output, (tuple, list)) else output
                logits = output[1] if isinstance(output, (tuple, list)) and len(output) > 1 else None
                trajectories = trajectory_output.detach().cpu().reshape(len(chunk), -1, 2).tolist()
                confidences = [1.0] * len(chunk)
                if logits is not None:
                    confidences = torch.softmax(logits, dim=-1).max(dim=-1).values.detach().cpu().tolist()
                batch_record = self._record_batch(len(chunk), infer_ms)
                for trajectory, confidence in zip(trajectories, confidences):
                    anomaly = self._trajectory_anomaly(trajectory)
                    results.append(
                        {
                            "trajectory": [[round(float(x), 3), round(float(y), 3)] for x, y in trajectory],
                            "confidence": round(float(confidence), 4),
                            "infer_ms": infer_ms,
                            "anomaly": anomaly,
                        }
                    )
                if self.batch_callback:
                    self.batch_callback(batch_record)
            return results

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        try:
            self._request_queue.put_nowait(self._queue_sentinel)
        except queue.Full:
            return
        self._worker.join(timeout=2.0)

    def _record_batch(self, batch_size: int, infer_ms: float) -> dict[str, Any]:
        timestamp = int(time.time() * 1000)
        self.last_infer_ms = infer_ms
        self.last_batch_size = batch_size
        self.last_inference_at = timestamp
        self.consecutive_over_100ms = self.consecutive_over_100ms + 1 if infer_ms > 100.0 else 0
        self.alert_active = self.consecutive_over_100ms >= 5
        if infer_ms > 50.0:
            self.logger.warning(f"Slow inference batch: batch_size={batch_size} infer_ms={infer_ms}")
        return {
            "batch_size": batch_size,
            "infer_ms": infer_ms,
            "track_count": batch_size,
            "timestamp": timestamp,
            "alert": self.alert_active,
        }

    @staticmethod
    def _trajectory_anomaly(trajectory: list[list[float]]) -> str | None:
        for left, right in zip(trajectory, trajectory[1:]):
            dx = float(right[0]) - float(left[0])
            dy = float(right[1]) - float(left[1])
            if (dx * dx + dy * dy) ** 0.5 > 5.0:
                return "single_step_displacement_gt_5m"
        return None

    def health(self) -> dict[str, Any]:
        gpu = {"available": False, "allocated_mb": 0.0, "reserved_mb": 0.0}
        try:
            import torch

            gpu["available"] = bool(torch.cuda.is_available())
            if gpu["available"]:
                gpu["allocated_mb"] = round(torch.cuda.memory_allocated() / 1024 / 1024, 2)
                gpu["reserved_mb"] = round(torch.cuda.memory_reserved() / 1024 / 1024, 2)
        except Exception:
            pass
        return {
            "model_loaded": self.model_loaded,
            "model_path": self.model_path,
            "model_reason": self.load_reason,
            "last_infer_ms": self.last_infer_ms,
            "last_batch_size": self.last_batch_size,
            "last_inference_at": self.last_inference_at,
            "slow_alert": self.alert_active,
            "warmup_ms": self.warmup_ms,
            "queue_depth": self._request_queue.qsize(),
            "queue_capacity": self._request_queue.maxsize,
            "gpu": gpu,
        }
