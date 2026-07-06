import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.dataset import dry_run_stgnn_checkpoint_evaluation, evaluate_stgnn_checkpoint


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate an OccAware-STGNN TorchScript checkpoint")
    parser.add_argument("--samples", default="data/stgnn_training/samples.jsonl", help="ST-GNN samples JSONL path")
    parser.add_argument("--checkpoint", default="models/occaware_stgnn.ts", help="TorchScript checkpoint path")
    parser.add_argument("--output", default="data/mini_split/stgnn_evaluation.json", help="Evaluation report output path")
    parser.add_argument("--batch-size", type=int, default=16, help="Inference batch size")
    parser.add_argument(
        "--occlusion-threshold",
        type=int,
        default=1,
        help="Minimum occlusion_label treated as occluded for Occ-ADE/Occ-Acc",
    )
    parser.add_argument("--dry-run", action="store_true", help="Validate samples and report schema without importing torch")
    args = parser.parse_args()

    if args.dry_run:
        report = dry_run_stgnn_checkpoint_evaluation(
            samples_path=args.samples,
            checkpoint_path=args.checkpoint,
            batch_size=args.batch_size,
        )
    else:
        report = evaluate_stgnn_checkpoint(
            samples_path=args.samples,
            checkpoint_path=args.checkpoint,
            batch_size=args.batch_size,
            occlusion_threshold=args.occlusion_threshold,
        )

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
