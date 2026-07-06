import argparse
import importlib.metadata
import importlib.util
import json
import sys
from typing import Any


YOLO_PACKAGES = ["ultralytics", "torch", "torchvision"]
STGNN_PACKAGES = ["torch", "torch_geometric"]
RECOMMENDED_PYTHON = {"min": [3, 10], "max": [3, 11]}


def _package_status(package: str) -> dict[str, Any]:
    found = importlib.util.find_spec(package) is not None
    version = None
    if found:
        try:
            version = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            version = "unknown"
    return {"found": found, "version": version}


def _python_status() -> dict[str, Any]:
    version_info = sys.version_info
    recommended = (
        (version_info.major, version_info.minor) >= tuple(RECOMMENDED_PYTHON["min"])
        and (version_info.major, version_info.minor) <= tuple(RECOMMENDED_PYTHON["max"])
    )
    return {
        "version": f"{version_info.major}.{version_info.minor}.{version_info.micro}",
        "recommended": recommended,
        "recommended_range": "3.10-3.11",
        "executable": sys.executable,
    }


def _component_status(packages: list[str]) -> dict[str, Any]:
    statuses = {package: _package_status(package) for package in packages}
    ready = all(status["found"] for status in statuses.values())
    missing = [package for package, status in statuses.items() if not status["found"]]
    return {"ready": ready, "packages": statuses, "missing": missing}


def build_readiness_report(require_yolo: bool = False, require_stgnn: bool = False) -> dict[str, Any]:
    yolo = _component_status(YOLO_PACKAGES)
    stgnn = _component_status(STGNN_PACKAGES)
    missing_required: list[str] = []
    if require_yolo:
        missing_required.extend(yolo["missing"])
    if require_stgnn:
        missing_required.extend(stgnn["missing"])

    return {
        "python": _python_status(),
        "yolo": yolo,
        "stgnn": stgnn,
        "recommended_environment": "environment-algorithm.yml",
        "required": {"yolo": require_yolo, "stgnn": require_stgnn},
        "missing_required": sorted(set(missing_required)),
        "notes": [
            "Default M0/M1 demo paths use annotation mode and do not require YOLO/ST-GNN packages.",
            "Use environment-algorithm.yml to create a Python 3.11 algorithm environment for real YOLO/ST-GNN work.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Check YOLO/ST-GNN algorithm environment readiness")
    parser.add_argument("--require-yolo", action="store_true", help="Fail if YOLO packages are missing")
    parser.add_argument("--require-stgnn", action="store_true", help="Fail if ST-GNN packages are missing")
    args = parser.parse_args()

    report = build_readiness_report(require_yolo=args.require_yolo, require_stgnn=args.require_stgnn)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if report["missing_required"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
