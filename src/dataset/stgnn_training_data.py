import json
from pathlib import Path
from typing import Any

from src.roadside_perception.stgnn_predictor import build_node_feature_sequence
from src.dataset.trajectory_dataset import TrajectoryDataset


def _read_json(path: str | Path) -> Any:
    with Path(path).open("r", encoding="utf-8") as f:
        return json.load(f)


def _track_index(frame: dict[str, Any]) -> dict[int, dict[str, Any]]:
    indexed = {}
    for annotation in frame.get("annotations", []):
        if isinstance(annotation, dict) and "track_id" in annotation:
            indexed[int(annotation["track_id"])] = annotation
    return indexed


def _position(annotation: dict[str, Any]) -> list[float] | None:
    value = annotation.get("world_pos")
    if isinstance(value, list) and len(value) >= 2:
        return [round(float(value[0]), 3), round(float(value[1]), 3)]
    return None


def _target_class_allowed(annotation: dict[str, Any], target_classes: list[str] | None) -> bool:
    if not target_classes:
        return True
    return annotation.get("class", "unknown") in target_classes


def build_stgnn_samples(
    replay_clip: dict[str, Any],
    history_length: int = 8,
    predict_steps: int = 30,
    fps: float = 10.0,
    target_classes: list[str] | None = None,
) -> list[dict[str, Any]]:
    frames = sorted(replay_clip.get("frames", []), key=lambda item: item.get("frame_id", 0))
    indexed_frames = [_track_index(frame) for frame in frames]
    scene_id = replay_clip.get("scene_id", "unknown_scene")
    samples = []

    last_start = len(frames) - predict_steps
    for frame_index in range(history_length - 1, last_start):
        current_frame = frames[frame_index]
        current_tracks = indexed_frames[frame_index]
        for track_id, current in current_tracks.items():
            if not _target_class_allowed(current, target_classes):
                continue

            history_annotations = []
            history_positions = []
            for history_index in range(frame_index - history_length + 1, frame_index + 1):
                annotation = indexed_frames[history_index].get(track_id)
                if annotation is None:
                    break
                position = _position(annotation)
                if position is None:
                    break
                history_annotations.append(annotation)
                history_positions.append(position)
            if len(history_positions) != history_length:
                continue

            target_positions = []
            for future_index in range(frame_index + 1, frame_index + predict_steps + 1):
                annotation = indexed_frames[future_index].get(track_id)
                if annotation is None:
                    break
                position = _position(annotation)
                if position is None:
                    break
                target_positions.append(position)
            if len(target_positions) != predict_steps:
                continue

            occlusion_level = int(current.get("occlusion_level", 0))
            input_features = build_node_feature_sequence(
                history=history_positions,
                bbox=current.get("bbox"),
                obj_class=current.get("class", "unknown"),
                occlusion_level=occlusion_level,
                fps=fps,
                history_length=history_length,
            )
            frame_id = int(current_frame.get("frame_id", frame_index))
            samples.append(
                {
                    "sample_id": f"{scene_id}_{frame_id:06d}_{track_id}",
                    "scene_id": scene_id,
                    "frame_id": frame_id,
                    "track_id": track_id,
                    "class": current.get("class", "unknown"),
                    "history_length": history_length,
                    "predict_steps": predict_steps,
                    "input_features": input_features,
                    "target_trajectory": target_positions,
                    "occlusion_label": occlusion_level,
                    "source_timestamp": current_frame.get("timestamp"),
                    "history_frame_ids": [
                        int(frames[index].get("frame_id", index))
                        for index in range(frame_index - history_length + 1, frame_index + 1)
                    ],
                    "future_frame_ids": [
                        int(frames[index].get("frame_id", index))
                        for index in range(frame_index + 1, frame_index + predict_steps + 1)
                    ],
                    "bbox": current.get("bbox"),
                    "last_observed_position": history_positions[-1],
                    "first_observed_position": history_positions[0],
                    "last_history_occlusion": int(history_annotations[-1].get("occlusion_level", 0)),
                }
            )
    return samples


