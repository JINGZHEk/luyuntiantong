import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.roadside_perception.stgnn_model import OccAwareSTGNN, get_model_spec


def _read_jsonl(path: str | Path) -> list[dict[str, Any]]:
    rows = []
    with Path(path).open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def _sample_shape(samples: list[dict[str, Any]]) -> tuple[int, int]:
    if not samples:
        return 0, 0
    features = samples[0].get("input_features", [])
    trajectory = samples[0].get("target_trajectory", [])
    return len(features), len(trajectory)


def _validate_samples(samples: list[dict[str, Any]]) -> tuple[int, int]:
    history_length, predict_steps = _sample_shape(samples)
    if not samples:
        raise ValueError("No ST-GNN training samples found")
    if history_length <= 0 or predict_steps <= 0:
        raise ValueError("Samples must contain input_features and target_trajectory")
    for sample in samples:
        if len(sample.get("input_features", [])) != history_length:
            raise ValueError(f"Inconsistent history length in sample {sample.get('sample_id')}")
        if len(sample.get("target_trajectory", [])) != predict_steps:
            raise ValueError(f"Inconsistent predict steps in sample {sample.get('sample_id')}")
    return history_length, predict_steps


def _base_report(args: argparse.Namespace, samples: list[dict[str, Any]]) -> dict[str, Any]:
    history_length, predict_steps = _validate_samples(samples)
    return {
        "samples": str(args.samples),
        "output": str(args.output),
        "sample_count": len(samples),
        "history_length": history_length,
        "predict_steps": predict_steps,
        "epochs": args.epochs,
        "batch_size": args.batch_size,
        "hidden_dim": args.hidden_dim,
        "model": get_model_spec(
            history_length=history_length,
            predict_steps=predict_steps,
            hidden_dim=args.hidden_dim,
        ),
    }


def _train(args: argparse.Namespace, samples: list[dict[str, Any]]) -> dict[str, Any]:
    import torch
    import torch.nn.functional as F
    from torch.utils.data import DataLoader, TensorDataset

    report = _base_report(args, samples)
    history_length = report["history_length"]
    predict_steps = report["predict_steps"]

    features = torch.tensor([sample["input_features"] for sample in samples], dtype=torch.float32)
    trajectories = torch.tensor([sample["target_trajectory"] for sample in samples], dtype=torch.float32)
    occlusion = torch.tensor([int(sample.get("occlusion_label", 0)) for sample in samples], dtype=torch.long)

    dataset = TensorDataset(features, trajectories, occlusion)
    loader = DataLoader(dataset, batch_size=args.batch_size, shuffle=True)
    model = OccAwareSTGNN(hidden_dim=args.hidden_dim, predict_steps=predict_steps)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.learning_rate, weight_decay=args.weight_decay)

    last_loss = math.nan
    model.train()
    for _epoch in range(args.epochs):
        epoch_loss = 0.0
        batch_count = 0
        for batch_features, batch_trajectory, batch_occlusion in loader:
            optimizer.zero_grad()
            pred_traj, pred_occ = model(batch_features)
            traj_loss = F.mse_loss(pred_traj, batch_trajectory)
            occ_loss = F.cross_entropy(pred_occ, batch_occlusion)
            loss = traj_loss + args.occlusion_weight * occ_loss
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), args.gradient_clip)
            optimizer.step()
            epoch_loss += float(loss.item())
            batch_count += 1
        last_loss = epoch_loss / max(1, batch_count)

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    model.eval()
    example = torch.zeros(1, history_length, 8, dtype=torch.float32)
    traced = torch.jit.trace(model, example)
    traced.save(str(output))

    report.update(
        {
            "status": "trained",
            "loss": round(last_loss, 6),
            "trained_checkpoint": str(output),
            "trained": True,
        }
    )
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Train OccAware-STGNN from JSONL supervised samples")
    parser.add_argument("--samples", default="data/stgnn_training/samples.jsonl", help="Training samples JSONL path")
    parser.add_argument("--output", default="models/occaware_stgnn.ts", help="TorchScript checkpoint output path")
    parser.add_argument("--epochs", type=int, default=5, help="Training epochs")
    parser.add_argument("--batch-size", type=int, default=16, help="Mini-batch size")
    parser.add_argument("--hidden-dim", type=int, default=128, help="Model hidden dimension")
    parser.add_argument("--learning-rate", type=float, default=1e-3, help="AdamW learning rate")
    parser.add_argument("--weight-decay", type=float, default=1e-4, help="AdamW weight decay")
    parser.add_argument("--occlusion-weight", type=float, default=0.5, help="Occlusion classification loss weight")
    parser.add_argument("--gradient-clip", type=float, default=1.0, help="Gradient clipping norm")
    parser.add_argument("--dry-run", action="store_true", help="Validate samples and print plan without importing torch")
    args = parser.parse_args()

    samples = _read_jsonl(args.samples)
    if args.dry_run:
        report = _base_report(args, samples)
        report["status"] = "dry_run"
        report["trained"] = False
    else:
        report = _train(args, samples)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
