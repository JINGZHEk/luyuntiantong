import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.dataset import export_stgnn_training_data


def main() -> None:
    parser = argparse.ArgumentParser(description="Build OccAware-STGNN supervised samples from a replay clip")
    parser.add_argument("--clip", default="data/mini_split/replay/clip_001.json", help="Replay clip JSON path")
    parser.add_argument("--output", default="data/stgnn_training", help="Output directory")
    parser.add_argument("--history-length", type=int, default=8, help="Observation history length")
    parser.add_argument("--predict-steps", type=int, default=30, help="Future prediction steps")
    parser.add_argument("--fps", type=float, default=10.0, help="Replay frame rate")
    parser.add_argument(
        "--target-class",
        action="append",
        dest="target_classes",
        help="Class to include; repeat for multiple classes. Defaults to all classes.",
    )
    args = parser.parse_args()

    manifest = export_stgnn_training_data(
        clip_path=args.clip,
        output_dir=args.output,
        history_length=args.history_length,
        predict_steps=args.predict_steps,
        fps=args.fps,
        target_classes=args.target_classes,
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
