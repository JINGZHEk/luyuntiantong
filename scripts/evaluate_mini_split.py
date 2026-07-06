import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.dataset import evaluate_replay_clip, evaluate_replay_directory


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate a DAIR mini split replay clip")
    parser.add_argument("--clip", default="data/mini_split/replay/clip_001.json", help="Replay clip JSON path")
    parser.add_argument("--replay-dir", help="Evaluate all replay clip JSON files in this directory")
    parser.add_argument("--output", default="data/mini_split/evaluation.json", help="Evaluation report output path")
    parser.add_argument("--horizon", type=int, default=30, help="Prediction horizon in frames")
    parser.add_argument(
        "--occlusion-threshold",
        type=int,
        default=1,
        help="Minimum occlusion_level treated as occluded for Occ-ADE/Occ-Acc",
    )
    args = parser.parse_args()

    if args.replay_dir:
        report = evaluate_replay_directory(
            replay_dir=args.replay_dir,
            horizon=args.horizon,
            occlusion_threshold=args.occlusion_threshold,
        )
    else:
        report = evaluate_replay_clip(
            clip_path=args.clip,
            horizon=args.horizon,
            occlusion_threshold=args.occlusion_threshold,
        )
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
