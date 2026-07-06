import os
from typing import Any


def apply_mqtt_env_overrides(config: dict[str, Any]) -> dict[str, Any]:
    broker = config.setdefault("broker", {})
    host = os.environ.get("MQTT_HOST")
    port = os.environ.get("MQTT_PORT")

    if host:
        broker["host"] = host
    if port:
        broker["port"] = int(port)
    return config
