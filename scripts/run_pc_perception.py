"""Run the hardware-independent PC perception publisher."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.roadside_perception.frame_source import (  # noqa: E402
    ImageSequenceFrameSource,
    OpenCVFrameSource,
)
from src.roadside_perception.roadside_agent import RoadsideAgent  # noqa: E402
from src.utils import get_config_path, load_config  # noqa: E402


def build_frame_source(config: dict[str, Any]):
    input_config = config.get("input", {})
    input_type = str(input_config.get("type", "video")).lower()
    source = input_config.get("path", input_config.get("device", 0))
    fps = input_config.get("fps", config.get("replay", {}).get("fps", 10))

    if input_type == "video":
        return OpenCVFrameSource(source=source, fps=fps)
    if input_type == "camera":
        return OpenCVFrameSource(source=int(source), fps=fps)
    if input_type == "image_sequence":
        return ImageSequenceFrameSource(root=source, fps=fps)
    raise ValueError(f"unsupported input type: {input_type}")


def run(
    config_path: str | None = None,
    max_frames: int | None = None,
    fps: float | None = None,
) -> int:
    config = load_config(config_path or get_config_path("roadside.pc.yaml"))
    if fps is not None:
        config.setdefault("input", {})["fps"] = fps
        config.setdefault("replay", {})["fps"] = fps
    source = build_frame_source(config)
    agent = RoadsideAgent(config_path=config_path or get_config_path("roadside.pc.yaml"))
    processed = 0

    agent.start()
    try:
        for frame_data in source:
            agent.process_frame(frame_data)
            processed += 1
            if max_frames is not None and processed >= max_frames:
                break
    finally:
        agent.stop()
    return processed


def main() -> None:
    parser = argparse.ArgumentParser(description="PC YOLO + DeepSORT perception publisher")
    parser.add_argument("--config", default=None, help="Roadside config path")
    parser.add_argument("--max-frames", type=int, default=None, help="Stop after N frames")
    parser.add_argument("--fps", type=float, default=None, help="Override input FPS")
    args = parser.parse_args()
    processed = run(config_path=args.config, max_frames=args.max_frames, fps=args.fps)
    print(f"PC perception stopped after {processed} frames")


if __name__ == "__main__":
    main()
