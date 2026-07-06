import threading
from typing import Callable

import paho.mqtt.client as mqtt

from src.utils import setup_logger


class InMemoryBroker:
    """Small synchronous MQTT-like broker for local integration tests."""

    def __init__(self):
        self._subscriptions: list[tuple[str, Callable[[str, dict], None]]] = []
        self._lock = threading.Lock()

    def subscribe(self, topic_pattern: str, callback: Callable[[str, dict], None]):
        with self._lock:
            self._subscriptions.append((topic_pattern, callback))

    def publish(self, topic: str, payload: dict):
        with self._lock:
            subscriptions = list(self._subscriptions)

        for pattern, callback in subscriptions:
            if mqtt.topic_matches_sub(pattern, topic):
                callback(topic, payload)


class InMemoryMQTTClient:
    """MQTTClient-compatible client backed by an in-process broker."""

    def __init__(self, client_id: str, broker: InMemoryBroker):
        self.client_id = client_id
        self.broker = broker
        self.logger = setup_logger(f"inmemory_mqtt.{client_id}")
        self._connected = False
        self._subscriptions: dict[str, Callable[[str, dict], None]] = {}

    def connect(self):
        self._connected = True
        self.logger.info("Connected to in-memory broker")

    def disconnect(self):
        self._connected = False
        self.logger.info("Disconnected from in-memory broker")

    def publish(self, topic: str, payload: dict):
        if not self._connected:
            self.logger.warning(f"Publish while disconnected on {topic}")
        self.broker.publish(topic, payload)

    def subscribe(self, topic: str, callback: Callable[[str, dict], None]):
        self._subscriptions[topic] = callback
        self.broker.subscribe(topic, callback)
        self.logger.info(f"Subscribed to {topic}")

    @property
    def connected(self) -> bool:
        return self._connected
