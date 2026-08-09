import asyncio
import time
from typing import Awaitable, Callable, Optional

from src.cloud_twin.data_store import DataStore
from src.scenario_library.playback_service import ScenarioPlaybackService
from src.scenario_library.repository import ScenarioRepository
from src.utils import setup_logger

Broadcaster = Callable[[str, dict], Awaitable[None]]

LEGACY_SCENARIO_ALIASES = {
    "light": "GP-03",
    "moderate": "GP-01",
    "heavy": "GP-05",
}

DEMO_SCENARIOS = {
    "light": {
        "label": "Light",
        "vehicle_speed": 6.5,
        "vehicle_step": 0.58,
        "pedestrian_reveal_frame": 18,
        "pedestrian_cross_rate": 0.09,
        "pedestrian_fast_frame": 48,
        "brake_decay": 0.28,
        "ttc_bias": 4.0,
        "event_frames": (66,),
    },
    "moderate": {
        "label": "Moderate",
        "vehicle_speed": 8.0,
        "vehicle_step": 0.72,
        "pedestrian_reveal_frame": 12,
        "pedestrian_cross_rate": 0.13,
        "pedestrian_fast_frame": 38,
        "brake_decay": 0.22,
        "ttc_bias": 3.0,
        "event_frames": (42, 54, 66),
    },
    "heavy": {
        "label": "Heavy",
        "vehicle_speed": 9.5,
        "vehicle_step": 0.9,
        "pedestrian_reveal_frame": 8,
        "pedestrian_cross_rate": 0.17,
        "pedestrian_fast_frame": 30,
        "brake_decay": 0.18,
        "ttc_bias": 1.8,
        "event_frames": (36, 42, 54, 66),
    },
}


def normalize_scenario(scenario: str | None) -> str:
    if scenario in DEMO_SCENARIOS:
        return scenario
    return "moderate"


def _risk_from_ttc(ttc: float) -> tuple[str, float]:
    if ttc <= 0.9:
        return "EMERGENCY", 8.0
    if ttc <= 2.0:
        return "DANGER", 5.0
    if ttc <= 4.0:
        return "WARNING", 2.0
    return "SAFE", 0.0


def _predicted_traj(x: float, y: float, vy: float, steps: int = 10) -> list[list[float]]:
    return [[round(x, 2), round(y + vy * 0.1 * i, 2)] for i in range(1, steps + 1)]


