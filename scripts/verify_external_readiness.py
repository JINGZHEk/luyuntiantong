"""Summarize external environment readiness for GOAL.md remaining gates."""

from __future__ import annotations

import argparse
import json
import shutil
import socket
import sys
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.verify_dair_dataset import build_dataset_report
from scripts.verify_docker_compose_config import verify_compose
from scripts.verify_model_readiness import build_readiness_report


def _command_status(command: str) -> dict[str, Any]:
    path = shutil.which(command)
    return {"available": path is not None, "path": path}


def _tcp_port_open(host: str, port: int, timeout: float = 0.7) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _dair_status(search_roots: list[Path], dair_root: Path | None, required: bool) -> dict[str, Any]:
    report = build_dataset_report(search_roots=search_roots, dair_root=dair_root)
    real_count = int(report.get("real_candidate_count", 0))
    return {
        "required": required,
        "ready": real_count > 0,
        "candidate_count": int(report.get("candidate_count", 0)),
        "real_candidate_count": real_count,
        "recommended_next_step": report.get("recommended_next_step"),
    }


def _docker_status(required: bool) -> dict[str, Any]:
    docker = _command_status("docker")
    docker_compose = _command_status("docker-compose")
    compose_plugin_available = docker["available"]
    try:
        compose_summary = verify_compose()
        compose_contract_ready = True
    except SystemExit:
        compose_summary = {}
        compose_contract_ready = False

    return {
        "required": required,
        "ready": bool((docker["available"] or docker_compose["available"]) and compose_contract_ready),
        "docker_command": docker,
        "docker_compose_command": docker_compose,
        "compose_plugin_possible": compose_plugin_available,
        "compose_contract_ready": compose_contract_ready,
        "compose_service_count": compose_summary.get("service_count"),
    }


def _mqtt_status(host: str, port: int, required: bool) -> dict[str, Any]:
    mosquitto = _command_status("mosquitto")
    port_open = _tcp_port_open(host, port)
    return {
        "required": required,
        "ready": port_open,
        "host": host,
        "port": port,
        "port_open": port_open,
        "mosquitto_command": mosquitto,
    }


def _algorithm_status(required: bool) -> dict[str, Any]:
    readiness = build_readiness_report(require_yolo=False, require_stgnn=False)
    yolo_ready = bool(readiness["yolo"]["ready"])
    stgnn_ready = bool(readiness["stgnn"]["ready"])
    return {
        "required": required,
        "ready": yolo_ready and stgnn_ready,
        "python": readiness["python"],
        "yolo_ready": yolo_ready,
        "stgnn_ready": stgnn_ready,
        "recommended_environment": readiness["recommended_environment"],
    }


def _next_actions(report: dict[str, Any]) -> list[str]:
    actions: list[str] = []
    if not report["dair"]["ready"]:
        actions.append("Place a real DAIR-V2X dataset and rerun with --dair-root or --search-root.")
    if not report["docker"]["ready"]:
        actions.append("Install Docker Desktop or docker-compose before running container startup validation.")
    if not report["mqtt_broker"]["ready"]:
        actions.append("Start Mosquitto/Docker Broker and rerun scripts/verify_mqtt_broker_demo.py.")
    if not report["algorithm"]["ready"]:
        actions.append("Use environment-algorithm.yml for real YOLO/ST-GNN training and inference checks.")
    return actions


def build_external_readiness_report(
    search_roots: list[Path],
    dair_root: Path | None = None,
    mqtt_host: str = "127.0.0.1",
    mqtt_port: int = 1883,
    require_real_dair: bool = False,
    require_docker: bool = False,
    require_broker: bool = False,
    require_algorithm: bool = False,
) -> dict[str, Any]:
    report = {
        "dair": _dair_status(search_roots, dair_root, require_real_dair),
        "docker": _docker_status(require_docker),
        "mqtt_broker": _mqtt_status(mqtt_host, mqtt_port, require_broker),
        "algorithm": _algorithm_status(require_algorithm),
    }
    report["next_actions"] = _next_actions(report)

    missing_required: list[str] = []
    if require_real_dair and not report["dair"]["ready"]:
        missing_required.append("real DAIR-V2X")
    if require_docker and not report["docker"]["ready"]:
        missing_required.append("Docker or docker-compose")
    if require_broker and not report["mqtt_broker"]["ready"]:
        missing_required.append("external MQTT Broker")
    if require_algorithm and not report["algorithm"]["ready"]:
        missing_required.append("YOLO/ST-GNN algorithm environment")
    report["missing_required"] = missing_required
    report["ready"] = not missing_required
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Summarize external readiness for remaining GOAL.md gates")
    parser.add_argument("--search-root", action="append", default=None, help="Directory to scan for DAIR-V2X data")
    parser.add_argument("--dair-root", default=None, help="Specific DAIR-V2X root to validate")
    parser.add_argument("--mqtt-host", default="127.0.0.1", help="External MQTT Broker host")
    parser.add_argument("--mqtt-port", type=int, default=1883, help="External MQTT Broker port")
    parser.add_argument("--require-real-dair", action="store_true", help="Fail if real DAIR-V2X data is absent")
    parser.add_argument("--require-docker", action="store_true", help="Fail if Docker/Compose readiness is absent")
    parser.add_argument("--require-broker", action="store_true", help="Fail if external MQTT Broker is absent")
    parser.add_argument("--require-algorithm", action="store_true", help="Fail if YOLO/ST-GNN readiness is absent")
    args = parser.parse_args()

    search_roots = [Path(item) for item in args.search_root] if args.search_root else [PROJECT_ROOT.parent]
    report = build_external_readiness_report(
        search_roots=search_roots,
        dair_root=Path(args.dair_root) if args.dair_root else None,
        mqtt_host=args.mqtt_host,
        mqtt_port=args.mqtt_port,
        require_real_dair=args.require_real_dair,
        require_docker=args.require_docker,
        require_broker=args.require_broker,
        require_algorithm=args.require_algorithm,
    )
    print(json.dumps(report, ensure_ascii=True, indent=2))
    return 1 if report["missing_required"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
