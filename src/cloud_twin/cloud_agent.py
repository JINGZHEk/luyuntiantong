"""
Cloud Agent - Subscribes to all MQTT topics, stores data, detects events.
Also starts the FastAPI server for WebSocket and REST API.
"""
import time
import json
import asyncio
import threading
import argparse
from typing import Optional

from src.utils import load_config, get_config_path, setup_logger
from src.communication import MQTTClient, make_timestamp
from src.cloud_twin.data_store import DataStore
from src.cloud_twin.api import app, broadcast_to_clients, store as _store_ref


class CloudAgent:
    def __init__(self, config_path: str = None):
        self.config = load_config(config_path or get_config_path("cloud.yaml"))
        mqtt_config = load_config(get_config_path("mqtt.yaml"))
        self.logger = setup_logger("cloud_agent", log_dir="logs")

        self.scene_id = self.config.get("scene_id", "scene_001")

        # MQTT
        self.mqtt = MQTTClient(
            client_id="cloud_agent",
            broker_host=mqtt_config["broker"]["host"],
            broker_port=mqtt_config["broker"]["port"],
        )

        # Database
        db_path = self.config.get("database", {}).get("path", "data/v2x_cloud.db")
        self.store = DataStore(db_path)

        # Event detection config
        evt_config = self.config.get("event_detection", {})
        self.ttc_threshold = evt_config.get("ttc_threshold", 2.0)
        self.require_occlusion = evt_config.get("require_occlusion", True)
        self.cooldown_sec = evt_config.get("cooldown_sec", 5.0)
        self._last_event_time = 0
        self._event_counter = 0

        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def start(self):
        self.mqtt.connect()

        # Subscribe to all V2X topics
        self.mqtt.subscribe(f"v2x/{self.scene_id}/roadside/+/perception", self._on_perception)
        self.mqtt.subscribe(f"v2x/{self.scene_id}/vehicle/+/status", self._on_vehicle_status)
        self.mqtt.subscribe(f"v2x/{self.scene_id}/vehicle/+/decision", self._on_decision)
        self.mqtt.subscribe(f"v2x/{self.scene_id}/roadside/+/heartbeat", self._on_heartbeat)

        self.logger.info("Cloud agent started, subscribed to all topics")

    def _on_perception(self, topic: str, payload: dict):
        frame_id = payload.get("frame_id", 0)
        timestamp = payload.get("timestamp", make_timestamp())
        node_id = payload.get("node_id", "unknown")

        self.store.store_frame(
            frame_id=frame_id,
            timestamp=timestamp,
            scene_id=self.scene_id,
            node_id=node_id,
            perception=payload,
        )

        self._broadcast("perception", payload)

    def _on_vehicle_status(self, topic: str, payload: dict):
        self._broadcast("vehicle_status", payload)

    def _on_decision(self, topic: str, payload: dict):
        frame_id = payload.get("frame_id", int(time.time() * 10) % 100000)
        timestamp = payload.get("timestamp", make_timestamp())

        self.store.store_frame(
            frame_id=frame_id,
            timestamp=timestamp,
            scene_id=self.scene_id,
            decision=payload,
        )

        # Check for event trigger
        self._check_event(payload)
        self._broadcast("decision", payload)

    def _on_heartbeat(self, topic: str, payload: dict):
        self._broadcast("heartbeat", payload)

    def _check_event(self, decision: dict):
        """Detect ghost-probe events based on TTC and occlusion."""
        ttc = decision.get("ttc", float('inf'))
        risk_level = decision.get("risk_level", "SAFE")

        if ttc > self.ttc_threshold:
            return
        if risk_level not in ("DANGER", "EMERGENCY"):
            return

        now = time.time()
        if now - self._last_event_time < self.cooldown_sec:
            return

        self._last_event_time = now
        self._event_counter += 1

        event = {
            "event_id": f"evt_{int(now)}_{self._event_counter:03d}",
            "timestamp": make_timestamp(),
            "event_type": "ghost_probe",
            "severity": "critical" if risk_level == "EMERGENCY" else "high",
            "scene_id": self.scene_id,
            "min_ttc": ttc,
            "outcome": "avoided" if decision.get("brake_decel", 0) > 0 else "pending",
            "description": f"Ghost-probe event detected: TTC={ttc:.1f}s, risk={risk_level}",
            "involved_objects": [
                {"type": "vehicle", "id": decision.get("vehicle_id")},
                {"type": "pedestrian", "track_id": decision.get("target_object", {}).get("track_id")},
            ],
        }

        self.store.store_event(event)
        self._broadcast("event", event)

        # Publish event to MQTT
        event_topic = f"v2x/{self.scene_id}/cloud/event"
        self.mqtt.publish(event_topic, event)
        self.logger.warning(f"Event detected: {event['event_id']} TTC={ttc:.1f}s")

    def _broadcast(self, msg_type: str, data: dict):
        """Send to WebSocket clients via async bridge."""
        if self._loop and self._loop.is_running():
            asyncio.run_coroutine_threadsafe(
                broadcast_to_clients(msg_type, data), self._loop
            )

    def set_event_loop(self, loop: asyncio.AbstractEventLoop):
        self._loop = loop

    def stop(self):
        self.mqtt.disconnect()
        self.logger.info("Cloud agent stopped")


def run_api_server(cloud_agent: CloudAgent):
    """Run FastAPI with uvicorn in the main thread."""
    import uvicorn
    import src.cloud_twin.api as api_module

    # Share the datastore with the API
    api_module.store = cloud_agent.store

    config = cloud_agent.config.get("api", {})
    host = config.get("host", "0.0.0.0")
    port = config.get("port", 8000)

    uvicorn_config = uvicorn.Config(app, host=host, port=port, log_level="info")
    server = uvicorn.Server(uvicorn_config)

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    cloud_agent.set_event_loop(loop)

    loop.run_until_complete(server.serve())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Cloud Twin Agent")
    parser.add_argument("--config", default=None, help="Config file path")
    args = parser.parse_args()

    agent = CloudAgent(config_path=args.config)
    agent.start()
    print(f"Cloud agent running with API server...")

    try:
        run_api_server(agent)
    except KeyboardInterrupt:
        agent.stop()
