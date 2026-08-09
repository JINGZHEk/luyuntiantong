import unittest

from src.roadside_perception.detector import Detector


class Scalar:
    def __init__(self, value):
        self.value = value

    def item(self):
        return self.value


class FakeBoxes:
    def __init__(self):
        self.cls = [Scalar(2)]
        self.conf = [Scalar(0.88)]
        self.xyxy = [ScalarList([1, 2, 5, 8])]

    def __len__(self):
        return 1


class ScalarList(list):
    def tolist(self):
        return list(self)


class FakeResult:
    boxes = FakeBoxes()


class FakeModel:
    def __init__(self):
        self.predict_calls = []

    def predict(self, image, **kwargs):
        self.predict_calls.append((image, kwargs))
        return [FakeResult()]


class FakeRawTrack:
    track_id = "12"
    det_class = "car"
    det_conf = 0.88

    def is_confirmed(self):
        return True

    def to_ltrb(self):
        return [1, 2, 5, 8]


class FakeTracker:
    def __init__(self):
        self.calls = []

    def update_tracks(self, detections, frame=None):
        self.calls.append((detections, frame))
        return [FakeRawTrack()]


class DetectorTest(unittest.TestCase):
    def test_deepsort_backend_predicts_then_delegates_tracking(self):
        model = FakeModel()
        tracker = FakeTracker()
        detector = Detector(
            model_name="unused",
            confidence=0.4,
            iou_threshold=0.5,
            target_classes=["car"],
            mode="yolo",
            tracker_backend="deepsort",
            model_instance=model,
            tracker_instance=tracker,
        )

        detections = detector.detect("image")

        self.assertEqual(detections[0]["track_id"], 12)
        self.assertEqual(tracker.calls[0][0][0][0], [1, 2, 4, 6])
        self.assertEqual(tracker.calls[0][1], "image")
        self.assertEqual(model.predict_calls[0][0], "image")


if __name__ == "__main__":
    unittest.main()
