import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.verify_m2_demo_sample import verify_m2_demo_sample
from scripts.verify_model_readiness import build_readiness_report


def _run_json_command(command: list[str]) -> dict[str, Any]:
    result = subprocess.run(
        command,
        cwd=PROJECT_ROOT,
        text=True,
        capture_output=True,
        check=True,
        encoding="utf-8",
        errors="replace",
    )
    return json.loads(result.stdout)


def _target_status_by_key(report: dict[str, Any]) -> dict[str, str]:
    return {
        item["key"]: item["status"]
        for item in report.get("targetStatus", [])
        if isinstance(item, dict) and "key" in item and "status" in item
    }


def verify_algorithm_pipeline(
    work_dir: str | Path,
    frames: int = 60,
    horizon: int = 30,
    real_stgnn: bool = False,
    python_executable: str | None = None,
    epochs: int = 8,
    batch_size: int = 4,
    hidden_dim: int = 32,
) -> dict[str, Any]:
    root = Path(work_dir)
    root.mkdir(parents=True, exist_ok=True)
    interpreter = python_executable or sys.executable

    m2_summary = verify_m2_demo_sample(work_dir=root, frames=frames, horizon=horizon)
    readiness = None
    stgnn = {
        "mode": "dry_run",
        "training": None,
        "evaluation": {
            "source": m2_summary["stgnn_checkpoint_evaluation"]["source"],
            "path": m2_summary["stgnn_checkpoint_evaluation"]["evaluation_path"],
            "model_loaded": m2_summary["stgnn_checkpoint_evaluation"]["model_loaded"],
            "target_status": m2_summary["stgnn_checkpoint_evaluation"]["target_status"],
        },
    }

    if real_stgnn:
        readiness = _run_json_command(
            [
                interpreter,
                "scripts/verify_model_readiness.py",
                "--require-yolo",
                "--require-stgnn",
            ]
        )
        samples_path = m2_summary["stgnn_training"]["samples_path"]
        checkpoint_path = root / "models" / "occaware_stgnn.ts"
        evaluation_path = root / "mini_split" / "stgnn_evaluation.json"
        training = _run_json_command(
            [
                interpreter,
                "scripts/train_stgnn.py",
                "--samples",
                str(samples_path),
                "--output",
                str(checkpoint_path),
                "--epochs",
                str(epochs),
                "--batch-size",
                str(batch_size),
                "--hidden-dim",
                str(hidden_dim),
            ]
        )
        evaluation = _run_json_command(
            [
                interpreter,
                "scripts/evaluate_stgnn_checkpoint.py",
                "--samples",
                str(samples_path),
                "--checkpoint",
                str(checkpoint_path),
                "--output",
                str(evaluation_path),
                "--batch-size",
                str(batch_size),
            ]
        )
        stgnn = {
            "mode": "real",
            "training": training,
            "evaluation": {
                "source": evaluation["source"],
                "path": str(evaluation_path),
                "model_loaded": evaluation["model_loaded"],
                "metrics": evaluation["metrics"],
                "target_status": _target_status_by_key(evaluation),
            },
        }

    return {
        "status": "real_stgnn" if real_stgnn else "dry_run",
        "work_dir": str(root),
        "python": interpreter,
        "readiness": readiness or build_readiness_report(),
        "m2_demo": m2_summary,
        "stgnn": stgnn,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify the M2 algorithm pipeline from sample build to ST-GNN evaluation")
    parser.add_argument("--work-dir", default="data/algorithm_validation", help="Output directory for generated artifacts")
    parser.add_argument("--frames", type=int, default=60, help="Demo sample frame count")
    parser.add_argument("--horizon", type=int, default=30, help="Prediction horizon")
    parser.add_argument("--real-stgnn", action="store_true", help="Train and evaluate a real TorchScript ST-GNN checkpoint")
    parser.add_argument("--python", dest="python_executable", help="Python executable for real ST-GNN commands")
    parser.add_argument("--epochs", type=int, default=8, help="Real ST-GNN smoke training epochs")
    parser.add_argument("--batch-size", type=int, default=4, help="Training/evaluation batch size")
    parser.add_argument("--hidden-dim", type=int, default=32, help="Model hidden dimension")
    args = parser.parse_args()

    summary = verify_algorithm_pipeline(
        work_dir=args.work_dir,
        frames=args.frames,
        horizon=args.horizon,
        real_stgnn=args.real_stgnn,
        python_executable=args.python_executable,
        epochs=args.epochs,
        batch_size=args.batch_size,
        hidden_dim=args.hidden_dim,
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
