import json
from pathlib import Path
from typing import Any


DEFAULT_SCENE_CONFIG = {
    "riskThreshold": 0.7,
    "ttcThreshold": 2.0,
    "refreshInterval": 2000,
    "cloudApiBaseUrl": "http://localhost:8000/api/v1",
}


class RuntimeConfigError(ValueError):
    pass


class RuntimeConfigStore:
    def __init__(self, config_path: str | Path = "data/runtime_config.json"):
        self.config_path = Path(config_path)

    def get_scene_config(self, scene_id: str) -> dict[str, Any]:
        data = self._load()
        scene_config = data.get(scene_id, {})
        return {"scene_id": scene_id, **DEFAULT_SCENE_CONFIG, **scene_config}

    def update_scene_config(self, scene_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        current = self.get_scene_config(scene_id)
        updated = {**current, **self._validated_patch(patch)}
        data = self._load()
        data[scene_id] = {key: updated[key] for key in DEFAULT_SCENE_CONFIG}
        self._save(data)
        return {"scene_id": scene_id, **data[scene_id]}

    def _load(self) -> dict[str, dict[str, Any]]:
        if not self.config_path.exists():
            return {}
        try:
            raw = json.loads(self.config_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        if not isinstance(raw, dict):
            return {}
        return {key: value for key, value in raw.items() if isinstance(value, dict)}

    def _save(self, data: dict[str, dict[str, Any]]) -> None:
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        self.config_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def _validated_patch(self, patch: dict[str, Any]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        if "riskThreshold" in patch:
            result["riskThreshold"] = self._number_in_range(patch["riskThreshold"], "riskThreshold", 0.0, 1.0)
        if "ttcThreshold" in patch:
            result["ttcThreshold"] = self._number_in_range(patch["ttcThreshold"], "ttcThreshold", 0.0, 10.0)
        if "refreshInterval" in patch:
            value = self._number_in_range(patch["refreshInterval"], "refreshInterval", 500, 60000)
            result["refreshInterval"] = int(value)
        if "cloudApiBaseUrl" in patch:
            value = str(patch["cloudApiBaseUrl"]).strip().rstrip("/")
            if not (value.startswith("http://") or value.startswith("https://")):
                raise RuntimeConfigError("cloudApiBaseUrl must start with http:// or https://")
            result["cloudApiBaseUrl"] = value
        return result

    @staticmethod
    def _number_in_range(value: Any, field: str, low: float, high: float) -> float:
        if not isinstance(value, (int, float)):
            raise RuntimeConfigError(f"{field} must be a number")
        numeric = float(value)
        if numeric < low or numeric > high:
            raise RuntimeConfigError(f"{field} must be between {low:g} and {high:g}")
        return numeric
