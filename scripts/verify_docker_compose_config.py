"""Validate the Docker Compose deployment contract without requiring Docker."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import yaml


PROJECT_ROOT = Path(__file__).resolve().parents[1]
COMPOSE_PATH = PROJECT_ROOT / "docker-compose.yml"


def _fail(message: str) -> None:
    raise SystemExit(message)


def _load_compose() -> dict[str, Any]:
    if not COMPOSE_PATH.exists():
        _fail(f"Missing compose file: {COMPOSE_PATH}")
    loaded = yaml.safe_load(COMPOSE_PATH.read_text(encoding="utf-8"))
    if not isinstance(loaded, dict):
        _fail("docker-compose.yml must contain a mapping")
    services = loaded.get("services")
    if not isinstance(services, dict):
        _fail("docker-compose.yml must define services")
    return loaded


def _service(services: dict[str, Any], name: str) -> dict[str, Any]:
    value = services.get(name)
    if not isinstance(value, dict):
        _fail(f"Missing service: {name}")
    return value


def _depends_on(service: dict[str, Any]) -> set[str]:
    value = service.get("depends_on", [])
    if isinstance(value, dict):
        return set(value)
    if isinstance(value, list):
        return set(value)
    _fail("depends_on must be a list or mapping")
    return set()


def _environment(service: dict[str, Any]) -> dict[str, str]:
    value = service.get("environment", {})
    if isinstance(value, dict):
        return {str(key): str(env_value) for key, env_value in value.items()}
    _fail("environment must be a mapping")
    return {}


def _require_build_file(service: dict[str, Any], service_name: str) -> None:
    build = service.get("build")
    if not isinstance(build, dict):
        _fail(f"{service_name} must use a build mapping")
    context = build.get("context")
    dockerfile = build.get("dockerfile")
    if context != ".":
        _fail(f"{service_name} build context must be '.'")
    if not isinstance(dockerfile, str):
        _fail(f"{service_name} must define a Dockerfile")
    if not (PROJECT_ROOT / dockerfile).exists():
        _fail(f"{service_name} Dockerfile does not exist: {dockerfile}")


def _require_ports(service: dict[str, Any], service_name: str, expected: str) -> None:
    ports = service.get("ports", [])
    if expected not in ports:
        _fail(f"{service_name} must expose {expected}")


def _require_mqtt_env(service: dict[str, Any], service_name: str) -> None:
    env = _environment(service)
    if env.get("MQTT_HOST") != "mosquitto":
        _fail(f"{service_name} must set MQTT_HOST=mosquitto")
    if env.get("MQTT_PORT") != "1883":
        _fail(f"{service_name} must set MQTT_PORT=1883")


def verify_compose() -> dict[str, Any]:
    compose = _load_compose()
    services = compose["services"]

    expected_services = {
        "mosquitto",
        "cloud-api",
        "frontend",
        "cloud-agent",
        "vehicle-agent",
        "replay-engine",
    }
    missing = expected_services.difference(services)
    if missing:
        _fail(f"Missing services: {', '.join(sorted(missing))}")

    mosquitto = _service(services, "mosquitto")
    cloud_api = _service(services, "cloud-api")
    frontend = _service(services, "frontend")
    cloud_agent = _service(services, "cloud-agent")
    vehicle_agent = _service(services, "vehicle-agent")
    replay_engine = _service(services, "replay-engine")

    if mosquitto.get("image") != "eclipse-mosquitto:2":
        _fail("mosquitto must use eclipse-mosquitto:2")
    _require_ports(mosquitto, "mosquitto", "1883:1883")
    _require_ports(mosquitto, "mosquitto", "9001:9001")
    if "./deployment/mosquitto.conf:/mosquitto/config/mosquitto.conf" not in mosquitto.get("volumes", []):
        _fail("mosquitto must mount deployment/mosquitto.conf")

    for service_name, service in (
        ("cloud-api", cloud_api),
        ("frontend", frontend),
        ("cloud-agent", cloud_agent),
        ("vehicle-agent", vehicle_agent),
        ("replay-engine", replay_engine),
    ):
        _require_build_file(service, service_name)

    _require_ports(cloud_api, "cloud-api", "8000:8000")
    _require_ports(frontend, "frontend", "3000:80")
    _require_ports(cloud_agent, "cloud-agent", "8001:8001")

    if "mosquitto" not in _depends_on(cloud_api):
        _fail("cloud-api must depend on mosquitto")
    if "cloud-api" not in _depends_on(frontend):
        _fail("frontend must depend on cloud-api")
    if "mosquitto" not in _depends_on(cloud_agent):
        _fail("cloud-agent must depend on mosquitto")
    if not {"mosquitto", "cloud-agent"}.issubset(_depends_on(vehicle_agent)):
        _fail("vehicle-agent must depend on mosquitto and cloud-agent")
    if not {"mosquitto", "vehicle-agent", "cloud-agent"}.issubset(_depends_on(replay_engine)):
        _fail("replay-engine must depend on mosquitto, vehicle-agent, and cloud-agent")

    for service_name, service in (
        ("cloud-api", cloud_api),
        ("cloud-agent", cloud_agent),
        ("vehicle-agent", vehicle_agent),
        ("replay-engine", replay_engine),
    ):
        _require_mqtt_env(service, service_name)

    mqtt_demo_services = []
    for service_name in ("cloud-agent", "replay-engine", "vehicle-agent"):
        service = _service(services, service_name)
        if service.get("profiles") != ["mqtt-demo"]:
            _fail(f"{service_name} must use the mqtt-demo profile")
        mqtt_demo_services.append(service_name)

    for required_path in (
        PROJECT_ROOT / "deployment" / "Dockerfile",
        PROJECT_ROOT / "deployment" / "frontend.Dockerfile",
        PROJECT_ROOT / "deployment" / "nginx.frontend.conf",
        PROJECT_ROOT / "deployment" / "mosquitto.conf",
    ):
        if not required_path.exists():
            _fail(f"Missing deployment file: {required_path}")

    return {
        "service_count": len(services),
        "services": sorted(services),
        "mqtt_demo_services": sorted(mqtt_demo_services),
        "frontend": {"port": "3000:80"},
        "cloud_api": {"port": "8000:8000"},
        "mqtt": {"host": "mosquitto", "port": "1883"},
    }


def main() -> int:
    summary = verify_compose()
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
