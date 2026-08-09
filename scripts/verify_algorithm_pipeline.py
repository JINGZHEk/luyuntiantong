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


def verify_pc_cloud_smoke(
    work_dir: str | Path,
    frames: int = 60,
    fps: float = 10.0,
    real_stgnn: bool = False,
    model_path: str | Path | None = None,
) -> dict[str, Any]:
    """Run a repeatable in-process PC perception -> Cloud STGNN smoke path."""
    if frames < 2:
        raise ValueError("pc-cloud smoke requires at least two frames")
    if fps <= 0:
        raise ValueError("fps must be greater than zero")

    from src.cloud_twin.cloud_agent import CloudAgent
    from src.cloud_twin.data_store import DataStore
    from src.cloud_twin.stgnn_service import CloudSTGNNService
    from src.communication.in_memory_mqtt import InMemoryBroker, InMemoryMQTTClient
    from src.utils import setup_logger

    root = Path(work_dir)
    root.mkdir(parents=True, exist_ok=True)
    resolved_model_path = Path(model_path) if model_path else None

    class SmokePredictor:
        def __init__(self, **kwargs):
            self.histories: dict[Any, list[list[float]]] = {}
            self.backend_status = {
                "mode": "in_memory_fake_predictor",
                "model_loaded": False,
                "model_path": kwargs.get("model_path"),
                "reason": None,
            }

        def update(self, track_id, position, metadata=None):
            self.histories.setdefault(track_id, []).append(position)

        def predict(self, track_id, occlusion_level=0):
            if len(self.histories.get(track_id, [])) < 2:
                return []
            x, y = self.histories[track_id][-1]
            return [[x + 0.5, y], [x + 1.0, y]]

        def get_velocity(self, track_id):
            return [1.0, 0.0]

        def cleanup_stale(self, active_ids):
            self.histories = {
                track_id: history
                for track_id, history in self.histories.items()
                if track_id in active_ids
            }

    broker = InMemoryBroker()
    cloud = CloudAgent.__new__(CloudAgent)
    cloud.scene_id = "scene_001"
    cloud.logger = setup_logger("verify.pc_cloud_smoke")
    cloud.mqtt = InMemoryMQTTClient("cloud_smoke", broker)
    cloud.store = DataStore(str(root / "pc_cloud.db"))
    service_kwargs = {
        "model_path": str(resolved_model_path) if resolved_model_path else None,
        "history_length": 8,
        "predict_steps": 30,
        "fps": fps,
        "min_history": 2,
    }
    if real_stgnn:
        service = CloudSTGNNService(**service_kwargs)
    else:
        service = CloudSTGNNService(
            **service_kwargs,
            predictor_factory=lambda **kwargs: SmokePredictor(**kwargs),
        )
    cloud.stgnn_service = service
    broadcasts: list[tuple[str, dict[str, Any]]] = []
    cloud._broadcast = lambda msg_type, payload: broadcasts.append((msg_type, payload))
    cloud.start()

    pc = InMemoryMQTTClient("pc_smoke", broker)
    pc.connect()
    topic = "v2x/scene_001/roadside/pc_roadside_001/perception"
    try:
        for frame_id in range(frames):
            pc.publish(
                topic,
                {
                    "schema_version": 1,
                    "message_type": "perception",
                    "scene_id": "scene_001",
                    "timestamp": int(frame_id * 1000 / fps),
                    "frame_id": frame_id,
                    "node_id": "pc_roadside_001",
                    "source": {
                        "device_type": "pc_replay",
                        "input_type": "synthetic_smoke",
                        "detector": "yolo",
                        "tracker": "deepsort",
                    },
                    "coordinate_frame": "road_xy",
                    "objects": [{
                        "track_id": 7,
                        "class": "car",
                        "bbox": [420, 210, 96, 80],
                        "world_pos": [frame_id * 0.1, 3.8],
                        "velocity": [1.0, 0.0],
                        "confidence": 0.9,
                        "coordinate_status": "valid",
                        "prediction_status": "deferred",
                    }],
                },
            )
    finally:
        cloud.stop()

    prediction_statuses = sorted({
        payload.get("prediction", {}).get("status")
        for kind, payload in broadcasts
        if kind == "perception"
    } - {None})
    predictor = service._predictors.get("pc_roadside_001")
    backend_status = getattr(predictor, "backend_status", {}) if predictor else {}
    stored_frames = sum(
        1 for frame_id in range(frames) if cloud.store.get_frame(frame_id) is not None
    )
    prediction_ok = "ready" in prediction_statuses if real_stgnn else "fallback" in prediction_statuses
    status = "ok" if (
        len(broadcasts) == frames
        and stored_frames == frames
        and prediction_ok
        and (not real_stgnn or backend_status.get("model_loaded") is True)
    ) else "failed"

    return {
        "status": status,
        "transport": "in_memory_mqtt",
        "input": {"frames": frames, "fps": fps, "source": "synthetic_smoke"},
        "cloud": {
            "message_frames": frames,
            "stored_frames": stored_frames,
            "broadcast_frames": len(broadcasts),
            "prediction_statuses": prediction_statuses,
            "model_loaded": bool(backend_status.get("model_loaded")),
            "backend_mode": backend_status.get("mode", "unknown"),
            "model_path": backend_status.get("model_path"),
        },
        "database": str(cloud.store.db_path),
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
    pc_cloud_smoke: bool = False,
    fps: float = 10.0,
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

    pc_cloud = None
    if pc_cloud_smoke:
        generated_model = None
        if real_stgnn and stgnn.get("training"):
            generated_model = stgnn["training"].get("trained_checkpoint")
        pc_cloud = verify_pc_cloud_smoke(
            work_dir=root / "pc_cloud",
            frames=frames,
            fps=fps,
            real_stgnn=real_stgnn,
            model_path=generated_model or "data/algorithm_validation_pipeline/models/occaware_stgnn.ts",
        )

    return {
        "status": "real_stgnn" if real_stgnn else "dry_run",
        "work_dir": str(root),
        "python": interpreter,
        "readiness": readiness or build_readiness_report(),
        "m2_demo": m2_summary,
        "stgnn": stgnn,
        "pc_cloud": pc_cloud,
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
    parser.add_argument("--pc-cloud-smoke", action="store_true", help="Run the in-process PC-to-Cloud perception smoke path")
    parser.add_argument("--fps", type=float, default=10.0, help="Input FPS for the PC-to-Cloud smoke path")
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
        pc_cloud_smoke=args.pc_cloud_smoke,
        fps=args.fps,
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
