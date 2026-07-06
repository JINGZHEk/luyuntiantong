import unittest

from src.roadside_perception.roadside_agent import RoadsideAgent
from src.roadside_perception.stgnn_predictor import OccAwareSTGNNPredictor, build_node_feature_sequence
from src.utils import get_config_path, load_config


class STGNNPredictorTest(unittest.TestCase):
    def test_build_node_feature_sequence_encodes_motion_class_and_occlusion(self):
        features = build_node_feature_sequence(
            history=[[0.0, 0.0], [1.0, 0.5], [2.0, 1.0]],
            bbox=[10, 20, 30, 40],
            obj_class="person",
            occlusion_level=2,
            fps=10.0,
            history_length=4,
        )

        self.assertEqual(len(features), 4)
        self.assertEqual(features[-1], [2.0, 1.0, 30.0, 40.0, 10.0, 5.0, 1.0, 0.667])
        self.assertEqual(features[0], features[1])

    def test_predictor_falls_back_to_constant_velocity_without_checkpoint(self):
        predictor = OccAwareSTGNNPredictor(history_length=4, predict_steps=3, fps=10.0)
        predictor.update(7, [0.0, 0.0])
        predictor.update(7, [1.0, 0.0])

        prediction = predictor.predict(7, occlusion_level=3)

        self.assertEqual(prediction, [[2.0, 0.0], [3.0, 0.0], [4.0, 0.0]])
        self.assertEqual(predictor.backend_status["mode"], "fallback_constant_velocity")
        self.assertFalse(predictor.backend_status["model_loaded"])

    def test_predictor_exposes_velocity_and_stale_cleanup_for_roadside_agent(self):
        predictor = OccAwareSTGNNPredictor(history_length=4, predict_steps=3, fps=10.0)
        predictor.update(1, [0.0, 0.0])
        predictor.update(1, [0.0, 1.0])
        predictor.update(2, [5.0, 5.0])

        self.assertEqual(predictor.get_velocity(1), [0.0, 10.0])
        predictor.cleanup_stale({1})

        self.assertEqual(predictor.predict(2), [])

    def test_roadside_agent_can_select_stgnn_prediction_backend(self):
        agent = RoadsideAgent.__new__(RoadsideAgent)
        agent.config = {"replay": {"fps": 10}}

        predictor = agent._create_predictor(
            {
                "backend": "stgnn",
                "history_length": 4,
                "predict_steps": 3,
                "model_path": "missing_model.pt",
            }
        )

        self.assertIsInstance(predictor, OccAwareSTGNNPredictor)
        self.assertEqual(predictor.backend_status["mode"], "fallback_constant_velocity")
        self.assertIn("checkpoint not found", predictor.backend_status["reason"])

    def test_roadside_config_declares_prediction_backend_and_model_path(self):
        config = load_config(get_config_path("roadside.yaml"))

        self.assertEqual(config["prediction"]["backend"], "constant_velocity")
        self.assertIn("model_path", config["prediction"])


if __name__ == "__main__":
    unittest.main()
