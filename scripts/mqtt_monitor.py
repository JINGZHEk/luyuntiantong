"""MQTT Monitor - Debug tool to watch all V2X messages in real-time."""
import time
import json
import argparse
from src.communication import MQTTClient


def main():
    parser = argparse.ArgumentParser(description="V2X MQTT Monitor")
    parser.add_argument("--host", default="localhost", help="MQTT broker host")
    parser.add_argument("--port", type=int, default=1883, help="MQTT broker port")
    parser.add_argument("--topic", default="v2x/#", help="Topic filter")
    args = parser.parse_args()

    msg_count = 0

    def on_message(topic: str, payload: dict):
        nonlocal msg_count
        msg_count += 1
        ts = payload.get("timestamp", "")
        summary = ""

        if "objects" in payload:
            n = len(payload["objects"])
            summary = f"[Perception] {n} objects detected"
        elif "risk_level" in payload and "ttc" in payload:
            summary = f"[Decision] risk={payload['risk_level']} ttc={payload.get('ttc', '?')}s"
        elif "event_type" in payload:
            summary = f"[Event] {payload['event_type']} severity={payload.get('severity', '?')}"
        elif "status" in payload:
            summary = f"[Heartbeat] status={payload['status']}"
        elif "speed" in payload:
            summary = f"[Vehicle] speed={payload.get('speed', 0):.1f}m/s pos={payload.get('position', [])}"
        else:
            summary = json.dumps(payload, ensure_ascii=False)[:100]

        print(f"#{msg_count:04d} | {topic:<50} | {summary}")

    client = MQTTClient(client_id="mqtt_monitor", broker_host=args.host, broker_port=args.port)
    client.connect()
    client.subscribe(args.topic, on_message)

    print(f"Monitoring MQTT topic: {args.topic} on {args.host}:{args.port}")
    print("-" * 100)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        client.disconnect()
        print(f"\nTotal messages received: {msg_count}")


if __name__ == "__main__":
    main()
