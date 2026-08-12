import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.dataset import export_standardized_stgnn_training_data, export_stgnn_training_data


def main() -> None:
    parser = argparse.ArgumentParser(description="Build OccAware-STGNN supervised samples from a replay clip")
    parser.add_argument("--clip", default="data/mini_split/replay/clip_001.json", help="Replay clip JSON path")
    parser.add_argument("--database", help="Scenario-library SQLite path")
    parser.add_argument("--json", dest="json_source", help="Standardized or frame-oriented JSON/JSONL path")
    parser.add_argument("--scenario-id", help="Optional scenario filter for SQLite sources")
    parser.add_argument("--output", default="data/stgnn_training", help="Output directory")
    parser.add_argument("--history-length", type=int, default=8, help="Observation history length")
    parser.add_argument("--predict-steps", type=int, default=30, help="Future prediction steps")
    parser.add_argument("--fps", type=float, default=10.0, help="Replay frame rate")
    parser.add_argument("--input-steps", type=int, default=20, help="Standardized observation steps")
    parser.add_argument("--future-steps", type=int, default=20, help="Standardized ground-truth steps")
    parser.add_argument("--stride", type=int, default=1, help="Standardized sample window stride")
    parser.add_argument(
        "--target-class",
        action="append",
        dest="target_classes",
        help="Class to include; repeat for multiple classes. Defaults to all classes.",
    )
    args = parser.parse_args()

    standardized_source = args.database or args.json_source
    if standardized_source:
        manifest = export_standardized_stgnn_training_data(
            source_path=standardized_source,
            source_type="sqlite" if args.database else "json",
            scenario_id=args.scenario_id,
            output_dir=args.output,
            input_steps=args.input_steps,
            future_steps=args.future_steps,
            stride=args.stride,
            sample_hz=args.fps,
        )
    else:
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
