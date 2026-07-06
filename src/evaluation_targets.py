from typing import Any


TARGET_SPECS = [
    {"key": "ade", "metric": "ADE", "operator": "<", "threshold": 1.0, "unit": "m"},
    {"key": "fde", "metric": "FDE", "operator": "<", "threshold": 2.0, "unit": "m"},
    {"key": "occAde", "metric": "Occ-ADE", "operator": "<", "threshold": 1.5, "unit": "m"},
    {"key": "occAcc", "metric": "Occ-Acc", "operator": ">=", "threshold": 0.7, "unit": "ratio"},
    {"key": "fps", "metric": "FPS", "operator": ">=", "threshold": 10.0, "unit": "fps"},
    {"key": "e2eLatency", "metric": "E2E-Lat", "operator": "<", "threshold": 100.0, "unit": "ms"},
    {"key": "leadTime", "metric": "Lead-Time", "operator": ">=", "threshold": 1.5, "unit": "s"},
]


def _is_pass(value: float, operator: str, threshold: float) -> bool:
    if operator == "<":
        return value < threshold
    if operator == "<=":
        return value <= threshold
    if operator == ">":
        return value > threshold
    if operator == ">=":
        return value >= threshold
    raise ValueError(f"Unsupported target operator: {operator}")


def _target_label(operator: str, threshold: float, unit: str) -> str:
    if unit == "ratio":
        return f"{operator} {threshold * 100:.0f}%"
    if threshold.is_integer():
        threshold_text = f"{threshold:.0f}"
    else:
        threshold_text = f"{threshold:g}"
    return f"{operator} {threshold_text} {unit}"


def build_target_status(metrics: dict[str, Any]) -> list[dict[str, Any]]:
    status = []
    for spec in TARGET_SPECS:
        value = metrics.get(spec["key"])
        if isinstance(value, (int, float)):
            passed = _is_pass(float(value), spec["operator"], float(spec["threshold"]))
            state = "pass" if passed else "fail"
        else:
            passed = None
            state = "unknown"

        status.append(
            {
                "key": spec["key"],
                "metric": spec["metric"],
                "value": value if isinstance(value, (int, float)) else None,
                "target": _target_label(spec["operator"], float(spec["threshold"]), spec["unit"]),
                "status": state,
                "pass": passed,
                "unit": spec["unit"],
            }
        )
    return status
