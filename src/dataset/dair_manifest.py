import json
from pathlib import Path
from typing import Any


CLASS_MAP = {
    "pedestrian": "person",
    "person": "person",
    "car": "car",
    "vehicle": "car",
    "truck": "truck",
    "bus": "truck",
    "cyclist": "bicycle",
    "bicycle": "bicycle",
}


def _read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _as_label_list(raw: Any) -> list[dict[str, Any]]:
    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, dict)]
    if isinstance(raw, dict):
        for key in ("labels", "annotations", "objects"):
            value = raw.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
        return [raw]
    return []


def _bbox_from_label(label: dict[str, Any]) -> list[float]:
    box = label.get("2d_box") or label.get("bbox") or {}
    if isinstance(box, dict):
        xmin = float(box.get("xmin", box.get("x", 0)))
        ymin = float(box.get("ymin", box.get("y", 0)))
        xmax = float(box.get("xmax", xmin + float(box.get("width", 0))))
        ymax = float(box.get("ymax", ymin + float(box.get("height", 0))))
        return [xmin, ymin, xmax - xmin, ymax - ymin]
    if isinstance(box, list) and len(box) >= 4:
        return [float(box[0]), float(box[1]), float(box[2]), float(box[3])]
    return [0.0, 0.0, 0.0, 0.0]


def _world_pos_from_label(label: dict[str, Any]) -> list[float]:
    location = label.get("3d_location") or label.get("world_pos") or {}
    if isinstance(location, dict):
        return [float(location.get("x", 0.0)), float(location.get("y", 0.0))]
    if isinstance(location, list) and len(location) >= 2:
        return [float(location[0]), float(location[1])]
    return [0.0, 0.0]


def _normalize_class(raw_type: Any) -> str:
    name = str(raw_type or "person").strip().lower()
    return CLASS_MAP.get(name, name)


def _compact_numbers(values: list[float]) -> list[int | float]:
    compacted: list[int | float] = []
    for value in values:
        compacted.append(int(value) if float(value).is_integer() else value)
    return compacted


def load_dair_annotations(label_path: str | Path) -> list[dict[str, Any]]:
    """Load one DAIR-V2X label file and map it to replay annotations."""
    labels = _as_label_list(_read_json(Path(label_path)))
    annotations = []
    for idx, label in enumerate(labels):
        annotations.append(
            {
                "track_id": int(label.get("track_id", label.get("id", idx))),
                "class": _normalize_class(label.get("type", label.get("class"))),
                "bbox": _compact_numbers(_bbox_from_label(label)),
                "world_pos": _compact_numbers(_world_pos_from_label(label)),
                "velocity": label.get("velocity", [0.0, 0.0]),
                "confidence": float(label.get("confidence", 1.0)),
                "occlusion_level": int(label.get("occluded_state", label.get("occlusion_level", 0))),
                "rotation": float(label.get("rotation", 0.0)),
            }
        )
    return annotations


def generate_dair_demo_sample(
    output_dir: str | Path,
    frame_count: int = 60,
    scene_id: str = "demo_dair_001",
) -> dict[str, Any]:
    """Generate a tiny DAIR-V2X-style ghost-probe sample for offline demos."""
    root = Path(output_dir)
    image_dir = root / "infrastructure-side" / "image"
    label_dir = root / "infrastructure-side" / "label"
    image_dir.mkdir(parents=True, exist_ok=True)
    label_dir.mkdir(parents=True, exist_ok=True)

    for frame_id in range(frame_count):
        stem = f"{frame_id:06d}"
        timestamp_ms = frame_id * 100
        pedestrian_x = round(-6.0 + frame_id * 0.45, 2)
        pedestrian_y = round(-3.2 + frame_id * 0.18, 2)
        occlusion_level = 2 if frame_id < max(1, frame_count - 1) else 0

        labels = [
            {
                "id": 1,
                "track_id": 1,
                "type": "Pedestrian",
                "occluded_state": occlusion_level,
                "2d_box": {
                    "xmin": round(300 + frame_id * 1.5, 2),
                    "ymin": round(180 - min(frame_id, 12) * 0.4, 2),
                    "xmax": round(340 + frame_id * 1.5, 2),
                    "ymax": round(300 - min(frame_id, 12) * 0.4, 2),
                },
                "3d_location": {"x": pedestrian_x, "y": pedestrian_y, "z": 0.0},
                "velocity": [4.5, 1.8],
                "confidence": 1.0,
                "rotation": 0.0,
            },
            {
                "id": 2,
                "track_id": 2,
                "type": "Car",
                "occluded_state": 0,
                "2d_box": {"xmin": 120, "ymin": 210, "xmax": 260, "ymax": 300},
                "3d_location": {"x": 0.0, "y": -1.4, "z": 0.0},
                "velocity": [0.0, 0.0],
                "confidence": 1.0,
                "rotation": 0.0,
            },
        ]

        (image_dir / f"{stem}.jpg").write_bytes(b"V2X_DEMO_SAMPLE_IMAGE_PLACEHOLDER\n")
        (label_dir / f"{stem}.json").write_text(
            json.dumps(labels, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    metadata = {
        "dataset": "DAIR-V2X-demo-sample",
        "scene_id": scene_id,
        "frame_count": frame_count,
        "description": "Synthetic DAIR-style ghost-probe sample for build/evaluate smoke tests.",
        "fps": 10,
    }
    (root / "demo_sample_meta.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return metadata


def _find_split_dirs(root: Path) -> tuple[Path, Path]:
    candidates = [
        root / "infrastructure-side",
        root / "cooperative",
        root,
    ]
    for base in candidates:
        image_dir = base / "image"
        label_dir = base / "label"
        if image_dir.exists() and label_dir.exists():
            return image_dir, label_dir
    raise FileNotFoundError(f"Cannot find DAIR image/label directories under {root}")


def build_dair_mini_split(
    dair_root: str | Path,
    output_dir: str | Path,
    max_frames: int = 100,
    scene_id: str = "dair_mini_001",
) -> dict[str, Any]:
    """Build a small manifest and replay clip from DAIR-V2X style labels."""
    root = Path(dair_root)
    output = Path(output_dir)
    image_dir, label_dir = _find_split_dirs(root)
    output.mkdir(parents=True, exist_ok=True)
    replay_dir = output / "replay"
    replay_dir.mkdir(parents=True, exist_ok=True)

    image_files = sorted(
        item for item in image_dir.iterdir() if item.suffix.lower() in {".jpg", ".jpeg", ".png"}
    )
    frames = []
    replay_frames = []
    for frame_id, image_path in enumerate(image_files[:max_frames]):
        label_path = label_dir / f"{image_path.stem}.json"
        if not label_path.exists():
            continue
        annotations = load_dair_annotations(label_path)
        frame = {
            "frame_id": len(frames),
            "source_id": image_path.stem,
            "scene_id": scene_id,
            "image_path": str(image_path),
            "label_path": str(label_path),
            "annotation_count": len(annotations),
        }
        frames.append(frame)
        replay_frames.append(
            {
                "frame_id": frame["frame_id"],
                "timestamp": frame["frame_id"] * 100,
                "scene_id": scene_id,
                "annotations": annotations,
            }
        )

    manifest = {
        "dataset": "DAIR-V2X",
        "scene_id": scene_id,
        "frame_count": len(frames),
        "frames": frames,
        "replay_clip": str(replay_dir / "clip_001.json"),
    }

    (output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (replay_dir / "clip_001.json").write_text(
        json.dumps({"scene_id": scene_id, "frames": replay_frames}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return manifest
