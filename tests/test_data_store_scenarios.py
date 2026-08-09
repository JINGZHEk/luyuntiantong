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
                frame_indexes = {
                    row[1]
                    for row in conn.execute("PRAGMA index_list(frames)").fetchall()
                }
                run_ts_index_columns = [
                    row[2]
                    for row in conn.execute("PRAGMA index_info(idx_frames_run_ts)").fetchall()
                ]

        self.assertTrue(
            {
                "scenario_templates",
                "scenario_actors",
                "scenario_keyframes",
                "scenario_events",
                "scenario_runs",
            }.issubset(tables)
        )
        self.assertIn("idx_frames_run_ts", frame_indexes)
        self.assertEqual(run_ts_index_columns, ["run_id", "timestamp", "frame_id"])

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

    def test_create_and_finish_scenario_run_persists_playback_contract_fields(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = DataStore(str(Path(tmp) / "scenario.db"))

            store.create_scenario_run("run-new", "GP-01", 1000, 12.5, True, 42)
            finished = store.finish_scenario_run(
                "run-new",
                "failed",
                2500,
                17,
                "mqtt disconnected",
            )

            with contextlib.closing(sqlite3.connect(store.db_path)) as conn:
                row = conn.execute(
                    "SELECT run_id, scenario_id, started_at, ended_at, requested_fps, "
                    "loop_enabled, random_seed, status, current_frame, error_message "
                    "FROM scenario_runs WHERE run_id = ?",
                    ("run-new",),
                ).fetchone()

        self.assertEqual(
            row,
            (
                "run-new",
                "GP-01",
                1000,
                2500,
                12.5,
                1,
                42,
                "failed",
                17,
                "mqtt disconnected",
            ),
        )
        self.assertEqual(finished["ended_at"], 2500)
        self.assertEqual(finished["current_frame"], 17)
        self.assertEqual(finished["error_message"], "mqtt disconnected")

    def test_existing_scenario_runs_table_migrates_playback_contract_columns(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "legacy_scenario_runs.db"
            with contextlib.closing(sqlite3.connect(db_path)) as conn:
                conn.execute(
                    "CREATE TABLE scenario_runs ("
                    "run_id TEXT PRIMARY KEY,"
                    "scenario_id TEXT NOT NULL,"
                    "scene_id TEXT NOT NULL,"
                    "status TEXT NOT NULL DEFAULT 'running',"
                    "started_at INTEGER NOT NULL,"
                    "finished_at INTEGER,"
                    "metadata TEXT,"
                    "summary TEXT"
                    ")"
                )
                conn.execute(
                    "INSERT INTO scenario_runs (run_id, scenario_id, scene_id, status, "
                    "started_at, metadata) VALUES (?, ?, ?, ?, ?, ?)",
                    ("legacy-run-001", "old-scenario", "scene_001", "running", 900, "{}"),
                )
                conn.commit()

            store = DataStore(str(db_path))
            finished = store.finish_scenario_run(
                "legacy-run-001",
                "completed",
                1200,
                9,
            )
            with contextlib.closing(sqlite3.connect(store.db_path)) as conn:
                columns = [row[1] for row in conn.execute("PRAGMA table_info(scenario_runs)")]
                row = conn.execute(
                    "SELECT ended_at, requested_fps, loop_enabled, random_seed, "
                    "current_frame, error_message FROM scenario_runs WHERE run_id = ?",
                    ("legacy-run-001",),
                ).fetchone()

        self.assertTrue(
            {
                "ended_at",
                "requested_fps",
                "loop_enabled",
                "random_seed",
                "current_frame",
                "error_message",
            }.issubset(columns)
        )
        self.assertEqual(row, (1200, 0.0, 0, 0, 9, None))
        self.assertEqual(finished["finished_at"], 1200)

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
        self.assertEqual(replay["involved_objects"], [])
        self.assertEqual([frame["frame_id"] for frame in replay["replay_frames"]], [1, 2])
        self.assertIn("run_id", event_columns)
        self.assertIn("scenario_id", event_columns)
        self.assertIn("idx_events_run_ts", indexes)

    def test_event_involved_objects_decodes_json_and_keeps_invalid_json_safe(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "events.db"
            store = DataStore(str(db_path))
            store.store_event(
                {
                    "event_id": "evt_valid",
                    "timestamp": 1000,
                    "event_type": "ghost_probe",
                    "severity": "critical",
                    "scene_id": "scene_001",
                    "involved_objects": [{"type": "pedestrian", "track_id": 7}],
                }
            )
            with contextlib.closing(sqlite3.connect(store.db_path)) as conn:
                conn.execute(
                    "INSERT INTO events (event_id, run_id, scenario_id, timestamp, "
                    "event_type, severity, scene_id, involved_objects) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        "evt_invalid",
                        "legacy-run",
                        "scene_001",
                        1001,
                        "ghost_probe",
                        "high",
                        "scene_001",
                        "{bad json",
                    ),
                )
                conn.commit()

            total, events = store.get_events(scene_id="scene_001", limit=10)
            replay = store.get_event_replay("evt_valid")
            by_id = {event["event_id"]: event for event in events}

        self.assertEqual(total, 2)
        self.assertEqual(by_id["evt_valid"]["involved_objects"][0]["track_id"], 7)
        self.assertEqual(replay["involved_objects"][0]["track_id"], 7)
        self.assertEqual(by_id["evt_invalid"]["involved_objects"], "{bad json")


if __name__ == "__main__":
    unittest.main()
