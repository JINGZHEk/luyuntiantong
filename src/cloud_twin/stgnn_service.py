"""Cloud-side STGNN inference for streamed perception messages."""

from __future__ import annotations

import copy
import time
from collections import defaultdict
from typing import Any, Callable


def _default_predictor_factory(**kwargs):
    from src.roadside_perception.stgnn_predictor import OccAwareSTGNNPredictor

    return OccAwareSTGNNPredictor(**kwargs)


class CloudSTGNNService:
    """Keep per-node track history and enrich perception payloads in the cloud."""

    def __init__(
        self,
        enabled: bool = True,
        backend: str = "stgnn",
        model_path: str | None = None,
        history_length: int = 8,
        predict_steps: int = 30,
        fps: float = 10.0,
        min_history: int = 2,
        batch_size: int = 8,
        device: str = "auto",
        batch_callback: Callable[[dict[str, Any]], None] | None = None,
        predictor_factory: Callable[..., Any] | None = None,
    ):
        if history_length < 1 or predict_steps < 1 or min_history < 1:
            raise ValueError("history_length, predict_steps and min_history must be positive")
        if fps <= 0:
            raise ValueError("fps must be greater than zero")

        self.enabled = bool(enabled)
        self.backend = backend
        self.model_path = model_path
        self.history_length = int(history_length)
        self.predict_steps = int(predict_steps)
        self.fps = float(fps)
        self.min_history = int(min_history)
        self.predictor_factory = predictor_factory or _default_predictor_factory
        self.inference_engine = None
        if predictor_factory is None and self.enabled and self.backend == "stgnn" and model_path:
            from src.cloud_twin.inference_engine import InferenceEngine

            self.inference_engine = InferenceEngine(
                model_path=model_path,
                batch_size=batch_size,
                device=device,
                history_length=self.history_length,
                batch_callback=batch_callback,
            )
        self._predictors: dict[str, Any] = {}
        self._history_lengths: defaultdict[tuple[str, str], int] = defaultdict(int)

    def _get_predictor(self, node_id: str):
        if node_id not in self._predictors:
            self._predictors[node_id] = self.predictor_factory(
                history_length=self.history_length,
                predict_steps=self.predict_steps,
                fps=self.fps,
                model_path=self.model_path,
                inference_engine=self.inference_engine,
            )
        return self._predictors[node_id]

    def update_and_predict(self, payload: dict[str, Any]) -> dict[str, Any]:
        enriched = copy.deepcopy(payload)
        node_id = str(enriched.get("node_id", "unknown"))
        objects = enriched.setdefault("objects", [])
        statuses: list[str] = []
        reasons: list[str] = []
        latencies: list[float] = []
        active_ids: set[str] = set()
        active_predictor_ids: set[Any] = set()
        predictor = None
        pending: list[tuple[dict[str, Any], Any, int]] = []

        for obj in objects:
            track_id = obj.get("track_id")
            world_pos = obj.get("world_pos")
            if track_id is None or not self._valid_position(world_pos):
                obj["predicted_traj"] = []
                obj["prediction_status"] = "invalid_coordinate"
                obj["prediction_reason"] = "valid world_pos is required for STGNN"
                statuses.append("invalid_coordinate")
                reasons.append(obj["prediction_reason"])
                continue

            track_key = str(track_id)
            active_ids.add(track_key)

            if not self.enabled or self.backend != "stgnn":
                obj["predicted_traj"] = []
                obj["prediction_status"] = "deferred"
                obj["prediction_reason"] = "cloud STGNN is disabled"
                statuses.append("deferred")
                reasons.append(obj["prediction_reason"])
                continue

            predictor = self._get_predictor(node_id)
            active_predictor_ids.add(track_id)
            history_key = (node_id, track_key)
            self._history_lengths[history_key] += 1
            metadata = {
                "bbox": obj.get("bbox"),
                "class": obj.get("class", "unknown"),
            }
            predictor.update(track_id, world_pos, metadata=metadata)

            if self._history_lengths[history_key] < self.min_history:
                obj["predicted_traj"] = []
                obj["prediction_status"] = "deferred"
                obj["prediction_reason"] = "insufficient_history"
                statuses.append("deferred")
                reasons.append(obj["prediction_reason"])
                continue

            pending.append((obj, track_id, int(obj.get("occlusion_level", 0))))

        prediction_results: dict[Any, dict[str, Any]] = {}
        if predictor is not None and pending:
            try:
                if hasattr(predictor, "predict_many"):
                    prediction_results = predictor.predict_many(
                        [(track_id, occlusion) for _obj, track_id, occlusion in pending]
                    )
                else:
                    for _obj, track_id, occlusion in pending:
                        started = time.perf_counter()
                        trajectory = predictor.predict(track_id, occlusion)
                        prediction_results[track_id] = {
                            "trajectory": trajectory,
                            "confidence": 1.0 if trajectory else 0.0,
                            "infer_ms": round((time.perf_counter() - started) * 1000.0, 3),
                            "anomaly": None,
                        }
            except Exception as exc:
                reasons.append(f"STGNN inference failed: {exc}")

        prediction_confidences = []
        anomalies = []
        for obj, track_id, _occlusion in pending:
            result = prediction_results.get(track_id, {})
            predicted = list(result.get("trajectory") or [])[: self.predict_steps]
            latency_ms = result.get("infer_ms")
            if isinstance(latency_ms, (int, float)):
                latencies.append(float(latency_ms))
            confidence = float(result.get("confidence", obj.get("confidence", 0.0)))
            anomaly = result.get("anomaly")
            if anomaly:
                anomalies.append({"track_id": track_id, "type": anomaly})
            prediction_confidences.append(confidence)
            status = self._status_from_predictor(predictor, predicted)
            obj["predicted_traj"] = predicted
            obj["future_traj"] = [
                {"x": point[0], "y": point[1], "t": round((index + 1) / self.fps, 3)}
                for index, point in enumerate(predicted)
            ]
            obj["prediction_confidence"] = round(confidence, 4)
            obj["prediction_anomaly"] = anomaly
            obj["prediction_status"] = status
            obj["prediction_reason"] = self._predictor_reason(predictor, status)
            if obj.get("velocity") in (None, [], [0.0, 0.0]):
                velocity = predictor.get_velocity(track_id)
                if velocity is not None:
                    obj["velocity"] = velocity
            statuses.append(status)
            if obj["prediction_reason"]:
                reasons.append(obj["prediction_reason"])

        if predictor is not None and hasattr(predictor, "cleanup_stale"):
            predictor.cleanup_stale(active_predictor_ids)
        self._cleanup_history(node_id, active_ids)

        enriched["prediction"] = {
            "location": "cloud",
            "backend": self.backend,
            "status": self._aggregate_status(statuses),
            "model_path": self.model_path,
            "latency_ms": round(max(latencies), 3) if latencies else None,
            "confidence": round(sum(prediction_confidences) / len(prediction_confidences), 4) if prediction_confidences else 0.0,
            "anomalies": anomalies,
            "reason": reasons[0] if reasons else None,
        }
        return enriched

    @staticmethod
    def _valid_position(world_pos: Any) -> bool:
        if not isinstance(world_pos, (list, tuple)) or len(world_pos) != 2:
            return False
        try:
            return all(
                float(value) == float(value) and abs(float(value)) <= 200.0
                for value in world_pos
            )
        except (TypeError, ValueError):
            return False

    def _cleanup_history(self, node_id: str, active_ids: set[str]) -> None:
        stale = [
            key for key in self._history_lengths
            if key[0] == node_id and key[1] not in active_ids
        ]
        for key in stale:
            del self._history_lengths[key]

    @staticmethod
    def _status_from_predictor(predictor: Any, predicted: list) -> str:
        if not predicted:
            return "fallback"
        backend_status = getattr(predictor, "backend_status", {}) or {}
        return "ready" if backend_status.get("model_loaded") else "fallback"

    @staticmethod
    def _predictor_reason(predictor: Any, status: str) -> str | None:
        if status == "ready":
            return None
        backend_status = getattr(predictor, "backend_status", {}) or {}
        return backend_status.get("reason") or "model prediction unavailable"

    @staticmethod
    def _aggregate_status(statuses: list[str]) -> str:
        if not statuses:
            return "deferred"
        for status in ("ready", "fallback", "invalid_coordinate", "deferred"):
            if status in statuses:
                return status
        return "deferred"

    def reload_model(self) -> bool:
        return bool(self.inference_engine and self.inference_engine.reload_model())

    def health(self) -> dict[str, Any]:
        if self.inference_engine is None:
            return {
                "model_loaded": False,
                "model_path": self.model_path,
                "model_reason": "inference engine is disabled",
                "last_infer_ms": None,
                "gpu": {"available": False, "allocated_mb": 0.0, "reserved_mb": 0.0},
            }
        return self.inference_engine.health()