def export_stgnn_training_data(
    clip_path: str | Path,
    output_dir: str | Path,
    history_length: int = 8,
    predict_steps: int = 30,
    fps: float = 10.0,
    target_classes: list[str] | None = None,
) -> dict[str, Any]:
    clip = _read_json(clip_path)
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    samples = build_stgnn_samples(
        replay_clip=clip,
        history_length=history_length,
        predict_steps=predict_steps,
        fps=fps,
        target_classes=target_classes,
    )

    samples_path = output / "samples.jsonl"
    with samples_path.open("w", encoding="utf-8") as f:
        for sample in samples:
            f.write(json.dumps(sample, ensure_ascii=False) + "\n")

    occluded_count = sum(1 for sample in samples if int(sample.get("occlusion_label", 0)) > 0)
    manifest = {
        "source_clip": str(clip_path),
        "scene_id": clip.get("scene_id", "unknown_scene"),
        "sample_count": len(samples),
        "occluded_sample_count": occluded_count,
        "history_length": history_length,
        "predict_steps": predict_steps,
        "fps": fps,
        "target_classes": target_classes or [],
        "samples_path": str(samples_path),
    }
    (output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return manifest


def build_standardized_stgnn_samples(
    dataset: TrajectoryDataset,
    input_steps: int = 20,
    future_steps: int = 20,
    stride: int = 1,
) -> list[dict[str, Any]]:
    samples = []
    for sample in dataset.to_supervised_samples(input_steps, future_steps, stride):
        input_seq = sample["input_seq"]
        gt_seq = sample["gt_seq"]
        obj_class = sample.get("class", "unknown")
        positions = [[float(point["x"]), float(point["y"])] for point in input_seq]
        features = build_node_feature_sequence(
            history=positions,
            obj_class=obj_class,
            fps=dataset.sample_hz,
            history_length=input_steps,
        )
        for index, point in enumerate(input_seq):
            features[index][4] = round(float(point["vx"]), 3)
            features[index][5] = round(float(point["vy"]), 3)
        samples.append(
            {
                **sample,
                "history_length": input_steps,
                "predict_steps": future_steps,
                "input_features": features,
                "target_trajectory": [[float(point["x"]), float(point["y"])] for point in gt_seq],
                "source_timestamp": input_seq[-1]["timestamp"],
                "occlusion_label": 0,
            }
        )
    return samples


def export_standardized_stgnn_training_data(
    source_path: str | Path,
    output_dir: str | Path,
    *,
    source_type: str = "auto",
    scenario_id: str | None = None,
    input_steps: int = 20,
    future_steps: int = 20,
    stride: int = 1,
    confidence_threshold: float = 0.3,
    coordinate_bound: float = 200.0,
    sample_hz: float = 10.0,
) -> dict[str, Any]:
    source = Path(source_path)
    resolved_type = source_type
    if resolved_type == "auto":
        resolved_type = "sqlite" if source.suffix.lower() in {".db", ".sqlite", ".sqlite3"} else "json"
    dataset_kwargs = {
        "confidence_threshold": confidence_threshold,
        "coordinate_bound": coordinate_bound,
        "sample_hz": sample_hz,
    }
    if resolved_type == "sqlite":
        dataset = TrajectoryDataset.from_sqlite(source, scenario_id=scenario_id, **dataset_kwargs)
    elif resolved_type == "json":
        dataset = TrajectoryDataset.from_json(source, **dataset_kwargs)
    else:
        raise ValueError(f"Unsupported source_type: {source_type}")

    samples = build_standardized_stgnn_samples(dataset, input_steps, future_steps, stride)
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    samples_path = output / "samples.jsonl"
    with samples_path.open("w", encoding="utf-8") as handle:
        for sample in samples:
            handle.write(json.dumps(sample, ensure_ascii=False) + "\n")
    manifest = {
        "source": str(source),
        "source_type": resolved_type,
        "scenario_id": scenario_id,
        "sample_count": len(samples),
        "trajectory_segment_count": len(dataset),
        "point_count": len(dataset.points),
        "history_length": input_steps,
        "predict_steps": future_steps,
        "fps": sample_hz,
        "confidence_threshold": confidence_threshold,
        "coordinate_bound": coordinate_bound,
        "samples_path": str(samples_path),
    }
    (output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return manifest
