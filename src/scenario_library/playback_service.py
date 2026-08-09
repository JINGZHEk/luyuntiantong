from __future__ import annotations

import asyncio
import time
import uuid
from typing import Any

from src.vehicle_decision.brake_controller import BrakeController
from src.vehicle_decision.risk_assessor import RiskAssessor

from .compiler import ScenarioCompiler


class ScenarioPlaybackService:
    """Publish compiled scenario frames through the same three MQTT paths as a vehicle."""

    def __init__(
        self,
        repository: Any,
        publisher: Any,
        compiler: ScenarioCompiler | None = None,
        scene_id: str = "intersection-demo",
        roadside_id: str = "mock-roadside-001",
        vehicle_id: str = "vehicle_001",
        clock: Any | None = None,
    ):
        self.repository = repository
        self.publisher = publisher
        self.scene_id = scene_id
        self.roadside_id = roadside_id
        self.vehicle_id = vehicle_id
        self.clock = clock or time.time
        self.compiler = compiler or ScenarioCompiler(repository, scene_id=scene_id)
        self.risk_assessor = RiskAssessor()
        self.brake_controller = BrakeController()
        self._task: asyncio.Task | None = None
        self._scenario_id: str | None = None
        self._run_id: str | None = None
        self._fps = 10.0
        self._loop_enabled = False
        self._random_seed = 42
        self._frame_index = 0
        self._last_timestamp = 0
        self._status = "idle"

    async def start(
        self,
        scenario_id: str,
        fps: float = 10.0,
        loop: bool = False,
        random_seed: int = 42,
    ) -> dict[str, Any]:
        if fps <= 0:
            raise ValueError("fps must be greater than zero")
        if self._task and not self._task.done():
            await self.stop()
        detail = self.repository.get_scenario(scenario_id)
        self._scenario_id = scenario_id
        self._run_id = f"run-{scenario_id}-{uuid.uuid4().hex[:10]}"
        self._fps = float(fps)
        self._loop_enabled = bool(loop)
        self._random_seed = int(random_seed)
        self._frame_index = 0
        self._last_timestamp = int(self.clock() * 1000)
        self._status = "running"
        self.repository.create_run(
            self._run_id,
            scenario_id,
            self._last_timestamp,
            self._fps,
            self._loop_enabled,
            self._random_seed,
            scene_id=self.scene_id,
        )
        self._duration_ms = detail.summary.duration_ms
        self._task = asyncio.create_task(self._run_loop())
        return self.status()

    async def stop(self) -> dict[str, Any]:
        task = self._task
        self._task = None
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        if self._run_id:
            self.repository.update_run(
                self._run_id,
                "stopped",
                ended_at=int(self.clock() * 1000),
                current_frame=self._frame_index,
            )
            self._publish_clear_frame()
        self._status = "stopped" if self._run_id else "idle"
        return self.status()

    async def step_once(self, scenario_id: str | None = None) -> dict[str, Any] | None:
        if scenario_id is not None and scenario_id != self._scenario_id:
            if self._task and not self._task.done():
                await self.stop()
            detail = self.repository.get_scenario(scenario_id)
            self._scenario_id = scenario_id
            self._run_id = f"run-{scenario_id}-{uuid.uuid4().hex[:10]}"
            self._fps = float(detail.summary.default_fps)
            self._loop_enabled = False
            self._random_seed = 42
            self._frame_index = 0
            self._duration_ms = detail.summary.duration_ms
            self._last_timestamp = int(self.clock() * 1000)
            self._status = "running"
            self.repository.create_run(
                self._run_id,
                scenario_id,
                self._last_timestamp,
                self._fps,
                False,
                self._random_seed,
                scene_id=self.scene_id,
            )
        if not self._scenario_id or not self._run_id:
            raise ValueError("scenario_id is required before the first playback step")
        if hasattr(self.publisher, "connected") and not self.publisher.connected:
            return None
        t_ms = min(int(round(self._frame_index * 1000.0 / self._fps)), self._duration_ms)
        timestamp = self._last_timestamp + t_ms
        compiled = self.compiler.compile_at(
            self._scenario_id,
            self._run_id,
            t_ms,
            timestamp,
            self._random_seed,
        )
        decision = self._decision_payload(compiled)
        status = self._status_payload(compiled, decision)
        perception = dict(compiled.perception)
        perception["source"] = {**perception.get("source", {}), "simulation": True}
        self.publisher.publish(
            f"v2x/{self.scene_id}/roadside/{self.roadside_id}/perception",
            perception,
        )
        self.publisher.publish(
            f"v2x/{self.scene_id}/vehicle/{self.vehicle_id}/status",
            status,
        )
        self.publisher.publish(
            f"v2x/{self.scene_id}/vehicle/{self.vehicle_id}/decision",
            decision,
        )
        self._frame_index += 1
        self._status = "running"
        self.repository.update_run(
            self._run_id,
            "running",
            current_frame=self._frame_index,
        )
        if t_ms >= self._duration_ms:
            if self._loop_enabled:
                self._frame_index = 0
                self.repository.update_run(
                    self._run_id,
                    "running",
                    current_frame=self._frame_index,
                )
            else:
                self._status = "completed"
                self.repository.update_run(
                    self._run_id,
                    "completed",
                    ended_at=timestamp,
                    current_frame=self._frame_index,
                )
        return {
            "frame_id": compiled.frame_id,
            "timestamp": timestamp,
            "scenario_id": self._scenario_id,
            "run_id": self._run_id,
            "perception": perception,
            "vehicle_status": status,
            "decision": decision,
            "active_events": list(compiled.active_events),
        }

    def status(self) -> dict[str, Any]:
        return {
            "status": self._status,
            "scenario_id": self._scenario_id,
            "run_id": self._run_id,
            "frame_index": self._frame_index,
            "fps": self._fps,
            "loop": self._loop_enabled,
            "connected": getattr(self.publisher, "connected", True),
        }

    async def _run_loop(self) -> None:
        try:
            while self._status == "running":
                await self.step_once()
                if self._status == "completed":
                    break
                await asyncio.sleep(1.0 / self._fps)
        except asyncio.CancelledError:
            raise

    def _decision_payload(self, compiled: Any) -> dict[str, Any]:
        risk = self.risk_assessor.assess(
            compiled.vehicle_status["position"],
            compiled.vehicle_status["velocity"],
            compiled.perception["objects"],
            {},
        )
        brake = self.brake_controller.compute(
            risk.level,
            compiled.vehicle_status["speed"],
        )
        return {
            "schema_version": 1,
            "message_type": "decision",
            "scene_id": compiled.scene_id,
            "scenario_id": compiled.scenario_id,
            "run_id": compiled.run_id,
            "timestamp": compiled.timestamp,
            "frame_id": compiled.frame_id,
            "vehicle_id": self.vehicle_id,
            "risk_level": risk.level,
            "ttc": risk.ttc,
            "collision_prob": risk.collision_prob,
            "brake_decel": brake.deceleration,
            "target_object": {
                "track_id": risk.target_track_id,
                "class": risk.target_class,
            } if risk.target_track_id is not None else compiled.decision_context["target_object"],
            "mode": "cooperative",
            "fusion_weight": 1.0,
            "source": {"device_type": "scenario_replay", "simulation": True},
            "scenario_event": compiled.decision_context.get("scenario_event"),
        }

    def _status_payload(self, compiled: Any, decision: dict[str, Any]) -> dict[str, Any]:
        status = dict(compiled.vehicle_status)
        status["risk_level"] = decision["risk_level"]
        status["source"] = {**status.get("source", {}), "simulation": True}
        return status

    def _publish_clear_frame(self) -> None:
        if not self._scenario_id or not self._run_id:
            return
        payload = {
            "schema_version": 1,
            "message_type": "perception",
            "scene_id": self.scene_id,
            "scenario_id": self._scenario_id,
            "scenario": self._scenario_id,
            "run_id": self._run_id,
            "timestamp": int(self.clock() * 1000),
            "frame_id": self._frame_index,
            "node_id": self.roadside_id,
            "coordinate_frame": "road_xy",
            "objects": [],
            "source": {"device_type": "scenario_replay", "simulation": True, "clear": True},
        }
        if not hasattr(self.publisher, "connected") or self.publisher.connected:
            self.publisher.publish(
                f"v2x/{self.scene_id}/roadside/{self.roadside_id}/perception",
                payload,
            )
