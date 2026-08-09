from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ScenarioSummary:
    scenario_id: str
    name: str
    category: str
    description: str
    duration_ms: int
    default_fps: float
    coordinate_frame: str = "road_xy"
    enabled: bool = True
    version: int = 1
    road_layout: dict[str, Any] = field(default_factory=dict)
    environment: dict[str, Any] = field(default_factory=dict)
    expected_outcome: str = ""
    source_refs: tuple[str, ...] = ()


@dataclass(frozen=True)
class ScenarioActor:
    scenario_id: str
    actor_id: str
    track_id: int | None
    role: str
    actor_class: str
    actor_subtype: str | None = None
    dimensions: dict[str, Any] = field(default_factory=dict)
    appearance: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ScenarioKeyframe:
    scenario_id: str
    actor_id: str
    t_ms: int
    position: tuple[float, float]
    velocity: tuple[float, float]
    heading_deg: float
    occlusion_level: int
    confidence: float
    visible: bool
    behavior_state: str


@dataclass(frozen=True)
class ScenarioEventRule:
    scenario_id: str
    event_key: str
    event_order: int
    t_ms: int
    event_type: str
    severity: str
    description: str
    involved_actor_ids: tuple[str, ...]
    expected_decision: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ScenarioDetail:
    summary: ScenarioSummary
    actors: tuple[ScenarioActor, ...]
    keyframes: tuple[ScenarioKeyframe, ...]
    events: tuple[ScenarioEventRule, ...]

    @property
    def template(self) -> ScenarioSummary:
        return self.summary
