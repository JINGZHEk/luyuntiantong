import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from src.dataset import TrajectoryDataset


class TrajectoryDatasetTest(unittest.TestCase):
    def test_skips_malformed_rows_without_dropping_valid_tracks(self):
        dataset = TrajectoryDataset(
            [
                {"class": "car", "x": 1, "y": 2, "timestamp": 0},
                {"track_id": 1, "class": "car", "x": None, "y": 2, "timestamp": 0},
                {"track_id": 2, "class": "person", "x": 1, "y": 2, "timestamp": 0},
            ]
        )

        self.assertEqual(len(dataset), 1)
        self.assertEqual(dataset[0][0].track_id, 2)

    def test_cleans_deduplicates_resamples_and_splits_long_gaps(self):
        points = [
            {"track_id": 1, "class": "car", "x": 0, "y": 0, "vx": 10, "vy": 0, "timestamp": 0, "confidence": 0.9},
            {"track_id": 1, "class": "car", "x": 99, "y": 0, "vx": 10, "vy": 0, "timestamp": 0, "confidence": 0.4},
            {"track_id": 1, "class": "car", "x": 2, "y": 0, "vx": 10, "vy": 0, "timestamp": 200, "confidence": 0.9},
            {"track_id": 1, "class": "car", "x": 10, "y": 0, "vx": 10, "vy": 0, "timestamp": 1000, "confidence": 0.9},
            {"track_id": 2, "class": "person", "x": 1, "y": 1, "vx": 0, "vy": 0, "timestamp": 0, "confidence": 0.2},
            {"track_id": 3, "class": "car", "x": 201, "y": 0, "vx": 0, "vy": 0, "timestamp": 0, "confidence": 0.9},
        ]

        dataset = TrajectoryDataset(points)

        self.assertEqual(len(dataset), 2)
        self.assertEqual([point.timestamp for point in dataset[0]], [0, 100, 200])
        self.assertEqual(dataset[0][0].x, 0)
        self.assertEqual(dataset[0][1].x, 1)
        self.assertEqual(dataset[1][0].timestamp, 1000)

    def test_loads_frame_json_and_builds_twenty_twenty_samples(self):
        frames = []
        for index in range(40):
            frames.append(
                {
                    "timestamp": index * 100,
                    "annotations": [
                        {
                            "track_id": 8,
                            "class": "person",
                            "world_pos": [index * 0.1, 2.0],
                            "velocity": [1.0, 0.0],
                            "confidence": 0.95,
                        }
                    ],
                }
            )
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "trajectory.json"
            source.write_text(json.dumps({"frames": frames}), encoding="utf-8")
            dataset = TrajectoryDataset.from_json(source)

        samples = dataset.to_supervised_samples()
        self.assertEqual(len(samples), 1)
        self.assertEqual(len(samples[0]["input_seq"]), 20)
        self.assertEqual(len(samples[0]["gt_seq"]), 20)
        self.assertEqual(samples[0]["input_seq"][0]["class"], "person")

    def test_loads_scenario_library_sqlite(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "scenario.db"
            connection = sqlite3.connect(path)
            connection.executescript(
                "CREATE TABLE scenario_actors (scenario_id TEXT, actor_id TEXT, track_id INTEGER, actor_class TEXT);"
                "CREATE TABLE scenario_keyframes (scenario_id TEXT, actor_id TEXT, t_ms INTEGER, "
                "position_x REAL, position_y REAL, velocity_x REAL, velocity_y REAL, confidence REAL);"
                "INSERT INTO scenario_actors VALUES ('S1', 'a1', 1, 'car');"
                "INSERT INTO scenario_keyframes VALUES ('S1', 'a1', 0, 0, 0, 1, 0, 0.9);"
                "INSERT INTO scenario_keyframes VALUES ('S1', 'a1', 100, 0.1, 0, 1, 0, 0.9);"
            )
            connection.commit()
            connection.close()

            dataset = TrajectoryDataset.from_sqlite(path, scenario_id="S1")

        self.assertEqual(len(dataset), 1)
        self.assertEqual(dataset[0][1].track_id, 1)
        self.assertEqual(dataset[0][1].x, 0.1)


if __name__ == "__main__":
    unittest.main()
