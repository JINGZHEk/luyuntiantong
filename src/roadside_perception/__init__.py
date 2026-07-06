__all__ = ["Detector", "TrajectoryPredictor", "OcclusionEstimator", "OccAwareSTGNNPredictor"]


def __getattr__(name):
    if name == "Detector":
        from .detector import Detector

        return Detector
    if name == "TrajectoryPredictor":
        from .trajectory_predictor import TrajectoryPredictor

        return TrajectoryPredictor
    if name == "OcclusionEstimator":
        from .occlusion_estimator import OcclusionEstimator

        return OcclusionEstimator
    if name == "OccAwareSTGNNPredictor":
        from .stgnn_predictor import OccAwareSTGNNPredictor

        return OccAwareSTGNNPredictor
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
