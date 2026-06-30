import json
import time
import threading
from typing import Callable, Optional
import paho.mqtt.client as mqtt

from src.utils import setup_logger, ErrorCode


class MQTTClient:
    def __init__(self, client_id: str, broker_host: str = "localhost",
                 broker_port: int = 1883, keepalive: int = 60, qos: int = 1):
        self.client_id = client_id
        self.broker_host = broker_host
        self.broker_port = broker_port
        self.keepalive = keepalive
        self.qos = qos
        self.logger = setup_logger(f"mqtt.{client_id}")
        self._connected = False
        self._subscriptions: dict[str, Callable] = {}
        self._lock = threading.Lock()

        self.client = mqtt.Client(client_id=client_id, protocol=mqtt.MQTTv311)
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message
        self.client.reconnect_delay_set(min_delay=1, max_delay=30)

    def connect(self):
        try:
            self.client.connect(self.broker_host, self.broker_port, self.keepalive)
            self.client.loop_start()
            self.logger.info(f"Connecting to {self.broker_host}:{self.broker_port}")
        except Exception as e:
            self.logger.error(f"[{ErrorCode.E4001}] Connection failed: {e}")
            raise

    def disconnect(self):
        self.client.loop_stop()
        self.client.disconnect()
        self._connected = False
        self.logger.info("Disconnected")

    def publish(self, topic: str, payload: dict):
        try:
            msg = json.dumps(payload, ensure_ascii=False)
            result = self.client.publish(topic, msg, qos=self.qos)
            if result.rc != mqtt.MQTT_ERR_SUCCESS:
                self.logger.warning(f"Publish failed on {topic}: rc={result.rc}")
        except Exception as e:
            self.logger.error(f"[{ErrorCode.E4002}] Publish error: {e}")

    def subscribe(self, topic: str, callback: Callable):
        with self._lock:
            self._subscriptions[topic] = callback
        if self._connected:
            self.client.subscribe(topic, qos=self.qos)
            self.logger.info(f"Subscribed to {topic}")

    @property
    def connected(self) -> bool:
        return self._connected

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self._connected = True
            self.logger.info("Connected to broker")
            with self._lock:
                for topic in self._subscriptions:
                    self.client.subscribe(topic, qos=self.qos)
        else:
            self.logger.error(f"[{ErrorCode.E4001}] Connect failed: rc={rc}")

    def _on_disconnect(self, client, userdata, rc):
        self._connected = False
        if rc != 0:
            self.logger.warning(f"Unexpected disconnect: rc={rc}, reconnecting...")

    def _on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode('utf-8'))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            self.logger.error(f"[{ErrorCode.E4002}] Decode error on {msg.topic}: {e}")
            return

        with self._lock:
            for pattern, callback in self._subscriptions.items():
                if mqtt.topic_matches_sub(pattern, msg.topic):
                    try:
                        callback(msg.topic, payload)
                    except Exception as e:
                        self.logger.error(f"Callback error on {msg.topic}: {e}")
