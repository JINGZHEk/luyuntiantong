import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.roadside_perception.stgnn_model import export_torchscript_checkpoint, get_model_spec


def main() -> None:
    parser = argparse.ArgumentParser(description="Export an OccAware-STGNN TorchScript checkpoint")
    parser.add_argument("--output", default="models/occaware_stgnn.ts", help="TorchScript checkpoint output path")
    parser.add_argument("--history-length", type=int, default=8, help="Observation history length")
    parser.add_argument("--predict-steps", type=int, default=30, help="Future trajectory steps")
    parser.add_argument("--hidden-dim", type=int, default=128, help="Hidden feature dimension")
    parser.add_argument("--seed", type=int, default=2026, help="Deterministic initialization seed")
    parser.add_argument("--describe", action="store_true", help="Print model spec without importing torch")
    args = parser.parse_args()

    spec = get_model_spec(
        history_length=args.history_length,
        predict_steps=args.predict_steps,
        hidden_dim=args.hidden_dim,
    )
    if args.describe:
        print(json.dumps(spec, ensure_ascii=False, indent=2))
        return

    output = export_torchscript_checkpoint(
        output_path=args.output,
        history_length=args.history_length,
        predict_steps=args.predict_steps,
        hidden_dim=args.hidden_dim,
        seed=args.seed,
    )
    result = dict(spec)
    result["output"] = str(output)
    result["trained"] = False
    result["note"] = "This checkpoint is randomly initialized for integration testing; train before reporting metrics."
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
