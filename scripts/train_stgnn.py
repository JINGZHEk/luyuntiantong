import argparse
import json
import math
import random
import sqlite3
import sys
import time
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


def _canonicalize_sample(sample: dict[str, Any]) -> dict[str, Any]:
    if sample.get("input_features") and sample.get("target_trajectory"):
        return sample
    input_seq = sample.get("input_seq", [])
    gt_seq = sample.get("gt_seq", [])
    features = []
    for point in input_seq:
        features.append(
            [
                float(point["x"]),
                float(point["y"]),
                0.0,
                0.0,
                float(point.get("vx", 0.0)),
                float(point.get("vy", 0.0)),
                0.0,
                0.0,
            ]
        )
    return {
        **sample,
        "input_features": features,
        "target_trajectory": [[float(point["x"]), float(point["y"])] for point in gt_seq],
        "occlusion_label": int(sample.get("occlusion_label", 0)),
    }


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
        "requested_device": args.device,
        "model": get_model_spec(
            history_length=history_length,
            predict_steps=predict_steps,
            hidden_dim=args.hidden_dim,
        ),
    }


def _train(args: argparse.Namespace, samples: list[dict[str, Any]]) -> dict[str, Any]:
    import torch
    import torch.nn.functional as F
    from torch.utils.data import DataLoader, Dataset

    samples = [_canonicalize_sample(sample) for sample in samples]
    report = _base_report(args, samples)
    history_length = report["history_length"]
    predict_steps = report["predict_steps"]
    if args.device == "auto":
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    else:
        device = torch.device(args.device)
    if device.type == "cuda" and not torch.cuda.is_available():
        raise RuntimeError(f"CUDA device requested but unavailable: {args.device}")

    randomizer = random.Random(args.seed)
    indices = list(range(len(samples)))
    randomizer.shuffle(indices)
    validation_count = 0 if len(indices) < 2 else max(1, int(round(len(indices) * args.validation_split)))
    validation_indices = indices[:validation_count]
    training_indices = indices[validation_count:] or indices

    class AugmentedDataset(Dataset):
        def __init__(self, selected: list[int], augment: bool):
            self.selected = selected
            self.augment = augment

        def __len__(self):
            return len(self.selected)

        def __getitem__(self, index):
            sample = samples[self.selected[index]]
            features = [list(row) for row in sample["input_features"]]
            target = [list(row) for row in sample["target_trajectory"]]
            if self.augment:
                angle = random.uniform(-args.rotation_deg, args.rotation_deg) * math.pi / 180.0
                cosine, sine = math.cos(angle), math.sin(angle)
                dx = random.uniform(-args.translation_m, args.translation_m)
                dy = random.uniform(-args.translation_m, args.translation_m)
                for row in features:
                    x, y = row[0], row[1]
                    vx, vy = row[4], row[5]
                    row[0] = x * cosine - y * sine + dx + random.gauss(0.0, args.noise_std)
                    row[1] = x * sine + y * cosine + dy + random.gauss(0.0, args.noise_std)
                    row[4] = vx * cosine - vy * sine
                    row[5] = vx * sine + vy * cosine
                for row in target:
                    x, y = row
                    row[0] = x * cosine - y * sine + dx + random.gauss(0.0, args.noise_std)
                    row[1] = x * sine + y * cosine + dy + random.gauss(0.0, args.noise_std)
            return (
                torch.tensor(features, dtype=torch.float32),
                torch.tensor(target, dtype=torch.float32),
                torch.tensor(int(sample.get("occlusion_label", 0)), dtype=torch.long),
            )

    random.seed(args.seed)
    torch.manual_seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(args.seed)
    loader = DataLoader(AugmentedDataset(training_indices, augment=not args.no_augmentation), batch_size=args.batch_size, shuffle=True)
    validation_loader = DataLoader(AugmentedDataset(validation_indices or training_indices, augment=False), batch_size=args.batch_size)
    model = OccAwareSTGNN(hidden_dim=args.hidden_dim, predict_steps=predict_steps).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.learning_rate)

    last_loss = math.nan
    best_ade = math.inf
    best_state = None
    validation_history = []
    model.train()
    for epoch in range(1, args.epochs + 1):
        epoch_loss = 0.0
        batch_count = 0
        for batch_features, batch_trajectory, batch_occlusion in loader:
            batch_features = batch_features.to(device, non_blocking=True)
            batch_trajectory = batch_trajectory.to(device, non_blocking=True)
            batch_occlusion = batch_occlusion.to(device, non_blocking=True)
            optimizer.zero_grad()
            pred_traj, pred_occ = model(batch_features)
            traj_loss = F.mse_loss(pred_traj, batch_trajectory)
            occ_loss = F.cross_entropy(pred_occ, batch_occlusion)
            l2_loss = sum(parameter.pow(2).sum() for parameter in model.parameters())
            loss = traj_loss + args.occlusion_weight * occ_loss + args.l2_weight * l2_loss
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), args.gradient_clip)
            optimizer.step()
            epoch_loss += float(loss.item())
            batch_count += 1
        last_loss = epoch_loss / max(1, batch_count)
        if epoch % args.validate_every == 0 or epoch == args.epochs:
            model.eval()
            displacement_errors = []
            final_errors = []
            with torch.no_grad():
                for batch_features, batch_trajectory, _batch_occlusion in validation_loader:
                    batch_features = batch_features.to(device, non_blocking=True)
                    batch_trajectory = batch_trajectory.to(device, non_blocking=True)
                    predicted, _ = model(batch_features)
                    distances = torch.linalg.vector_norm(predicted - batch_trajectory, dim=-1)
                    displacement_errors.extend(distances.reshape(-1).tolist())
                    final_errors.extend(distances[:, -1].tolist())
            ade = sum(displacement_errors) / max(1, len(displacement_errors))
            fde = sum(final_errors) / max(1, len(final_errors))
            miss_rate = sum(error > args.miss_threshold for error in final_errors) / max(1, len(final_errors))
            validation_history.append(
                {"epoch": epoch, "ade": round(ade, 6), "fde": round(fde, 6), "miss_rate": round(miss_rate, 6)}
            )
            if ade < best_ade:
                best_ade = ade
                best_state = {name: value.detach().cpu().clone() for name, value in model.state_dict().items()}
            model.train()

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    if best_state is not None:
        model.load_state_dict(best_state)
    model = model.cpu().eval()
    scripted = torch.jit.script(model)
    scripted.save(str(output))

    report.update(
        {
            "status": "trained",
            "loss": round(last_loss, 6),
            "trained_checkpoint": str(output),
            "trained": True,
            "training_samples": len(training_indices),
            "validation_samples": len(validation_indices),
            "validation": validation_history[-1] if validation_history else None,
            "validation_history": validation_history,
            "device": str(device),
            "gpu_name": torch.cuda.get_device_name(device) if device.type == "cuda" else None,
        }
    )
    if args.experiments_db:
        experiment_id = _record_experiment(args.experiments_db, args, report)
        report["experiment_id"] = experiment_id
    return report


