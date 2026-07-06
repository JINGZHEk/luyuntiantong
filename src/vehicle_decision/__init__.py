__all__ = [
    "RiskAssessor", "RiskResult",
    "BrakeController", "BrakeCommand",
    "FallbackManager",
]


def __getattr__(name):
    if name in {"RiskAssessor", "RiskResult"}:
        from .risk_assessor import RiskAssessor, RiskResult

        return {"RiskAssessor": RiskAssessor, "RiskResult": RiskResult}[name]
    if name in {"BrakeController", "BrakeCommand"}:
        from .brake_controller import BrakeController, BrakeCommand

        return {"BrakeController": BrakeController, "BrakeCommand": BrakeCommand}[name]
    if name == "FallbackManager":
        from .fallback_manager import FallbackManager

        return FallbackManager
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
