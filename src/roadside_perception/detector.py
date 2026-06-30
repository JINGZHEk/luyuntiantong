import numpy as np
from typing import Optional
from src.utils import setup_logger, ErrorCode


class Detector:
    """YOLOv8-based object detector for roadside perception."""

    def __init__(self, model_name: str = "yolov8n", confidence: float = 0.4,
                 iou_threshold: float = 0.5, target_classes: list = None):
        self.logger = setup_logger("roadside.detector")
        self.confidence = confidence
        self.iou_threshold = iou_threshold
        self.target_classes = target_classes or ["person", "car", "truck", "bicycle"]
        self.model = None
        self._class_map = {
            0: "person", 1: "bicycle", 2: "car", 3: "motorcycle",
            5: "bus", 7: "truck"
        }
        self._load_model(model_name)

    def _load_model(self, model_name: str):
        try:
            from ultralytics import YOLO
            self.model = YOLO(f"{model_name}.pt")
            self.logger.info(f"Model loaded: {model_name}")
        except Exception as e:
            self.logger.error(f"[{ErrorCode.E1001}] Model load failed: {e}")
            self.model = None

    def detect(self, image: np.ndarray) -> list:
        """
        Run detection on a single frame.
        Returns list of dicts: {bbox, class, confidence, track_id}
        """
        if self.model is None:
            return []

        results = self.model.track(
            image,
            conf=self.confidence,
            iou=self.iou_threshold,
            persist=True,
            verbose=False,
        )

        detections = []
        for result in results:
            if result.boxes is None:
                continue
            boxes = result.boxes
            for i in range(len(boxes)):
                cls_id = int(boxes.cls[i].item())
                cls_name = self._class_map.get(cls_id, "unknown")
                if cls_name not in self.target_classes:
                    continue

                x1, y1, x2, y2 = boxes.xyxy[i].tolist()
                conf = boxes.conf[i].item()
                track_id = int(boxes.id[i].item()) if boxes.id is not None else i

                detections.append({
                    "track_id": track_id,
                    "class": cls_name,
                    "bbox": [x1, y1, x2 - x1, y2 - y1],  # [x, y, w, h]
                    "confidence": round(conf, 3),
                })

        return detections

    def detect_from_annotations(self, annotations: list) -> list:
        """
        Use ground-truth annotations directly (for simulation/replay mode).
        Each annotation: {track_id, class, bbox, world_pos, velocity}
        """
        detections = []
        for ann in annotations:
            cls_name = ann.get("class", "person")
            if cls_name not in self.target_classes:
                continue
            detections.append({
                "track_id": ann["track_id"],
                "class": cls_name,
                "bbox": ann.get("bbox", [0, 0, 50, 120]),
                "confidence": ann.get("confidence", 0.95),
                "world_pos": ann.get("world_pos"),
                "velocity": ann.get("velocity"),
            })
        return detections