def _record_experiment(db_path: str, args: argparse.Namespace, report: dict[str, Any]) -> int:
    connection = sqlite3.connect(db_path)
    try:
        connection.execute(
            "CREATE TABLE IF NOT EXISTS experiments ("
            "experiment_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, "
            "hyperparameters TEXT NOT NULL, metrics TEXT NOT NULL, model_path TEXT, created_at INTEGER NOT NULL)"
        )
        cursor = connection.execute(
            "INSERT INTO experiments (name, hyperparameters, metrics, model_path, created_at) VALUES (?, ?, ?, ?, ?)",
            (
                args.experiment_name,
                json.dumps(vars(args), ensure_ascii=False),
                json.dumps(report.get("validation") or {}, ensure_ascii=False),
                str(args.output),
                int(time.time() * 1000),
            ),
        )
        connection.commit()
        return int(cursor.lastrowid)
    finally:
        connection.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Train OccAware-STGNN from JSONL supervised samples")
    parser.add_argument("--samples", default="data/stgnn_training/samples.jsonl", help="Training samples JSONL path")
    parser.add_argument("--output", default="models/occaware_stgnn.ts", help="TorchScript checkpoint output path")
    parser.add_argument("--epochs", type=int, default=100, help="Training epochs")
    parser.add_argument("--batch-size", type=int, default=16, help="Mini-batch size")
    parser.add_argument("--hidden-dim", type=int, default=128, help="Model hidden dimension")
    parser.add_argument("--device", default="auto", help="Training device: auto, cpu, cuda, or cuda:N")
    parser.add_argument("--learning-rate", type=float, default=1e-3, help="AdamW learning rate")
    parser.add_argument("--weight-decay", type=float, default=1e-4, help="Deprecated alias retained for compatibility")
    parser.add_argument("--l2-weight", type=float, default=1e-5, help="Explicit L2 loss weight")
    parser.add_argument("--occlusion-weight", type=float, default=0.5, help="Occlusion classification loss weight")
    parser.add_argument("--gradient-clip", type=float, default=1.0, help="Gradient clipping norm")
    parser.add_argument("--validation-split", type=float, default=0.2, help="Validation sample ratio")
    parser.add_argument("--validate-every", type=int, default=10, help="Validation interval in epochs")
    parser.add_argument("--miss-threshold", type=float, default=2.0, help="FDE threshold counted as a miss")
    parser.add_argument("--translation-m", type=float, default=5.0, help="Maximum random translation")
    parser.add_argument("--rotation-deg", type=float, default=180.0, help="Maximum random rotation")
    parser.add_argument("--noise-std", type=float, default=0.05, help="Gaussian position noise standard deviation")
    parser.add_argument("--no-augmentation", action="store_true", help="Disable trajectory augmentation")
    parser.add_argument("--seed", type=int, default=2026, help="Random seed")
    parser.add_argument("--experiments-db", help="Optional SQLite database used to record the experiment")
    parser.add_argument("--experiment-name", default="occaware-stgnn", help="Experiment display name")
    parser.add_argument("--dry-run", action="store_true", help="Validate samples and print plan without importing torch")
    args = parser.parse_args()

    samples = [_canonicalize_sample(sample) for sample in _read_jsonl(args.samples)]
    if args.dry_run:
        report = _base_report(args, samples)
        report["status"] = "dry_run"
        report["trained"] = False
    else:
        report = _train(args, samples)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
