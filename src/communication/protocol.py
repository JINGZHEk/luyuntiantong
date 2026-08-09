import time
from dataclasses import dataclass, field, asdict
from typing import Optional


@dataclass
class DetectedObject:
    track_id: int
    obj_class: str
    bbox: list  # [x, y, w, h]
    world_pos: list  # [x, y]
    velocity: list  # [vx, vy]
    confidence: float
    occlusion_level: int  # 0=none, 1=light, 2=moderate, 3=heavy
    predicted_traj: list = field(default_factory=list)  # [[x,y], ...]

    def to_dict(self) -> dict:
        return {
            "track_id": self.track_id,
            "class": self.obj_class,
            "bbox": self.bbox,
            "world_pos": self.world_pos,
            "velocity": self.velocity,
            "confidence": self.confidence,
            "occlusion_level": self.occlusion_level,
            "predicted_traj": self.predicted_traj,
        }


@dataclass
class PerceptionMessage:
    timestamp: int
    frame_id: int
    node_id: str
    objects: list  # List of DetectedObject dicts
    processing_time_ms: float = 0.0
    schema_version: int = 1
    message_type: str = "perception"
    scene_id: str = "scene_001"
    source: dict = field(default_factory=dict)
    coordinate_frame: str = "road_xy"
    prediction: dict = field(
        default_factory=lambda: {
            "location": "cloud",
            "backend": "stgnn",
            "status": "deferred",
            "model_path": None,
            "latency_ms": None,
            "reason": "not_processed",
        }
    )

    def to_dict(self) -> dict:
        return {
            "schema_version": self.schema_version,
            "message_type": self.message_type,
            "scene_id": self.scene_id,
            "timestamp": self.timestamp,
            "frame_id": self.frame_id,
            "node_id": self.node_id,
            "source": self.source,
            "coordinate_frame": self.coordinate_frame,
            "objects": self.objects,
            "prediction": self.prediction,
            "processing_time_ms": self.processing_time_ms,
        }


@dataclass
class VehicleStatus:
    timestamp: int
    vehicle_id: str
    position: list  # [x, y]
    velocity: list  # [vx, vy]
    heading: float
    speed: float
    frame_id: Optional[int] = None
    acceleration: list = field(default_factory=lambda: [0.0, 0.0])
    mode: str = "cooperative"
    risk_level: str = "SAFE"

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class DecisionMessage:
    timestamp: int
    vehicle_id: str
    risk_level: str
    ttc: float
    collision_prob: float
    brake_decel: float
    frame_id: Optional[int] = None
    target_object: Optional[dict] = None
    mode: str = "cooperative"
    fusion_weight: float = 1.0

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp,
            "frame_id": self.frame_id,
            "vehicle_id": self.vehicle_id,
            "risk_level": self.risk_level,
            "ttc": self.ttc,
            "collision_prob": self.collision_prob,
            "brake_decel": self.brake_decel,
            "target_object": self.target_object,
            "mode": self.mode,
            "fusion_weight": self.fusion_weight,
        }


@dataclass
class CloudEvent:
    event_id: str
    timestamp: int
    event_type: str
    severity: str
    scene_id: str
    involved_objects: list
    min_ttc: float
    outcome: str = "pending"
    description: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class HeartbeatMessage:
    timestamp: int
    node_id: str
    status: str = "active"
    fps: float = 10.0
    cpu_util: float = 0.0
    mem_util: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


def make_timestamp() -> int:
    return int(time.time() * 1000)
