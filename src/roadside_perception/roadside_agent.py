"""
Roadside Agent - Main entry point for roadside perception.
Loads frames from dataset, runs detection + prediction, publishes to MQTT.
"""
import time
import argparse

from src.utils import load_config, get_config_path, setup_logger
from src.communication import MQTTClient, PerceptionMessage, HeartbeatMessage, make_timestamp
from src.communication.mqtt_config import apply_mqtt_env_overrides
from src.roadside_perception import Detector
from src.roadside_perception.coordinate_mapper import CoordinateMapper


class RoadsideAgent:
    def __init__(self, config_path: str = None):
        self.config = load_config(config_path or get_config_path("roadside.yaml"))
        mqtt_config = apply_mqtt_env_overrides(load_config(get_config_path("mqtt.yaml")))
        self.logger = setup_logger("roadside_agent", log_dir="logs")

        self.node_id = self.config.get("node_id", "roadside_001")
        self.scene_id = self.config.get("scene_id", "scene_001")

        # MQTT
        self.mqtt = MQTTClient(
            client_id=f"roadside_{self.node_id}",
            broker_host=mqtt_config["broker"]["host"],
            broker_port=mqtt_config["broker"]["port"],
        )

        # Perception modules
        det_config = self.config.get("detection", {})
        tracking_config = self.config.get("tracking", {})
        self.detector = Detector(
            model_name=det_config.get("model", "yolov8n"),
            confidence=det_config.get("confidence_threshold", 0.4),
            iou_threshold=det_config.get("iou_threshold", 0.5),
            target_classes=det_config.get("target_classes", ["person", "car"]),
            mode=det_config.get("mode", "yolo"),
            tracker_backend=tracking_config.get("backend", "ultralytics"),
            tracker_factory=None,
        )

        pred_config = self.config.get("prediction", {})
        self.prediction_location = pred_config.get("location", "local")
        self.predictor = self._create_predictor(pred_config)

        self.coordinate_mapper = self._create_coordinate_mapper(
            self.config.get("coordinates", {})
        )

        from src.roadside_perception import OcclusionEstimator

        self.occlusion = OcclusionEstimator(
            area_ratio_threshold=self.config.get("occlusion", {}).get("area_ratio_threshold", 0.6)
        )

        self._frame_count = 0
        self._last_heartbeat = 0

    def start(self):
        self.mqtt.connect()
        self.logger.info(f"Roadside agent [{self.node_id}] started")

        # Subscribe to playback control
        topic = f"v2x/{self.scene_id}/control/playback"
        self.mqtt.subscribe(topic, self._on_playback_control)

    def process_frame(self, frame_data: dict):
        """
        Process a single frame from replay engine or camera.
        frame_data: {frame_id, timestamp, image (optional), annotations}
        """
        if "perception" in frame_data:
            self._publish_precomputed_perception(frame_data["perception"])
            return

        t_start = time.time()
        frame_id = frame_data.get("frame_id", self._frame_count)
        timestamp = frame_data.get("timestamp", make_timestamp())

        detections = self._detect_frame(frame_data)

        # Process each detection
        objects = []
        active_ids = set()

        for det in detections:
            track_id = det["track_id"]
            active_ids.add(track_id)

            # Occlusion estimation
            occ_level = det.get("occlusion_level")
            if occ_level is None:
                occ_level = self.occlusion.estimate(det)

            metadata = {
                "bbox": det.get("bbox", [0, 0, 50, 120]),
                "class": det["class"],
            }

            world_pos, coordinate_status, coordinate_reason = self._resolve_world_position(det)

            predicted = []
            velocity = det.get("velocity") or [0.0, 0.0]
            prediction_status = "invalid_coordinate"
            if coordinate_status == "valid":
                if getattr(self, "prediction_location", "local") == "cloud":
                    prediction_status = "deferred"
                elif self.predictor is not None:
                    self._update_predictor(track_id, world_pos, metadata)
                    predicted = self.predictor.predict(track_id, occ_level)
                    velocity = self.predictor.get_velocity(track_id) or velocity
                    prediction_status = "local"

            objects.append({
                "track_id": track_id,
                "class": det["class"],
                "bbox": det.get("bbox", [0, 0, 50, 120]),
                "world_pos": world_pos,
                "velocity": velocity,
                "confidence": det["confidence"],
                "occlusion_level": occ_level,
                "predicted_traj": predicted[:10],  # Send first 10 steps to reduce payload
                "coordinate_status": coordinate_status,
                "coordinate_reason": coordinate_reason,
                "prediction_status": prediction_status,
            })

        # Cleanup stale tracks
        if self.predictor is not None and getattr(self, "prediction_location", "local") != "cloud":
            self.predictor.cleanup_stale(active_ids)

        # Publish perception
        processing_time = (time.time() - t_start) * 1000
        msg = PerceptionMessage(
            timestamp=timestamp,
            frame_id=frame_id,
            node_id=self.node_id,
            objects=[obj for obj in objects],
            processing_time_ms=round(processing_time, 1),
            scene_id=self.scene_id,
            source=self._message_source(frame_data),
            coordinate_frame="road_xy",
            prediction={
                "location": getattr(self, "prediction_location", "local"),
                "backend": self.config.get("prediction", {}).get("backend", "unknown")
                if hasattr(self, "config") else "unknown",
                "status": self._prediction_status(objects),
                "model_path": self.config.get("prediction", {}).get("model_path")
                if hasattr(self, "config") else None,
                "latency_ms": None,
                "reason": self._prediction_reason(objects),
            },
        )

        topic = f"v2x/{self.scene_id}/roadside/{self.node_id}/perception"
        self.mqtt.publish(topic, msg.to_dict())

        self._frame_count += 1
        self._send_heartbeat_if_needed()

    def _publish_precomputed_perception(self, perception: dict):
        payload = dict(perception)
        payload["node_id"] = self.node_id
        payload.setdefault("timestamp", make_timestamp())
        payload.setdefault("frame_id", self._frame_count)
        payload.setdefault("objects", [])
        payload.setdefault("processing_time_ms", 0.0)

        topic = f"v2x/{self.scene_id}/roadside/{self.node_id}/perception"
        self.mqtt.publish(topic, payload)

        self._frame_count += 1
        self._send_heartbeat_if_needed()

    def _send_heartbeat_if_needed(self):
        now = time.time()
        if now - self._last_heartbeat >= 5.0:
            hb = HeartbeatMessage(
                timestamp=make_timestamp(),
                node_id=self.node_id,
                status="active",
                fps=10.0,
            )
            topic = f"v2x/{self.scene_id}/roadside/{self.node_id}/heartbeat"
            self.mqtt.publish(topic, hb.to_dict())
            self._last_heartbeat = now

    def _detect_frame(self, frame_data: dict) -> list:
        mode = getattr(self.detector, "mode", "yolo")
        has_image = "image" in frame_data
        has_annotations = "annotations" in frame_data

        if mode == "annotations":
            return self.detector.detect_from_annotations(frame_data["annotations"]) if has_annotations else []

        if mode == "auto":
            if has_image and getattr(self.detector, "model", None) is not None:
                return self.detector.detect(frame_data["image"])
            return self.detector.detect_from_annotations(frame_data["annotations"]) if has_annotations else []

        if mode == "yolo" and has_image:
            return self.detector.detect(frame_data["image"])

        if has_annotations:
            self.logger.warning("YOLO mode received no image; falling back to annotations")
            return self.detector.detect_from_annotations(frame_data["annotations"])

        return []

    def _create_predictor(self, pred_config: dict):
        backend = pred_config.get("backend", "constant_velocity")
        if backend in ("none", "cloud"):
            return None
        fps = self.config.get("replay", {}).get("fps", 10)
        if backend == "stgnn":
            from src.roadside_perception.stgnn_predictor import OccAwareSTGNNPredictor

            return OccAwareSTGNNPredictor(
                history_length=pred_config.get("history_length", 8),
                predict_steps=pred_config.get("predict_steps", 30),
                fps=fps,
                model_path=pred_config.get("model_path"),
            )

        from src.roadside_perception import TrajectoryPredictor

        return TrajectoryPredictor(
            history_length=pred_config.get("history_length", 10),
            predict_steps=pred_config.get("predict_steps", 30),
            fps=fps,
            smoothing_alpha=pred_config.get("smoothing_alpha", 0.3),
        )

    def _update_predictor(self, track_id: int, world_pos: list, metadata: dict) -> None:
        if self.predictor is None:
            return
        try:
            self.predictor.update(track_id, world_pos, metadata=metadata)
        except TypeError:
            self.predictor.update(track_id, world_pos)

    def _on_playback_control(self, topic: str, payload: dict):
        self.logger.info(f"Playback control: {payload}")

    def _create_coordinate_mapper(self, config: dict):
        mode = config.get("mode", "none")
        if mode in ("none", "image"):
            return None
        if mode != "homography":
            raise ValueError(f"Unsupported coordinate mode: {mode}")
        calibration_path = config.get("calibration_path")
        if not calibration_path:
            self.logger.warning("Coordinate mapping is enabled but calibration_path is missing")
            return None
        try:
            return CoordinateMapper.from_file(calibration_path)
        except (FileNotFoundError, ValueError) as exc:
            self.logger.warning(f"Coordinate mapper disabled: {exc}")
            return None

    def _resolve_world_position(self, detection: dict):
        if detection.get("world_pos") is not None:
            return detection["world_pos"], "valid", None
        mapper = getattr(self, "coordinate_mapper", None)
        if mapper is None:
            return None, "invalid", "world_pos missing and calibration unavailable"
        result = mapper.image_bbox_to_world(detection.get("bbox", []))
        return result.get("world_pos"), result.get("status", "invalid"), result.get("reason")

    def _message_source(self, frame_data: dict) -> dict:
        source = frame_data.get("source")
        if isinstance(source, dict):
            result = dict(source)
        elif source:
            result = {"device_type": "pc_replay", "input": str(source)}
        else:
            result = {"device_type": "roadside_agent", "input_type": "frame"}

        config = getattr(self, "config", {}) or {}
        detection_config = config.get("detection", {})
        tracking_config = config.get("tracking", {})
        result.setdefault("detector", detection_config.get("mode", "unknown"))
        result.setdefault("tracker", tracking_config.get("backend", "unknown"))
        return result

    @staticmethod
    def _prediction_status(objects: list[dict]) -> str:
        statuses = {obj.get("prediction_status") for obj in objects}
        if "invalid_coordinate" in statuses:
            return "invalid_coordinate"
        if "deferred" in statuses:
            return "deferred"
        if "local" in statuses:
            return "local"
        return "deferred"

    @staticmethod
    def _prediction_reason(objects: list[dict]) -> str | None:
        reasons = [obj.get("coordinate_reason") for obj in objects if obj.get("coordinate_reason")]
        return reasons[0] if reasons else None

    def stop(self):
        self.mqtt.disconnect()
        self.logger.info("Roadside agent stopped")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Roadside Perception Agent")
    parser.add_argument("--config", default=None, help="Config file path")
    args = parser.parse_args()

    agent = RoadsideAgent(config_path=args.config)
    agent.start()
    print(f"Roadside agent running. Press Ctrl+C to stop.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        agent.stop()