def generate_demo_frame(
    frame_index: int,
    timestamp: int,
    scene_id: str = "scene_001",
    scenario: str = "moderate",
) -> dict:
    """Create one deterministic ghost-probe demo frame."""
    scenario = normalize_scenario(scenario)
    config = DEMO_SCENARIOS[scenario]
    vehicle_speed = max(0.0, config["vehicle_speed"] - max(0, frame_index - 45) * config["brake_decay"])
    vehicle_x = max(4.0, 50.0 - frame_index * config["vehicle_step"])
    reveal_frame = config["pedestrian_reveal_frame"]
    pedestrian_visible = frame_index >= reveal_frame
    pedestrian_y = (
        5.0
        if frame_index < reveal_frame
        else max(-0.8, 5.0 - (frame_index - reveal_frame) * config["pedestrian_cross_rate"])
    )
    pedestrian_vy = -1.3 if frame_index >= config["pedestrian_fast_frame"] else -0.5
    distance = max(0.6, abs(vehicle_x - 15.0))
    ttc = round(distance / max(vehicle_speed, 0.1), 2)
    if frame_index < 28:
        ttc = round(min(8.0, ttc + config["ttc_bias"]), 2)

    risk_level, brake_decel = _risk_from_ttc(ttc)
    frame_id = frame_index

    objects = [
        {
            "track_id": 100,
            "class": "car",
            "bbox": [300, 200, 180, 80],
            "world_pos": [15.0, 3.0],
            "velocity": [0.0, 0.0],
            "confidence": 0.98,
            "occlusion_level": 0,
            "predicted_traj": [[15.0, 3.0] for _ in range(10)],
        }
    ]
    if pedestrian_visible:
        occlusion_level = 3 if frame_index < 28 else 2 if frame_index < 40 else 1 if frame_index < 50 else 0
        objects.append(
            {
                "track_id": 1,
                "class": "person",
                "bbox": [350, 150, 40, 100],
                "world_pos": [15.0, round(pedestrian_y, 2)],
                "velocity": [0.0, pedestrian_vy],
                "confidence": 0.62 if occlusion_level >= 2 else 0.92,
                "occlusion_level": occlusion_level,
                "predicted_traj": _predicted_traj(15.0, pedestrian_y, pedestrian_vy),
            }
        )

    perception = {
        "timestamp": timestamp,
        "frame_id": frame_id,
        "scenario": scenario,
        "node_id": "roadside_001",
        "objects": objects,
        "processing_time_ms": 28.0 + (frame_index % 7),
    }
    vehicle_status = {
        "timestamp": timestamp,
        "frame_id": frame_id,
        "vehicle_id": "vehicle_001",
        "scenario": scenario,
        "position": [round(vehicle_x, 2), 0.0],
        "velocity": [round(-vehicle_speed, 2), 0.0],
        "heading": 180.0,
        "speed": round(vehicle_speed, 2),
        "acceleration": [-brake_decel, 0.0],
        "mode": "cooperative",
        "risk_level": risk_level,
    }
    decision = {
        "timestamp": timestamp,
        "frame_id": frame_id,
        "scenario": scenario,
        "vehicle_id": "vehicle_001",
        "risk_level": risk_level,
        "ttc": ttc,
        "collision_prob": round(max(0.02, min(0.98, 1.0 - ttc / 6.0)), 2),
        "brake_decel": brake_decel,
        "target_object": {"track_id": 1, "class": "person"} if pedestrian_visible else None,
        "mode": "cooperative",
        "fusion_weight": 1.0,
    }

    event = None
    if frame_index in config["event_frames"] and risk_level in ("DANGER", "EMERGENCY"):
        event = {
            "event_id": f"evt_demo_{scenario}_{frame_index:04d}",
            "timestamp": timestamp,
            "event_type": "ghost_probe",
            "severity": "critical" if risk_level == "EMERGENCY" else "high",
            "scene_id": scene_id,
            "scenario": scenario,
            "min_ttc": ttc,
            "outcome": "avoided" if brake_decel > 0 else "pending",
            "description": f"Demo ghost-probe event: TTC={ttc:.1f}s, risk={risk_level}",
            "involved_objects": [
                {"type": "vehicle", "id": "vehicle_001"},
                {"type": "pedestrian", "track_id": 1},
            ],
            "replay_start_frame": max(0, frame_index - 20),
            "replay_end_frame": frame_index + 20,
        }

    return {
        "frame_id": frame_id,
        "timestamp": timestamp,
        "scene_id": scene_id,
        "scenario": scenario,
        "perception": perception,
        "vehicle_status": vehicle_status,
        "decision": decision,
        "event": event,
    }


