import unittest

from src.roadside_perception.tracker import DeepSortTracker


class FakeTrack:
    def __init__(self, track_id, confirmed, ltrb, det_class, det_conf):
        self.track_id = track_id
        self._confirmed = confirmed
        self._ltrb = ltrb
        self.det_class = det_class
        self.det_conf = det_conf

    def is_confirmed(self):
        return self._confirmed

    def to_ltrb(self):
        return self._ltrb


class FakeDeepSort:
    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.received = None

    def update_tracks(self, detections, frame=None):
        self.received = (detections, frame)
        return [
            FakeTrack("7", True, [10, 20, 40, 60], "car", 0.91),
            FakeTrack("8", False, [0, 0, 10, 10], "person", 0.5),
        ]


class TrackerAdapterTest(unittest.TestCase):
    def test_update_normalizes_confirmed_track_output(self):
        holder = {}

        def factory(**kwargs):
            holder["tracker"] = FakeDeepSort(**kwargs)
            return holder["tracker"]

        adapter = DeepSortTracker(tracker_factory=factory, max_age=30, n_init=2)
        result = adapter.update(
            [{"bbox": [10, 20, 30, 40], "confidence": 0.91, "class": "car"}],
            frame="image",
        )

        self.assertEqual(result, [{
            "track_id": 7,
            "bbox": [10.0, 20.0, 30.0, 40.0],
            "class": "car",
            "confidence": 0.91,
        }])
        self.assertEqual(holder["tracker"].received[1], "image")
        self.assertEqual(holder["tracker"].received[0][0][0], [10, 20, 30, 40])

    def test_empty_detection_list_does_not_call_tracker(self):
        class UnexpectedTracker:
            def update_tracks(self, *_args, **_kwargs):
                raise AssertionError("tracker should not be called for empty detections")

        adapter = DeepSortTracker(tracker_instance=UnexpectedTracker())

        self.assertEqual(adapter.update([]), [])


if __name__ == "__main__":
    unittest.main()
