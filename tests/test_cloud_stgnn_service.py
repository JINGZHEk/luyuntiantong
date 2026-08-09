import unittest

from src.cloud_twin.stgnn_service import CloudSTGNNService


class FakePredictor:
    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.updates = []
        self.cleaned = []
        self.backend_status = {
            "mode": "torchscript_stgnn",
            "model_loaded": True,
            "model_path": kwargs.get("model_path"),
            "reason": None,
        }

    def update(self, track_id, position, metadata=None):
        self.updates.append((track_id, position, metadata))

    def predict(self, track_id, occlusion_level=0):
        return [[float(track_id), 1.0], [float(track_id), 2.0]]

    def get_velocity(self, track_id):
        return [1.0, 0.0]

    def cleanup_stale(self, active_ids):
        self.cleaned.append(set(active_ids))


class CleanupAwarePredictor(FakePredictor):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.histories = {}

    def update(self, track_id, position, metadata=None):
        super().update(track_id, position, metadata)
        self.histories.setdefault(track_id, []).append(position)

    def predict(self, track_id, occlusion_level=0):
        if len(self.histories.get(track_id, [])) < 2:
            return []
        return super().predict(track_id, occlusion_level)

    def cleanup_stale(self, active_ids):
        super().cleanup_stale(active_ids)
        self.histories = {
            track_id: history
            for track_id, history in self.histories.items()
            if track_id in active_ids
        }


class CloudSTGNNServiceTest(unittest.TestCase):
    def test_history_isolated_by_node_and_track(self):
        created = []

        def factory(**kwargs):
            predictor = FakePredictor(**kwargs)
            created.append(predictor)
            return predictor

        service = CloudSTGNNService(
            model_path="model.ts",
            min_history=2,
            predictor_factory=factory,
        )

        first = {
            "node_id": "node_a",
            "frame_id": 1,
            "objects": [{"track_id": 5, "class": "car", "bbox": [0, 0, 10, 10], "world_pos": [0, 0]}],
        }
        second = {
            "node_id": "node_a",
            "frame_id": 2,
            "objects": [{"track_id": 5, "class": "car", "bbox": [0, 0, 10, 10], "world_pos": [1, 0]}],
        }
        other_node = {
            "node_id": "node_b",
            "frame_id": 1,
            "objects": [{"track_id": 5, "class": "car", "bbox": [0, 0, 10, 10], "world_pos": [10, 0]}],
        }

        first_result = service.update_and_predict(first)
        second_result = service.update_and_predict(second)
        other_result = service.update_and_predict(other_node)

        self.assertEqual(first_result["objects"][0]["prediction_status"], "deferred")
        self.assertEqual(second_result["objects"][0]["prediction_status"], "ready")
        self.assertEqual(other_result["objects"][0]["prediction_status"], "deferred")
        self.assertEqual(len(created), 2)
        self.assertEqual(len(created[0].updates), 2)
        self.assertEqual(len(created[1].updates), 1)
        self.assertEqual(second_result["prediction"]["status"], "ready")

    def test_invalid_coordinate_skips_predictor_creation(self):
        created = []

        def factory(**kwargs):
            created.append(kwargs)
            return FakePredictor(**kwargs)

        service = CloudSTGNNService(min_history=2, predictor_factory=factory)
        result = service.update_and_predict(
            {
                "node_id": "node_a",
                "objects": [{"track_id": 5, "class": "car", "world_pos": None}],
            }
        )

        self.assertEqual(created, [])
        self.assertEqual(result["objects"][0]["prediction_status"], "invalid_coordinate")
        self.assertEqual(result["prediction"]["status"], "invalid_coordinate")

    def test_disabled_service_does_not_create_predictor(self):
        created = []

        def factory(**kwargs):
            created.append(kwargs)
            return FakePredictor(**kwargs)

        service = CloudSTGNNService(enabled=False, predictor_factory=factory)
        result = service.update_and_predict(
            {
                "node_id": "node_a",
                "objects": [{"track_id": 5, "class": "car", "world_pos": [1.0, 2.0]}],
            }
        )

        self.assertEqual(created, [])
        self.assertEqual(result["objects"][0]["prediction_status"], "deferred")
        self.assertEqual(result["prediction"]["status"], "deferred")

    def test_missing_checkpoint_reports_fallback(self):
        service = CloudSTGNNService(
            model_path="missing-cloud-model.ts",
            min_history=2,
        )
        payload = {
            "node_id": "node_a",
            "objects": [{"track_id": 5, "class": "car", "bbox": [0, 0, 10, 10], "world_pos": [0, 0]}],
        }

        service.update_and_predict(payload)
        result = service.update_and_predict(
            {
                **payload,
                "objects": [{"track_id": 5, "class": "car", "bbox": [0, 0, 10, 10], "world_pos": [1, 0]}],
            }
        )

        self.assertEqual(result["objects"][0]["prediction_status"], "fallback")
        self.assertIn("checkpoint not found", result["prediction"]["reason"])

    def test_cleanup_keeps_numeric_track_ids(self):
        service = CloudSTGNNService(
            min_history=2,
            predictor_factory=lambda **kwargs: CleanupAwarePredictor(**kwargs),
        )
        service.update_and_predict(
            {
                "node_id": "node_a",
                "objects": [{"track_id": 5, "world_pos": [0.0, 0.0]}],
            }
        )
        result = service.update_and_predict(
            {
                "node_id": "node_a",
                "objects": [{"track_id": 5, "world_pos": [1.0, 0.0]}],
            }
        )

        self.assertEqual(result["objects"][0]["prediction_status"], "ready")


if __name__ == "__main__":
    unittest.main()
