import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.dataset import build_dair_mini_split, generate_dair_demo_sample


def main():
    parser = argparse.ArgumentParser(description="Build a DAIR-V2X mini split manifest and replay clip")
    parser.add_argument("--dair-root", help="Path to DAIR-V2X root directory")
    parser.add_argument("--output", default="data/mini_split", help="Output mini split directory")
    parser.add_argument("--max-frames", type=int, default=100, help="Maximum frames to include")
    parser.add_argument("--scene-id", default="dair_mini_001", help="Scene id stored in manifest")
    parser.add_argument(
        "--demo-sample",
        action="store_true",
        help="Generate a DAIR-style synthetic ghost-probe sample before building the mini split",
    )
    parser.add_argument(
        "--demo-root",
        default="data/demo_dair_sample",
        help="Directory for the generated DAIR-style demo sample when --demo-sample is used",
    )
    args = parser.parse_args()

    dair_root = args.dair_root
    sample = None
    if args.demo_sample:
        sample = generate_dair_demo_sample(
            output_dir=args.demo_root,
            frame_count=args.max_frames,
            scene_id=args.scene_id,
        )
        dair_root = args.demo_root

    if not dair_root:
        parser.error("--dair-root is required unless --demo-sample is set")

    manifest = build_dair_mini_split(
        dair_root=dair_root,
        output_dir=args.output,
        max_frames=args.max_frames,
        scene_id=args.scene_id,
    )
    if sample is not None:
        manifest["demo_sample"] = sample
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
