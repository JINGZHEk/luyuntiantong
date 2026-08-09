import contextlib
import sqlite3
import tempfile
import unittest
from pathlib import Path

from src.cloud_twin.data_store import DataStore


class DataStoreScenarioTest(unittest.TestCase):
    def test_new_database_creates_scenario_tables(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = DataStore(str(Path(tmp) / "scenario.db"))
            with contextlib.closing(sqlite3.connect(store.db_path)) as conn:
                tables = {
                    row[0]
                    for row in conn.execute(
                        "SELECT name FROM sqlite_master WHERE type = 'table'"
                    )
                }

        self.assertTrue(
            {
                "scenario_templates",
                "scenario_actors",
                "scenario_keyframes",
                "scenario_events",
                "scenario_runs",
            }.issubset(tables)
        )

    def test_same_frame_id_is_isolated_by_run_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = DataStore(str(Path(tmp) / "scenario.db"))

            store.store_frame(
                frame_id=7,
                timestamp=1000,
                scene_id="scene_001",
                perception={"run": "alpha"},
                run_id="run-alpha",
            )
            store.store_frame(
                frame_id=7,
                timestamp=2000,
                scene_id="scene_001",
                perception={"run": "beta"},
                run_id="run-beta",
            )

            alpha = store.get_frame(7, run_id="run-alpha")
            beta = store.get_frame(7, run_id="run-beta")
            alpha_frames = store.list_frames("run-alpha")
            beta_frames = store.list_frames("run-beta")

        self.assertEqual(alpha["perception_data"]["run"], "alpha")
        self.assertEqual(beta["perception_data"]["run"], "beta")
        self.assertEqual([frame["frame_id"] for frame in alpha_frames], [7])
        self.assertEqual([frame["frame_id"] for frame in beta_frames], [7])

    def test_old_frames_migrate_to_legacy_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "legacy.db"
            with contextlib.closing(sqlite3.connect(db_path)) as conn:
                conn.execute(
                    "CREATE TABLE frames ("
                    "frame_id INTEGER PRIMARY KEY,"
                    "timestamp INTEGER NOT NULL,"
                    "scene_id TEXT NOT NULL,"
                    "node_id TEXT,"
                    "perception_data TEXT,"
                    "decision_data TEXT,"
                    "vehicle_status TEXT"
                    ")"
                )
                conn.execute(
                    "INSERT INTO frames VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (3, 1234, "scene_001", "roadside_001", '{"old": true}', None, None),
                )
                conn.commit()

            store = DataStore(str(db_path))
            frame = store.get_frame(3)
            with contextlib.closing(sqlite3.connect(store.db_path)) as conn:
                columns = [row[1] for row in conn.execute("PRAGMA table_info(frames)")]
                pk_columns = [
                    row[1]
                    for row in sorted(
                        conn.execute("PRAGMA table_info(frames)").fetchall(),
                        key=lambda item: item[5],
                    )
                    if row[5]
                ]

        self.assertEqual(frame["run_id"], "legacy-run")
        self.assertEqual(frame["perception_data"]["old"], True)
        self.assertIn("run_id", columns)
        self.assertEqual(pk_columns, ["run_id", "frame_id"])

    def test_create_and_finish_scenario_run_returns_persisted_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = DataStore(str(Path(tmp) / "scenario.db"))

            created = store.create_scenario_run(
                run_id="run-001",
                scenario_id="ghost-probe",
                scene_id="scene_001",
                started_at=1000,
                metadata={"traffic": "heavy"},
            )
            finished = store.finish_scenario_run(
                "run-001",
                finished_at=2000,
                status="completed",
                summary={"events": 2},
            )

        self.assertEqual(created["run_id"], "run-001")
        self.assertEqual(created["status"], "running")
        self.assertEqual(created["metadata"]["traffic"], "heavy")
        self.assertEqual(finished["finished_at"], 2000)
        self.assertEqual(finished["status"], "completed")
        self.assertEqual(finished["summary"]["events"], 2)

    def test_legacy_event_replay_uses_legacy_run_after_migration(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "legacy_events.db"
            with contextlib.closing(sqlite3.connect(db_path)) as conn:
                conn.execute(
                    "CREATE TABLE frames ("
                    "frame_id INTEGER PRIMARY KEY,"
                    "timestamp INTEGER NOT NULL,"
                    "scene_id TEXT NOT NULL,"
                    "node_id TEXT,"
                    "perception_data TEXT,"
                    "decision_data TEXT,"
                    "vehicle_status TEXT"
                    ")"
                )
                conn.execute(
                    "CREATE TABLE events ("
                    "event_id TEXT PRIMARY KEY,"
                    "timestamp INTEGER NOT NULL,"
                    "event_type TEXT NOT NULL,"
                    "severity TEXT NOT NULL,"
                    "scene_id TEXT NOT NULL,"
                    "min_ttc REAL,"
                    "outcome TEXT DEFAULT 'pending',"
                    "description TEXT,"
                    "involved_objects TEXT,"
                    "replay_start_frame INTEGER,"
                    "replay_end_frame INTEGER"
                    ")"
                )
                for frame_id in (1, 2):
                    conn.execute(
                        "INSERT INTO frames VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (frame_id, 1000 + frame_id, "scene_001", "roadside_001", None, None, None),
                    )
                conn.execute(
                    "INSERT INTO events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        "evt_legacy",
                        1100,
                        "ghost_probe",
                        "critical",
                        "scene_001",
                        1.0,
                        "avoided",
                        "legacy replay",
                        "[]",
                        1,
                        2,
                    ),
                )
                conn.commit()

            store = DataStore(str(db_path))
            replay = store.get_event_replay("evt_legacy")
            with contextlib.closing(sqlite3.connect(store.db_path)) as conn:
                event_columns = [row[1] for row in conn.execute("PRAGMA table_info(events)")]
                indexes = {
                    row[1]
                    for row in conn.execute("PRAGMA index_list(events)").fetchall()
                }

        self.assertEqual(replay["run_id"], "legacy-run")
        self.assertEqual(replay["scenario_id"], "scene_001")
        self.assertEqual([frame["frame_id"] for frame in replay["replay_frames"]], [1, 2])
        self.assertIn("run_id", event_columns)
        self.assertIn("scenario_id", event_columns)
        self.assertIn("idx_events_run_ts", indexes)


if __name__ == "__main__":
    unittest.main()
