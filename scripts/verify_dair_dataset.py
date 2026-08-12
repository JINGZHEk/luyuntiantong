import argparse
import json
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}


def _split_dirs(root: Path) -> tuple[Path, Path] | None:
    for base in (root / "infrastructure-side", root / "cooperative", root):
        image_dir = base / "image"
        label_dir = base / "label"
        if image_dir.exists() and label_dir.exists():
            return image_dir, label_dir
    return None


def _count_files(path: Path, suffixes: set[str]) -> int:
    return sum(1 for item in path.iterdir() if item.is_file() and item.suffix.lower() in suffixes)


def _dataset_candidate(root: Path) -> dict[str, Any] | None:
    split = _split_dirs(root)
    if split is None:
        return None
    image_dir, label_dir = split
    image_count = _count_files(image_dir, IMAGE_SUFFIXES)
    label_count = _count_files(label_dir, {".json"})
    if image_count == 0 or label_count == 0:
        return None
    demo_sample = (root / "demo_sample_meta.json").exists() or "demo_dair_sample" in root.name.lower()
    return {
        "root": str(root),
        "image_dir": str(image_dir),
        "label_dir": str(label_dir),
        "image_count": image_count,
        "label_count": label_count,
        "paired_frame_upper_bound": min(image_count, label_count),
        "demo_sample": demo_sample,
    }


def discover_dair_datasets(search_roots: list[Path], max_depth: int = 5) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    seen: set[Path] = set()
    for search_root in search_roots:
        if not search_root.exists():
            continue
        roots_to_check = [search_root]
        for pattern in ("DAIR*", "*V2X*", "*dair*", "*v2x*", "demo_dair_sample"):
            roots_to_check.extend(search_root.glob(pattern))
            roots_to_check.extend(search_root.glob(f"*/{pattern}"))
        roots_to_check.extend(
            item
            for item in search_root.rglob("infrastructure-side")
            if len(item.relative_to(search_root).parts) <= max_depth
        )

        for item in roots_to_check:
            root = item.parent if item.name == "infrastructure-side" else item
            # Keep the caller's path spelling in the report (important for
            # Windows 8.3 paths and readable CLI output), while normalizing
            # only the deduplication key.
            root = root.absolute()
            root_key = root.resolve()
            if root_key in seen or not root.is_dir():
                continue
            seen.add(root_key)
            candidate = _dataset_candidate(root)
            if candidate is not None:
                candidates.append(candidate)

    return sorted(candidates, key=lambda item: (item["demo_sample"], item["root"]))


def build_dataset_report(
    search_roots: list[Path] | None = None,
    dair_root: Path | None = None,
) -> dict[str, Any]:
    if dair_root is not None:
        candidates = []
        candidate = _dataset_candidate(dair_root.resolve())
        if candidate is not None:
            candidates.append(candidate)
    else:
        candidates = discover_dair_datasets(search_roots or [PROJECT_ROOT / "data", PROJECT_ROOT.parent])

    real_candidates = [candidate for candidate in candidates if not candidate["demo_sample"]]
    return {
        "candidate_count": len(candidates),
        "real_candidate_count": len(real_candidates),
        "candidates": candidates,
        "recommended_next_step": _recommended_next_step(real_candidates, candidates),
    }


def _recommended_next_step(real_candidates: list[dict[str, Any]], candidates: list[dict[str, Any]]) -> str:
    if real_candidates:
        root = real_candidates[0]["root"]
        return f"python scripts/build_dair_mini_split.py --dair-root {root} --output data/mini_split --max-frames 100"
    if candidates:
        return "Only generated demo samples were found; place or point --dair-root to a real DAIR-V2X dataset."
    return "No DAIR-style dataset found; download/extract DAIR-V2X and rerun with --dair-root."


def validate_dataset_report(report: dict[str, Any], require_real: bool = False) -> None:
    if int(report.get("candidate_count", 0)) <= 0:
        raise RuntimeError("No DAIR-style dataset candidates were found")
    if require_real and int(report.get("real_candidate_count", 0)) <= 0:
        raise RuntimeError("No real DAIR-V2X dataset candidates were found")


def main() -> None:
    parser = argparse.ArgumentParser(description="Discover and validate DAIR-V2X style dataset directories")
    parser.add_argument("--dair-root", default=None, help="Validate one DAIR-V2X root directly")
    parser.add_argument(
        "--search-root",
        action="append",
        default=None,
        help="Root directory to scan; can be passed multiple times",
    )
    parser.add_argument("--require-real", action="store_true", help="Fail when only generated demo samples are found")
    args = parser.parse_args()

    report = build_dataset_report(
        search_roots=[Path(item) for item in args.search_root] if args.search_root else None,
        dair_root=Path(args.dair_root) if args.dair_root else None,
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    try:
        validate_dataset_report(report, require_real=args.require_real)
    except RuntimeError as exc:
        raise SystemExit(str(exc)) from exc


if __name__ == "__main__":
    main()
