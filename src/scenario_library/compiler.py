from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass
from typing import Any

from .models import ScenarioActor, ScenarioDetail, ScenarioEventRule, ScenarioKeyframe


SCENE_ID = "intersection-demo"


@dataclass(frozen=True)
class CompiledFrame:
    frame_id: int
    timestamp: int
    scene_id: str
    scenario_id: str
    run_id: str
    perception: dict[str, Any]
    vehicle_status: dict[str, Any]
    decision_context: dict[str, Any]
    active_events: tuple[dict[str, Any], ...]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, sort_keys=True, separators=(",", ":"))


class ScenarioCompiler:
    """Compile SQLite keyframes into deterministic protocol-ready snapshots."""

    def __init__(self, repository: Any, scene_id: str = SCENE_ID):
        self.repository = repository
        self.scene_id = scene_id

    def compile_at(
        self,
        scenario_id: str,
        run_id: str,
        t_ms: int,
        timestamp: int,
        random_seed: int = 42,
    ) -> CompiledFrame:
        del random_seed  # Reserved for deterministic scenario variations.
        detail: ScenarioDetail = self.repository.get_scenario(scenario_id)
        if t_ms < 0 or t_ms > detail.summary.duration_ms:
            raise ValueError(
                f"t_ms={t_ms} outside scenario {scenario_id} "
                f"[0, {detail.summary.duration_ms}]"
            )

        keyframes_by_actor: dict[str, list[ScenarioKeyframe]] = {}
        for keyframe in detail.keyframes:
            keyframes_by_actor.setdefault(keyframe.actor_id, []).append(keyframe)
        for frames in keyframes_by_actor.values():
            frames.sort(key=lambda item: item.t_ms)

        states: dict[str, ScenarioKeyframe] = {}
        for actor in detail.actors:
            frames = keyframes_by_actor.get(actor.actor_id, [])
            if not frames:
                raise ValueError(f"Scenario {scenario_id} actor {actor.actor_id} has no keyframes")
            states[actor.actor_id] = self._interpolate(frames, t_ms)

        active_events = tuple(
            self._event_to_dict(event)
            for event in detail.events
            if event.t_ms <= t_ms
        )
        current_event = active_events[-1] if active_events else None
        ego = next((actor for actor in detail.actors if actor.role == "ego"), None)
        if ego is None:
            raise ValueError(f"Scenario {scenario_id} has no ego actor")
        ego_state = states[ego.actor_id]
        target = next(
            (actor for actor in detail.actors if actor.role == "target"),
            next((actor for actor in detail.actors if actor.role == "conflict"), None),
        )
        target_descriptor = (
            {"track_id": target.track_id, "class": target.actor_class}
            if target is not None
            else None
        )

        objects = []
        for actor in detail.actors:
            if actor.role == "ego":
                continue
            state = states[actor.actor_id]
            if not state.visible:
                continue
            obj = {
                "track_id": actor.track_id,
                "class": actor.actor_class,
                "bbox": [0, 0, 0, 0],
                "world_pos": [round(state.position[0], 6), round(state.position[1], 6)],
                "velocity": [round(state.velocity[0], 6), round(state.velocity[1], 6)],
                "heading": round(state.heading_deg % 360.0, 6),
                "confidence": round(state.confidence, 6),
                "occlusion_level": state.occlusion_level,
                "predicted_traj": [],
                "coordinate_status": "valid",
                "actor_id": actor.actor_id,
            }
            if actor.actor_subtype is not None:
                obj["subtype"] = actor.actor_subtype
            objects.append(obj)

        perception = {
            "schema_version": 1,
            "message_type": "perception",
            "scene_id": self.scene_id,
            "scenario_id": scenario_id,
            "scenario": scenario_id,
            "run_id": run_id,
            "timestamp": timestamp,
            "frame_id": self._frame_id(t_ms),
            "node_id": "mock-roadside-001",
            "coordinate_frame": "road_xy",
            "objects": objects,
            "source": {
                "device_type": "scenario_replay",
                "input_type": "sqlite",
                "simulation": True,
                "node_id": "mock-roadside-001",
            },
        }
        ego_velocity = [round(ego_state.velocity[0], 6), round(ego_state.velocity[1], 6)]
        vehicle_status = {
            "schema_version": 1,
            "message_type": "vehicle_status",
            "scene_id": self.scene_id,
            "scenario_id": scenario_id,
            "run_id": run_id,
            "timestamp": timestamp,
            "frame_id": self._frame_id(t_ms),
            "vehicle_id": "vehicle_001",
            "position": [round(ego_state.position[0], 6), round(ego_state.position[1], 6)],
            "velocity": ego_velocity,
            "heading": round(ego_state.heading_deg % 360.0, 6),
            "speed": round(math.hypot(*ego_state.velocity), 6),
            "acceleration": [0.0, 0.0],
            "mode": "cooperative",
            "risk_level": "SAFE",
            "source": {
                "device_type": "scenario_replay",
                "input_type": "sqlite",
                "simulation": True,
            },
        }
        decision_context = {
            "scenario_id": scenario_id,
            "run_id": run_id,
            "target_object": target_descriptor,
            "scenario_event": current_event,
        }
        return CompiledFrame(
            frame_id=self._frame_id(t_ms),
            timestamp=timestamp,
            scene_id=self.scene_id,
            scenario_id=scenario_id,
            run_id=run_id,
            perception=perception,
            vehicle_status=vehicle_status,
            decision_context=decision_context,
            active_events=active_events,
        )

    @staticmethod
    def _frame_id(t_ms: int) -> int:
        return max(0, int(round(t_ms / 100.0)))

    @staticmethod
    def _interpolate(frames: list[ScenarioKeyframe], t_ms: int) -> ScenarioKeyframe:
        if t_ms <= frames[0].t_ms:
            return frames[0]
        if t_ms >= frames[-1].t_ms:
            return frames[-1]
        right_index = next(index for index, frame in enumerate(frames) if frame.t_ms >= t_ms)
        right = frames[right_index]
        left = frames[right_index - 1]
        if right.t_ms == left.t_ms:
            return right
        dt_ms = right.t_ms - left.t_ms
        u = (t_ms - left.t_ms) / dt_ms
        dt_seconds = dt_ms / 1000.0
        position = ScenarioCompiler._hermite_position(left, right, u, dt_seconds)
        velocity = ScenarioCompiler._hermite_velocity(left, right, u, dt_seconds)
        heading_delta = (right.heading_deg - left.heading_deg + 180.0) % 360.0 - 180.0
        heading = left.heading_deg + heading_delta * u
        confidence = left.confidence + (right.confidence - left.confidence) * u
        discrete = right if u > 0.0 else left
        return ScenarioKeyframe(
            scenario_id=left.scenario_id,
            actor_id=left.actor_id,
            t_ms=t_ms,
            position=position,
            velocity=velocity,
            heading_deg=heading,
            occlusion_level=discrete.occlusion_level,
            confidence=confidence,
            visible=discrete.visible,
            behavior_state=discrete.behavior_state,
        )

    @staticmethod
    def _hermite_position(
        left: ScenarioKeyframe,
        right: ScenarioKeyframe,
        u: float,
        dt_seconds: float,
    ) -> tuple[float, float]:
        h00 = 2 * u**3 - 3 * u**2 + 1
        h10 = u**3 - 2 * u**2 + u
        h01 = -2 * u**3 + 3 * u**2
        h11 = u**3 - u**2
        return tuple(
            h00 * left.position[index]
            + h10 * dt_seconds * left.velocity[index]
            + h01 * right.position[index]
            + h11 * dt_seconds * right.velocity[index]
            for index in (0, 1)
        )

    @staticmethod
    def _hermite_velocity(
        left: ScenarioKeyframe,
        right: ScenarioKeyframe,
        u: float,
        dt_seconds: float,
    ) -> tuple[float, float]:
        dh00 = 6 * u**2 - 6 * u
        dh10 = 3 * u**2 - 4 * u + 1
        dh01 = -6 * u**2 + 6 * u
        dh11 = 3 * u**2 - 2 * u
        return tuple(
            (
                dh00 * left.position[index]
                + dh10 * dt_seconds * left.velocity[index]
                + dh01 * right.position[index]
                + dh11 * dt_seconds * right.velocity[index]
            )
            / dt_seconds
            for index in (0, 1)
        )

    @staticmethod
    def _event_to_dict(event: ScenarioEventRule) -> dict[str, Any]:
        return {
            "scenario_id": event.scenario_id,
            "event_key": event.event_key,
            "event_order": event.event_order,
            "t_ms": event.t_ms,
            "event_type": event.event_type,
            "severity": event.severity,
            "description": event.description,
            "involved_actor_ids": list(event.involved_actor_ids),
            "expected_decision": event.expected_decision,
        }
