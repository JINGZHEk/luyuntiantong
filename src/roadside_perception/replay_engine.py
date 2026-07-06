"""
Replay Engine - Replays dataset clips frame-by-frame, driving the entire system.
Publishes each frame to the roadside agent at configurable FPS.
"""
import time
import json
import argparse
import numpy as np
from pathlib import Path
from typing import Generator

from src.utils import load_config, get_config_path, setup_logger
from src.communication import MQTTClient, make_timestamp
from src.roadside_perception.roadside_agent import RoadsideAgent


class ReplayEngine:
    """Drives the V2X system by replaying pre-recorded scene data."""

    def __init__(self, clip_path: str = None, fps: float = 10.0, config_path: str = None):
        self.logger = setup_logger("replay_engine", log_dir="logs")
        config = load_config(config_path or get_config_path("roadside.yaml"))
        self.fps = fps or config.get("replay", {}).get("fps", 10.0)
        self.clip_path = clip_path or str(
            Path(config.get("replay", {}).get("data_dir", "data/mini_split/replay")) / "clip_001"
        )
        self.dt = 1.0 / self.fps
        self._running = False

    def load_clip(self, clip_path: str = None) -> list:
        """
        Load a clip's frame data. Supports two formats:
        1. Directory with per-frame JSON files
        2. Single JSON file with all frames
        """
        path = Path(clip_path or self.clip_path)

        if path.is_file() and path.suffix == ".json":
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return data if isinstance(data, list) else data.get("frames", [])

        if path.is_dir():
            frames = []
            frame_files = sorted(path.glob("*.json"))
            for ff in frame_files:
                with open(ff, 'r', encoding='utf-8') as f:
                    frames.append(json.load(f))
            if frames:
                return frames

        # Generate synthetic demo data if no real data available
        self.logger.warning(f"No data found at {path}, generating synthetic demo")
        return self._generate_synthetic_clip()

    def _generate_synthetic_clip(self, num_frames: int = 100) -> list:
        """Generate a synthetic ghost-probe scenario for demonstration."""
        frames = []
        np.random.seed(42)

        # Scenario: pedestrian hidden behind parked car, then emerges into road
        # Vehicle approaches from x=50 towards x=0 at 8 m/s
        # Pedestrian starts at y=5 (sidewalk), moves to y=0 (road center)
        trigger_frame = 40  # Frame where pedestrian enters road

        for i in range(num_frames):
            t = i * self.dt
            frame_id = i

            annotations = []

            # Parked car (static occlusion source)
            annotations.append({
                "track_id": 100,
                "class": "car",
                "bbox": [300, 200, 180, 80],
                "world_pos": [15.0, 3.0],
                "velocity": [0.0, 0.0],
                "confidence": 0.98,
            })

            # Pedestrian trajectory
            if i >= 20:  # Pedestrian appears at frame 20
                progress = (i - 20) / 80.0
                ped_x = 15.0 + np.random.normal(0, 0.05)

                if i < trigger_frame:
                    ped_y = 5.0 - (i - 20) * 0.1  # Approaching road edge
                    occlusion = 3 if i < 30 else 2
                else:
                    ped_y = 5.0 - (trigger_frame - 20) * 0.1 - (i - trigger_frame) * 0.15
                    occlusion = 1 if i < 50 else 0

                ped_vy = -1.2 if i >= trigger_frame else -0.5
                annotations.append({
                    "track_id": 1,
                    "class": "person",
                    "bbox": [350, 150, 40, 100],
                    "world_pos": [round(ped_x, 2), round(ped_y, 2)],
                    "velocity": [0.0, round(ped_vy, 2)],
                    "confidence": 0.6 if occlusion >= 2 else 0.9,
                })

            frames.append({
                "frame_id": frame_id,
                "timestamp": make_timestamp() + int(i * self.dt * 1000),
                "annotations": annotations,
            })

        return frames

    def run(self, roadside_agent: 'RoadsideAgent'):
        """Run the replay, feeding frames to the roadside agent."""
        frames = self.load_clip()
        if not frames:
            self.logger.error("No frames to replay")
            return

        self.logger.info(f"Replaying {len(frames)} frames at {self.fps} FPS")
        self._running = True

        for i, frame in enumerate(frames):
            if not self._running:
                break

            frame.setdefault("frame_id", i)
            frame.setdefault("timestamp", make_timestamp())

            roadside_agent.process_frame(frame)

            # Maintain frame rate
            time.sleep(self.dt)

            if (i + 1) % 10 == 0:
                self.logger.info(f"Frame {i + 1}/{len(frames)}")

        self.logger.info("Replay complete")
        self._running = False

    def stop(self):
        self._running = False


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="V2X Replay Engine")
    parser.add_argument("--clip", default=None, help="Path to clip data")
    parser.add_argument("--fps", type=float, default=10.0, help="Replay FPS")
    parser.add_argument("--config", default=None, help="Roadside config path")
    args = parser.parse_args()

    # Create and start roadside agent
    agent = RoadsideAgent(config_path=args.config)
    agent.start()

    # Run replay
    engine = ReplayEngine(clip_path=args.clip, fps=args.fps, config_path=args.config)
    try:
        engine.run(agent)
    except KeyboardInterrupt:
        engine.stop()
    finally:
        agent.stop()