class DemoEngine:
    def __init__(
        self,
        store: DataStore,
        broadcaster: Broadcaster,
        scene_id: str = "scene_001",
        scenario_repository: ScenarioRepository | None = None,
    ):
        self.store = store
        self.broadcaster = broadcaster
        self.scene_id = scene_id
        self.scenario = "moderate"
        self.scenario_id: str | None = None
        self.logger = setup_logger("cloud.demo")
        self.frame_index = 0
        self.running = False
        self.fps = 10.0
        self._task: Optional[asyncio.Task] = None
        self.scenario_repository = scenario_repository
        self._scenario_playback: ScenarioPlaybackService | None = None
        self._library_mode = False
        if scenario_repository is not None:
            self._scenario_playback = ScenarioPlaybackService(
                repository=scenario_repository,
                publisher=_DemoPublisher(store, broadcaster, scene_id),
                scene_id=scene_id,
            )

    def status(self) -> dict:
        playback_status = self._scenario_playback.status() if self._scenario_playback else {}
        return {
            "running": playback_status.get("status") == "running" if self._library_mode else self.running,
            "frame_index": playback_status.get("frame_index", self.frame_index),
            "scene_id": self.scene_id,
            "scenario": self.scenario,
            "scenario_id": getattr(self, "scenario_id", None),
            "run_id": playback_status.get("run_id"),
            "available_scenarios": list(DEMO_SCENARIOS.keys()) + (
                [item.scenario_id for item in self.scenario_repository.list_scenarios()]
                if self.scenario_repository is not None else []
            ),
            "fps": self.fps,
        }

    async def step_once(self, scenario: str | None = None, scenario_id: str | None = None) -> dict:
        selected = scenario_id or scenario
        if scenario_id is not None:
            use_library = self._is_library_scenario(scenario_id)
        elif scenario is not None:
            use_library = self._is_library_scenario(scenario)
        else:
            use_library = self._library_mode
        if self._scenario_playback and use_library:
            self._library_mode = True
            if selected:
                self.scenario_id = selected
                self.scenario = selected
            result = await self._scenario_playback.step_once(getattr(self, "scenario_id", None))
            if result is not None:
                self.frame_index = self._scenario_playback.status()["frame_index"]
            await asyncio.sleep(0)
            return self.status()
        if scenario is not None:
            self.scenario = normalize_scenario(scenario)
        self._library_mode = False
        self.scenario_id = LEGACY_SCENARIO_ALIASES.get(self.scenario)
        timestamp = int(time.time() * 1000)
        frame = generate_demo_frame(self.frame_index, timestamp, self.scene_id, self.scenario)
        self.store.store_frame(
            frame_id=frame["frame_id"],
            timestamp=frame["timestamp"],
            scene_id=frame["scene_id"],
            node_id=frame["perception"]["node_id"],
            perception=frame["perception"],
            decision=frame["decision"],
            vehicle_status=frame["vehicle_status"],
        )

        await self.broadcaster("perception", frame["perception"])
        await self.broadcaster("vehicle_status", frame["vehicle_status"])
        await self.broadcaster("decision", frame["decision"])

        if frame["event"]:
            self.store.store_event(frame["event"])
            await self.broadcaster("event", frame["event"])

        self.frame_index = (self.frame_index + 1) % 120
        return self.status()

    async def start(
        self,
        fps: float = 10.0,
        scenario: str | None = None,
        scenario_id: str | None = None,
        loop: bool = False,
        random_seed: int = 42,
    ) -> dict:
        self.fps = max(1.0, min(float(fps), 30.0))
        selected = scenario_id or scenario or self.scenario
        if self._scenario_playback and self._is_library_scenario(selected):
            if self._task and not self._task.done():
                await self.stop()
            self._library_mode = True
            self.scenario_id = selected
            self.scenario = selected
            self.running = True
            await self._scenario_playback.start(
                selected,
                fps=self.fps,
                loop=loop,
                random_seed=random_seed,
            )
            return self.status()
        self.scenario = normalize_scenario(selected)
        if self._library_mode:
            await self.stop()
        elif self._task and not self._task.done():
            await self.stop()
        self._library_mode = False
        self.scenario_id = LEGACY_SCENARIO_ALIASES.get(self.scenario)
        if self.running:
            return self.status()
        self.running = True
        self._task = asyncio.create_task(self._run_loop())
        return self.status()

    async def stop(self) -> dict:
        if self._library_mode and self._scenario_playback:
            await self._scenario_playback.stop()
            self._library_mode = False
            self.running = False
            return self.status()
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        return self.status()

    async def _run_loop(self):
        delay = 1.0 / self.fps
        try:
            while self.running:
                await self.step_once()
                await asyncio.sleep(delay)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            self.running = False
            self.logger.error(f"Demo loop stopped: {exc}")

    def _is_library_scenario(self, scenario_id: str | None) -> bool:
        if not scenario_id or self.scenario_repository is None:
            return False
        return any(item.scenario_id == scenario_id for item in self.scenario_repository.list_scenarios())


class _DemoPublisher:
    """Bridge synchronous playback MQTT publishes to API broadcast and storage."""

    connected = True

    def __init__(self, store: DataStore, broadcaster: Broadcaster, scene_id: str):
        self.store = store
        self.broadcaster = broadcaster
        self.scene_id = scene_id

    def publish(self, topic: str, payload: dict):
        frame_id = payload.get("frame_id", 0)
        run_id = payload.get("run_id", "legacy-run")
        message_type = "perception" if topic.endswith("/perception") else (
            "vehicle_status" if topic.endswith("/status") else "decision"
        )
        kwargs = {message_type if message_type != "vehicle_status" else "vehicle_status": payload}
        self.store.store_frame(
            frame_id=frame_id,
            timestamp=payload.get("timestamp", int(time.time() * 1000)),
            scene_id=payload.get("scene_id", self.scene_id),
            node_id=payload.get("node_id"),
            run_id=run_id,
            **kwargs,
        )
        asyncio.create_task(self.broadcaster(message_type, payload))
