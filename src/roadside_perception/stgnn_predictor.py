from collections import deque
from pathlib import Path
from typing import Any, Optional

from src.utils import setup_logger


CLASS_IDS = {
    "person": 1.0,
    "pedestrian": 1.0,
    "car": 2.0,
    "truck": 3.0,
    "bus": 3.0,
    "bicycle": 4.0,
}


def build_node_feature_sequence(
    history: list[list[float]],
    bbox: list[float] | None = None,
    obj_class: str = "unknown",
    occlusion_level: int = 0,
    fps: float = 10.0,
    history_length: int = 8,
) -> list[list[float]]:
    if not history:
        return []

    width = float(bbox[2]) if bbox and len(bbox) >= 4 else 0.0
    height = float(bbox[3]) if bbox and len(bbox) >= 4 else 0.0
    class_id = CLASS_IDS.get(obj_class, 0.0)
    occ_score = round(max(0, min(int(occlusion_level), 3)) / 3.0, 3)

    trimmed = [[float(pos[0]), float(pos[1])] for pos in history[-history_length:]]
    padded = [trimmed[0] for _ in range(max(0, history_length - len(trimmed)))] + trimmed

    features = []
    for idx, pos in enumerate(padded):
        if idx == 0:
            vx = 0.0
            vy = 0.0
        else:
            prev = padded[idx - 1]
            vx = (pos[0] - prev[0]) * fps
            vy = (pos[1] - prev[1]) * fps
        features.append(
            [
                round(pos[0], 3),
                round(pos[1], 3),
                round(width, 3),
                round(height, 3),
                round(vx, 3),
                round(vy, 3),
                class_id,
                occ_score,
            ]
        )
    return features


class OccAwareSTGNNPredictor:
    """ST-GNN-ready trajectory predictor with explicit constant-velocity fallback."""

    def __init__(
        self,
        history_length: int = 8,
        predict_steps: int = 30,
        fps: float = 10.0,
        model_path: str | None = None,
    ):
        self.history_length = history_length
        self.predict_steps = predict_steps
        self.fps = fps
        self.dt = 1.0 / fps
        self.model_path = model_path
        self.logger = setup_logger("roadside.stgnn_predictor")
        self._histories: dict[int, deque] = {}
        self._metadata: dict[int, dict[str, Any]] = {}
        self.model = None
        self.backend_status = {
            "mode": "fallback_constant_velocity",
            "model_loaded": False,
            "model_path": model_path,
            "reason": "no checkpoint configured",
        }
        if model_path:
            self._load_model(model_path)

    def _load_model(self, model_path: str) -> None:
        path = Path(model_path)
        if not path.exists():
            self.backend_status["reason"] = f"checkpoint not found: {model_path}"
            self.logger.warning(self.backend_status["reason"])
            return

        try:
            import torch
        except Exception as exc:
            self.backend_status["reason"] = f"torch unavailable: {exc}"
            self.logger.warning(self.backend_status["reason"])
            return

        try:
            self.model = torch.jit.load(str(path), map_location="cpu")
            self.model.eval()
            self.backend_status = {
                "mode": "torchscript_stgnn",
                "model_loaded": True,
                "model_path": model_path,
                "reason": None,
            }
        except Exception as exc:
            self.model = None
            self.backend_status["reason"] = f"checkpoint load failed: {exc}"
            self.logger.warning(self.backend_status["reason"])

    def update(self, track_id: int, position: list, metadata: Optional[dict[str, Any]] = None) -> None:
        if track_id not in self._histories:
            self._histories[track_id] = deque(maxlen=self.history_length)
        self._histories[track_id].append([float(position[0]), float(position[1])])
        if metadata:
            self._metadata[track_id] = metadata

    def predict(self, track_id: int, occlusion_level: int = 0) -> list:
        if track_id not in self._histories:
            return []

        history = list(self._histories[track_id])
        if len(history) < 2:
            return []

        if self.model is not None:
            predicted = self._predict_with_model(track_id, history, occlusion_level)
            if predicted:
                return predicted

        return self._predict_constant_velocity(history)

    def _predict_with_model(self, track_id: int, history: list[list[float]], occlusion_level: int) -> list:
        try:
            import torch
        except Exception:
            return []

        metadata = self._metadata.get(track_id, {})
        features = build_node_feature_sequence(
            history=history,
            bbox=metadata.get("bbox"),
            obj_class=metadata.get("class", "unknown"),
            occlusion_level=occlusion_level,
            fps=self.fps,
            history_length=self.history_length,
        )
        if not features:
            return []

        try:
            with torch.no_grad():
                tensor = torch.tensor(features, dtype=torch.float32).unsqueeze(0)
                output = self.model(tensor)
                if isinstance(output, (tuple, list)):
                    output = output[0]
                points = output.reshape(-1, 2).tolist()[: self.predict_steps]
                return [[round(float(x), 3), round(float(y), 3)] for x, y in points]
        except Exception as exc:
            self.logger.warning(f"ST-GNN inference failed, falling back to constant velocity: {exc}")
            return []

    def _predict_constant_velocity(self, history: list[list[float]]) -> list:
        vx, vy = self._velocity_from_history(history)
        last_x, last_y = history[-1]
        predicted = []
        for step in range(1, self.predict_steps + 1):
            predicted.append(
                [
                    round(last_x + vx * step * self.dt, 3),
                    round(last_y + vy * step * self.dt, 3),
                ]
            )
        return predicted

    def get_velocity(self, track_id: int) -> Optional[list]:
        if track_id not in self._histories:
            return None
        history = list(self._histories[track_id])
        if len(history) < 2:
            return [0.0, 0.0]
        vx, vy = self._velocity_from_history(history)
        return [round(vx, 3), round(vy, 3)]

    def cleanup_stale(self, active_ids: set) -> None:
        stale = [track_id for track_id in self._histories if track_id not in active_ids]
        for track_id in stale:
            del self._histories[track_id]
            self._metadata.pop(track_id, None)

    def clear_track(self, track_id: int) -> None:
        self._histories.pop(track_id, None)
        self._metadata.pop(track_id, None)

    def _velocity_from_history(self, history: list[list[float]]) -> tuple[float, float]:
        prev_x, prev_y = history[-2]
        last_x, last_y = history[-1]
        return (last_x - prev_x) / self.dt, (last_y - prev_y) / self.dt
