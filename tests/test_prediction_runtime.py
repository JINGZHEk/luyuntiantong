import tempfile
import threading
import time
import unittest
from pathlib import Path

from src.cloud_twin.data_store import DataStore
from src.cloud_twin.prediction_writer import PredictionWriter
from src.cloud_twin.inference_engine import InferenceEngine


class PredictionRuntimeTest(unittest.TestCase):
    def test_prediction_tables_and_background_writer(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = DataStore(str(Path(tmp) / "runtime.db"))
            writer = PredictionWriter(store)
            writer.enqueue_predictions(7, 1_000, [{"x": 1, "y": 2, "t": 0.1}], 0.8)
            writer.enqueue_inference_log({"batch_size": 1, "infer_ms": 12.5, "track_count": 1, "timestamp": 1_000})
            writer.enqueue_anomaly(7, 1_000, "single_step_displacement_gt_5m")
            deadline = time.time() + 2
            while writer.queue.unfinished_tasks and time.time() < deadline:
                time.sleep(0.01)
            writer.close()

            logs = store.get_prediction_logs(0, 2_000)
            self.assertEqual(len(logs["logs"]), 1)
            self.assertEqual(len(logs["anomalies"]), 1)
            self.assertTrue(store.health_check())

    def test_inference_engine_reports_disabled_health(self):
        InferenceEngine.reset_instance()
        engine = InferenceEngine()
        self.assertFalse(engine.health()["model_loaded"])
        self.assertEqual(len(engine.predict_batch([[[0.0] * 8] * 2])), 1)
        InferenceEngine.reset_instance()

    def test_inference_queue_micro_batches_concurrent_requests(self):
        InferenceEngine.reset_instance()
        records = []
        engine = InferenceEngine(batch_callback=records.append, max_batch_wait_ms=50)
        barrier = threading.Barrier(3)
        results = []

        def infer():
            barrier.wait()
            results.append(engine.predict_batch([[[0.0] * 8] * 2]))

        workers = [threading.Thread(target=infer) for _ in range(2)]
        for worker in workers:
            worker.start()
        barrier.wait()
        for worker in workers:
            worker.join(timeout=2)

        self.assertEqual(len(results), 2)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["batch_size"], 2)
        InferenceEngine.reset_instance()


if __name__ == "__main__":
    unittest.main()
