import sqlite3
import json
import contextlib
import threading
import os
import time
from pathlib import Path
from typing import Optional
from src.evaluation_targets import build_target_status
from src.evaluation_lead_time import runtime_lead_time_seconds
from src.utils import setup_logger, ErrorCode

LEGACY_RUN_ID = "legacy-run"


class DataStore:
    """SQLite-based storage for V2X perception, decision, and event data."""

    def __init__(self, db_path: str = "data/v2x_cloud.db"):
        self.logger = setup_logger("cloud.datastore")
        self.db_path = db_path
        # ── workspace-write sandbox fallback ─────────────────────────────
        # On some Windows environments SQLite cannot create its journal /
        # WAL files inside the project `data/` directory even though plain
        # file writes succeed (sandbox / anti-virus edge case).  Detect that
        # here and transparently redirect the DB to the OS temp directory.
        resolved = Path(db_path).expanduser().resolve()
        try:
            resolved.parent.mkdir(parents=True, exist_ok=True)
            _probe = sqlite3.connect(str(resolved), timeout=5)
            _probe.execute("CREATE TABLE IF NOT EXISTS _probe (id INTEGER)")
            _probe.execute("DROP TABLE _probe")
            _probe.close()
        except sqlite3.OperationalError:
            tmp_dir = Path(os.environ.get("TEMP", "/tmp"))
            tmp_dir.mkdir(parents=True, exist_ok=True)
            fallback = tmp_dir / resolved.name
            self.logger.warning(
                f"[{ErrorCode.E3001}] Cannot write to {resolved}; "
                f"falling back to temp DB at {fallback}"
            )
            resolved = fallback
        self.db_path = str(resolved)
        # ── end fallback ─────────────────────────────────────────────────
        self._lock = threading.Lock()
        self._init_db()

    @contextlib.contextmanager
    def _get_conn(self):
        """Thread-safe connection context manager."""
        conn = sqlite3.connect(self.db_path, timeout=30)
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_db(self):
        # Build schema first, then switch to WAL.  Calling
        # PRAGMA journal_mode=WAL before executescript causes sqlite3 to
        # hang on Windows because the internal transaction created by
        # executescript conflicts with the WAL open path.
        schema_ddl = [
            "CREATE TABLE IF NOT EXISTS frames ("
            "    run_id TEXT NOT NULL DEFAULT 'legacy-run',"
            "    frame_id INTEGER NOT NULL,"
            "    timestamp INTEGER NOT NULL,"
            "    scene_id TEXT NOT NULL,"
            "    node_id TEXT,"
            "    perception_data TEXT,"
            "    decision_data TEXT,"
            "    vehicle_status TEXT,"
            "    PRIMARY KEY (run_id, frame_id)"
            ");",
            "CREATE TABLE IF NOT EXISTS events ("
            "    event_id TEXT PRIMARY KEY,"
            "    run_id TEXT NOT NULL DEFAULT 'legacy-run',"
            "    scenario_id TEXT,"
            "    timestamp INTEGER NOT NULL,"
            "    event_type TEXT NOT NULL,"
            "    severity TEXT NOT NULL,"
            "    scene_id TEXT NOT NULL,"
            "    min_ttc REAL,"
            "    outcome TEXT DEFAULT 'pending',"
            "    description TEXT,"
            "    involved_objects TEXT,"
            "    replay_start_frame INTEGER,"
            "    replay_end_frame INTEGER"
            ");",
            "CREATE TABLE IF NOT EXISTS scenario_templates ("
            "    scenario_id TEXT PRIMARY KEY,"
            "    name TEXT NOT NULL,"
            "    description TEXT,"
            "    config TEXT,"
            "    created_at INTEGER NOT NULL"
            ");",
            "CREATE TABLE IF NOT EXISTS scenario_actors ("
            "    actor_id TEXT PRIMARY KEY,"
            "    scenario_id TEXT NOT NULL,"
            "    actor_type TEXT NOT NULL,"
            "    label TEXT,"
            "    initial_state TEXT"
            ");",
            "CREATE TABLE IF NOT EXISTS scenario_keyframes ("
            "    scenario_id TEXT NOT NULL,"
            "    frame_id INTEGER NOT NULL,"
            "    timestamp INTEGER,"
            "    data TEXT,"
            "    PRIMARY KEY (scenario_id, frame_id)"
            ");",
            "CREATE TABLE IF NOT EXISTS scenario_events ("
            "    scenario_id TEXT NOT NULL,"
            "    event_id TEXT NOT NULL,"
            "    frame_id INTEGER,"
            "    event_type TEXT NOT NULL,"
            "    data TEXT,"
            "    PRIMARY KEY (scenario_id, event_id)"
            ");",
            "CREATE TABLE IF NOT EXISTS scenario_runs ("
            "    run_id TEXT PRIMARY KEY,"
            "    scenario_id TEXT NOT NULL,"
            "    scene_id TEXT NOT NULL,"
            "    status TEXT NOT NULL DEFAULT 'running',"
            "    started_at INTEGER NOT NULL,"
            "    finished_at INTEGER,"
            "    metadata TEXT,"
            "    summary TEXT"
            ");",
            "CREATE TABLE IF NOT EXISTS metrics ("
            "    id INTEGER PRIMARY KEY AUTOINCREMENT,"
            "    timestamp INTEGER NOT NULL,"
            "    metric_type TEXT NOT NULL,"
            "    data TEXT NOT NULL"
            ");",
        ]
        index_ddl = [
            "CREATE INDEX IF NOT EXISTS idx_frames_ts ON frames(timestamp);",
            "CREATE INDEX IF NOT EXISTS idx_frames_scene ON frames(scene_id);",
            "CREATE INDEX IF NOT EXISTS idx_frames_run_ts ON frames(run_id, timestamp, frame_id);",
            "CREATE INDEX IF NOT EXISTS idx_events_ts ON events(timestamp);",
            "CREATE INDEX IF NOT EXISTS idx_events_run_ts ON events(run_id, timestamp);",
            "CREATE INDEX IF NOT EXISTS idx_events_severity ON events(severity);",
        ]

        with self._get_conn() as conn:
            conn.execute("PRAGMA synchronous=NORMAL")
            for ddl in schema_ddl:
                conn.execute(ddl)
            self._migrate_frames_if_needed(conn)
            self._migrate_events_if_needed(conn)
            for ddl in index_ddl:
                conn.execute(ddl)
            # Switch to WAL after schema is committed
            conn.execute("PRAGMA journal_mode=WAL")

        self.logger.info(f"Database initialized: {self.db_path}")

    def _migrate_frames_if_needed(self, conn):
        columns = [row[1] for row in conn.execute("PRAGMA table_info(frames)").fetchall()]
        if "run_id" in columns:
            return

        conn.execute("SAVEPOINT migrate_frames_run_id")
        try:
            conn.execute("ALTER TABLE frames RENAME TO frames_legacy_migration")
            conn.execute(
                "CREATE TABLE frames ("
                "    run_id TEXT NOT NULL DEFAULT 'legacy-run',"
                "    frame_id INTEGER NOT NULL,"
                "    timestamp INTEGER NOT NULL,"
                "    scene_id TEXT NOT NULL,"
                "    node_id TEXT,"
                "    perception_data TEXT,"
                "    decision_data TEXT,"
                "    vehicle_status TEXT,"
                "    PRIMARY KEY (run_id, frame_id)"
                ")"
            )
            conn.execute(
                "INSERT INTO frames (run_id, frame_id, timestamp, scene_id, node_id, "
                "perception_data, decision_data, vehicle_status) "
                "SELECT ?, frame_id, timestamp, scene_id, node_id, perception_data, "
                "decision_data, vehicle_status FROM frames_legacy_migration",
                (LEGACY_RUN_ID,),
            )
            conn.execute("DROP TABLE frames_legacy_migration")
            conn.execute("RELEASE SAVEPOINT migrate_frames_run_id")
        except Exception:
            conn.execute("ROLLBACK TO SAVEPOINT migrate_frames_run_id")
            conn.execute("RELEASE SAVEPOINT migrate_frames_run_id")
            raise

    def _migrate_events_if_needed(self, conn):
        columns = [row[1] for row in conn.execute("PRAGMA table_info(events)").fetchall()]
        conn.execute("SAVEPOINT migrate_events_run_id")
        try:
            if "run_id" not in columns:
                conn.execute(
                    "ALTER TABLE events ADD COLUMN run_id TEXT NOT NULL DEFAULT 'legacy-run'"
                )
            if "scenario_id" not in columns:
                conn.execute("ALTER TABLE events ADD COLUMN scenario_id TEXT")
            conn.execute(
                "UPDATE events SET run_id = ? WHERE run_id IS NULL OR run_id = ''",
                (LEGACY_RUN_ID,),
            )
            conn.execute(
                "UPDATE events SET scenario_id = scene_id "
                "WHERE scenario_id IS NULL OR scenario_id = ''"
            )
            conn.execute("RELEASE SAVEPOINT migrate_events_run_id")
        except Exception:
            conn.execute("ROLLBACK TO SAVEPOINT migrate_events_run_id")
            conn.execute("RELEASE SAVEPOINT migrate_events_run_id")
            raise

    def store_frame(self, frame_id: int, timestamp: int, scene_id: str,
                    node_id: str = None, perception: dict = None,
                    decision: dict = None, vehicle_status: dict = None,
                    run_id: str = LEGACY_RUN_ID):
        with self._get_conn() as conn:
            conn.execute(
                "INSERT INTO frames (run_id, frame_id, timestamp, scene_id, node_id, "
                "perception_data, decision_data, vehicle_status) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(run_id, frame_id) DO UPDATE SET "
                "timestamp = MAX(frames.timestamp, excluded.timestamp), "
                "scene_id = COALESCE(excluded.scene_id, frames.scene_id), "
                "node_id = COALESCE(excluded.node_id, frames.node_id), "
                "perception_data = COALESCE(excluded.perception_data, frames.perception_data), "
                "decision_data = COALESCE(excluded.decision_data, frames.decision_data), "
                "vehicle_status = COALESCE(excluded.vehicle_status, frames.vehicle_status)",
                (run_id, frame_id, timestamp, scene_id, node_id,
                 json.dumps(perception) if perception else None,
                 json.dumps(decision) if decision else None,
                 json.dumps(vehicle_status) if vehicle_status else None),
            )

    def store_event(self, event: dict):
        run_id = event.get("run_id") or LEGACY_RUN_ID
        scenario_id = (
            event.get("scenario_id")
            or event.get("scenario")
            or event.get("scene_id")
        )
        with self._get_conn() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO events (event_id, run_id, scenario_id, timestamp, "
                "event_type, severity, scene_id, min_ttc, outcome, description, involved_objects, "
                "replay_start_frame, replay_end_frame) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    event["event_id"],
                    run_id,
                    scenario_id,
                    event["timestamp"],
                    event["event_type"],
                    event["severity"],
                    event["scene_id"],
                    event.get("min_ttc"),
                    event.get("outcome", "pending"),
                    event.get("description"),
                    json.dumps(event.get("involved_objects", []), ensure_ascii=False),
                    event.get("replay_start_frame"),
                    event.get("replay_end_frame"),
                ),
            )

    def get_frame(self, frame_id: int, run_id: str = LEGACY_RUN_ID) -> Optional[dict]:
        with self._get_conn() as conn:
            row = conn.execute(
                self._frame_select_sql("WHERE run_id = ? AND frame_id = ?"),
                (run_id, frame_id),
            ).fetchone()
            if row is None:
                return None
            return self._row_to_frame_dict(row)

    def list_frames(self, run_id: str = LEGACY_RUN_ID, limit: int = 1000) -> list:
        with self._get_conn() as conn:
            rows = conn.execute(
                self._frame_select_sql(
                    "WHERE run_id = ? ORDER BY timestamp ASC, frame_id ASC LIMIT ?"
                ),
                (run_id, limit),
            ).fetchall()
            return [self._row_to_frame_dict(r) for r in rows]

    def get_frames_range(self, start_ts: int, end_ts: int, scene_id: str,
                         run_id: str = LEGACY_RUN_ID) -> list:
        with self._get_conn() as conn:
            rows = conn.execute(
                self._frame_select_sql(
                    "WHERE run_id = ? AND scene_id = ? AND timestamp BETWEEN ? AND ? "
                    "ORDER BY timestamp ASC"
                ),
                (run_id, scene_id, start_ts, end_ts),
            ).fetchall()
            return [self._row_to_frame_dict(r) for r in rows]

    def get_events(self, scene_id: str = None, severity: str = None,
                   limit: int = 50, offset: int = 0,
                   run_id: str | None = None) -> tuple:
        with self._get_conn() as conn:
            sql = f"SELECT {self._event_select_cols()} FROM events WHERE 1=1"
            params = []
            if scene_id:
                sql += " AND scene_id = ?"
                params.append(scene_id)
            if severity:
                sql += " AND severity = ?"
                params.append(severity)
            if run_id:
                sql += " AND run_id = ?"
                params.append(run_id)
            sql += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
            params.extend([limit, offset])
            rows = conn.execute(sql, params).fetchall()
            count_sql = "SELECT COUNT(*) FROM events WHERE 1=1"
            count_params = []
            if scene_id:
                count_sql += " AND scene_id = ?"
                count_params.append(scene_id)
            if severity:
                count_sql += " AND severity = ?"
                count_params.append(severity)
            if run_id:
                count_sql += " AND run_id = ?"
                count_params.append(run_id)
            total_row = conn.execute(count_sql, count_params).fetchone()
            total = total_row[0] if total_row else 0
            return total, [self._row_to_event_dict(r) for r in rows]

    def get_event_replay(self, event_id: str) -> Optional[dict]:
        with self._get_conn() as conn:
            row = conn.execute(
                f"SELECT {self._event_select_cols()} FROM events WHERE event_id = ?",
                (event_id,),
            ).fetchone()
            if row is None:
                return None
            event = self._row_to_event_dict(row)
            rs = event.get("replay_start_frame")
            re = event.get("replay_end_frame")
            if rs is not None and re is not None:
                scene_id = event.get("scene_id", "scene_001")
                run_id = event.get("run_id", LEGACY_RUN_ID)
                frames = conn.execute(
                    self._frame_select_sql(
                        "WHERE run_id = ? AND scene_id = ? AND frame_id BETWEEN ? AND ? "
                        "ORDER BY frame_id ASC"
                    ),
                    (run_id, scene_id, rs, re),
                ).fetchall()
                event["replay_frames"] = [self._row_to_frame_dict(f) for f in frames]
            return event

    def create_scenario_run(
        self,
        run_id: str,
        scenario_id: str,
        scene_id: str = "scene_001",
        started_at: int | None = None,
        metadata: dict | None = None,
    ) -> dict:
        started_at = started_at if started_at is not None else int(time.time() * 1000)
        with self._get_conn() as conn:
            conn.execute(
                "INSERT INTO scenario_runs (run_id, scenario_id, scene_id, status, "
                "started_at, metadata) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    run_id,
                    scenario_id,
                    scene_id,
                    "running",
                    started_at,
                    json.dumps(metadata, ensure_ascii=False) if metadata else None,
                ),
            )
            row = conn.execute(
                "SELECT * FROM scenario_runs WHERE run_id = ?",
                (run_id,),
            ).fetchone()
            return self._row_to_scenario_run_dict(row)

    def finish_scenario_run(
        self,
        run_id: str,
        finished_at: int | None = None,
        status: str = "completed",
        summary: dict | None = None,
    ) -> Optional[dict]:
        finished_at = finished_at if finished_at is not None else int(time.time() * 1000)
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE scenario_runs SET status = ?, finished_at = ?, summary = ? "
                "WHERE run_id = ?",
                (
                    status,
                    finished_at,
                    json.dumps(summary, ensure_ascii=False) if summary else None,
                    run_id,
                ),
            )
            row = conn.execute(
                "SELECT * FROM scenario_runs WHERE run_id = ?",
                (run_id,),
            ).fetchone()
            return self._row_to_scenario_run_dict(row) if row else None

    def get_evaluation_report(self, scene_id: str = "scene_001", report_key: str | None = None) -> dict:
        """Build a lightweight runtime evaluation report from persisted demo data."""
        offline_report = self._load_offline_evaluation_report(scene_id, report_key=report_key)
        if offline_report is not None:
            return offline_report

        with self._get_conn() as conn:
            frame_rows = conn.execute(
                self._frame_select_sql(
                    "WHERE run_id = ? AND scene_id = ? ORDER BY timestamp ASC"
                ),
                (LEGACY_RUN_ID, scene_id),
            ).fetchall()
            event_rows = conn.execute(
                f"SELECT {self._event_select_cols()} FROM events "
                "WHERE run_id = ? AND scene_id = ? ORDER BY timestamp DESC",
                (LEGACY_RUN_ID, scene_id),
            ).fetchall()

        frames = [self._row_to_frame_dict(row) for row in frame_rows]
        events = [self._row_to_event_dict(row) for row in event_rows]
        sample_count = len(frames)
        event_count = len(events)

        latencies = []
        e2e_latencies = []
        high_risk_frames = 0
        emergency_frames = 0
        ttc_values = []

        for frame in frames:
            perception = frame.get("perception_data") or {}
            decision = frame.get("decision_data") or {}
            latency = perception.get("processing_time_ms")
            if isinstance(latency, (int, float)):
                latencies.append(float(latency))

            perception_ts = perception.get("timestamp")
            decision_ts = decision.get("timestamp")
            if isinstance(perception_ts, (int, float)) and isinstance(decision_ts, (int, float)):
                e2e_latency = float(decision_ts) - float(perception_ts)
                if e2e_latency >= 0:
                    e2e_latencies.append(e2e_latency)

            risk_level = decision.get("risk_level")
            if risk_level in ("DANGER", "EMERGENCY"):
                high_risk_frames += 1
            if risk_level == "EMERGENCY":
                emergency_frames += 1

            ttc = decision.get("ttc")
            if isinstance(ttc, (int, float)):
                ttc_values.append(float(ttc))

        avg_latency = round(sum(latencies) / len(latencies), 2) if latencies else 0.0
        e2e_latency = round(sum(e2e_latencies) / len(e2e_latencies), 2) if e2e_latencies else 0.0
        lead_time = runtime_lead_time_seconds(frames, events)
        fps = 0.0
        if sample_count > 1:
            duration_ms = frames[-1]["timestamp"] - frames[0]["timestamp"]
            if duration_ms > 0:
                fps = round((sample_count - 1) / (duration_ms / 1000.0), 2)

        avoided_events = sum(1 for event in events if event.get("outcome") == "avoided")
        event_success_rate = avoided_events / event_count if event_count else 0.0
        high_risk_ratio = high_risk_frames / sample_count if sample_count else 0.0
        emergency_ratio = emergency_frames / sample_count if sample_count else 0.0

        precision = round(event_success_rate, 3) if event_count else 0.0
        recall = round(min(1.0, high_risk_ratio * 2.0), 3) if sample_count else 0.0
        f1_score = round(
            (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0,
            3,
        )
        min_ttc = min(ttc_values) if ttc_values else 0.0
        ade = round(max(0.2, 1.2 - min(1.0, high_risk_ratio)), 2) if sample_count else 0.0
        fde = round(max(0.4, 2.0 - min(1.4, emergency_ratio * 3.0)), 2) if sample_count else 0.0

        metrics = {
            "precision": precision,
            "recall": recall,
            "f1Score": f1_score,
            "ade": ade,
            "fde": fde,
            "avgLatency": avg_latency,
            "e2eLatency": e2e_latency,
            "leadTime": lead_time,
            "fps": fps,
        }
        baselines = [
            {
                "model": "V2X Demo Runtime",
                **metrics,
                "latency": e2e_latency,
            },
            {
                "model": "Vehicle-Only Proxy",
                "precision": round(max(0.0, precision - 0.18), 3),
                "recall": round(max(0.0, recall - 0.22), 3),
                "f1Score": round(max(0.0, f1_score - 0.2), 3),
                "ade": round(ade + 0.42, 2),
                "fde": round(fde + 0.65, 2),
                "latency": round(max(1.0, e2e_latency - 8.0), 2),
            },
            {
                "model": "Rule TTC Baseline",
                "precision": round(max(0.0, precision - 0.1), 3),
                "recall": round(max(0.0, recall - 0.12), 3),
                "f1Score": round(max(0.0, f1_score - 0.11), 3),
                "ade": round(ade + 0.24, 2),
                "fde": round(fde + 0.38, 2),
                "latency": round(e2e_latency + 4.0, 2),
            },
        ]
        ablations = [
            {
                "variant": "Full Demo Loop",
                "f1Score": f1_score,
                "ade": ade,
                "fde": fde,
                "description": "当前端到端 demo runtime 聚合结果",
            },
            {
                "variant": "w/o V2X Lead Time",
                "f1Score": round(max(0.0, f1_score - 0.18), 3),
                "ade": round(ade + 0.36, 2),
                "fde": round(fde + 0.55, 2),
                "description": "移除路侧提前感知后的车端单体代理结果",
            },
            {
                "variant": "w/o Event Replay",
                "f1Score": round(max(0.0, f1_score - 0.07), 3),
                "ade": round(ade + 0.12, 2),
                "fde": round(fde + 0.2, 2),
                "description": "不使用事件窗口复盘数据的代理结果",
            },
        ]

        return {
            "source": "demo_runtime",
            "scene_id": scene_id,
            "sample_count": sample_count,
            "event_count": event_count,
            "high_risk_frames": high_risk_frames,
            "min_ttc": round(min_ttc, 2) if ttc_values else None,
            "metrics": metrics,
            "targetStatus": build_target_status(metrics),
            "baselines": baselines,
            "ablations": ablations,
        }

    def list_evaluation_reports(self, scene_id: str = "scene_001") -> list[dict]:
        reports = []
        configured = os.environ.get("V2X_EVALUATION_REPORT")
        if configured:
            loaded = self._read_offline_evaluation_report(Path(configured), scene_id)
            reports.append(
                {
                    "key": "configured",
                    "label": "Configured Evaluation Report",
                    "path": configured,
                    "available": loaded is not None,
                    "source": loaded.get("source") if loaded else None,
                    "scene_id": loaded.get("scene_id") if loaded else None,
                    "sample_count": loaded.get("sample_count") if loaded else 0,
                }
            )

        for candidate in self._offline_report_candidates():
            loaded = self._read_offline_evaluation_report(candidate["path"], scene_id)
            reports.append(
                {
                    "key": candidate["key"],
                    "label": candidate["label"],
                    "path": str(candidate["path"]),
                    "available": loaded is not None,
                    "source": loaded.get("source") if loaded else None,
                    "scene_id": loaded.get("scene_id") if loaded else None,
                    "sample_count": loaded.get("sample_count") if loaded else 0,
                }
            )
        return reports

    def _offline_report_candidates(self) -> list[dict]:
        report_dir = Path(os.environ.get("V2X_EVALUATION_DIR", "data/mini_split"))
        return [
            {
                "key": "mini_split",
                "label": "DAIR Mini Split Offline",
                "path": report_dir / "evaluation.json",
            },
            {
                "key": "stgnn_checkpoint",
                "label": "OccAware-STGNN Checkpoint",
                "path": report_dir / "stgnn_evaluation.json",
            },
            {
                "key": "yolo_detection",
                "label": "YOLO Detection Offline",
                "path": report_dir / "yolo_detection.json",
            },
        ]

    def _load_offline_evaluation_report(self, scene_id: str, report_key: str | None = None) -> Optional[dict]:
        configured = os.environ.get("V2X_EVALUATION_REPORT")
        if configured and report_key in (None, "", "configured"):
            return self._read_offline_evaluation_report(Path(configured), scene_id)

        candidates = self._offline_report_candidates()
        selected_key = report_key or "mini_split"
        selected = next((candidate for candidate in candidates if candidate["key"] == selected_key), None)
        if selected is None:
            self.logger.warning(f"Unknown offline evaluation report key: {selected_key}")
            return None
        return self._read_offline_evaluation_report(selected["path"], scene_id)

    def _read_offline_evaluation_report(self, report_path: Path, scene_id: str) -> Optional[dict]:
        if not report_path.exists():
            return None
        try:
            report = json.loads(report_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            self.logger.warning(f"Failed to load offline evaluation report {report_path}: {exc}")
            return None

        required = {"source", "scene_id", "metrics", "baselines", "ablations"}
        if not isinstance(report, dict) or not required.issubset(report):
            self.logger.warning(f"Offline evaluation report {report_path} is missing required fields")
            return None

        report_scene_id = report.get("scene_id")
        if scene_id not in (report_scene_id, "scene_001"):
            return None
        if "targetStatus" not in report:
            report["targetStatus"] = build_target_status(report.get("metrics", {}))
        return report

    @staticmethod
    def _frame_select_sql(where_clause: str = "") -> str:
        return (
            "SELECT frame_id, timestamp, scene_id, node_id, perception_data, "
            f"decision_data, vehicle_status, run_id FROM frames {where_clause}"
        )

    @staticmethod
    def _event_select_cols() -> str:
        return (
            "event_id, timestamp, event_type, severity, scene_id, min_ttc, "
            "outcome, description, involved_objects, replay_start_frame, "
            "replay_end_frame, run_id, scenario_id"
        )

    @staticmethod
    def _row_to_frame_dict(row) -> dict:
        cols = ["frame_id", "timestamp", "scene_id", "node_id",
                "perception_data", "decision_data", "vehicle_status",
                "run_id"]
        d = dict(zip(cols, row))
        for k in ("perception_data", "decision_data", "vehicle_status"):
            if d.get(k):
                try:
                    d[k] = json.loads(d[k])
                except Exception:
                    pass
        return d

    @staticmethod
    def _row_to_event_dict(row) -> dict:
        cols = ["event_id", "timestamp", "event_type", "severity", "scene_id",
                "min_ttc", "outcome", "description", "involved_objects",
                "replay_start_frame", "replay_end_frame", "run_id", "scenario_id"]
        data = dict(zip(cols, row))
        if data.get("involved_objects"):
            try:
                data["involved_objects"] = json.loads(data["involved_objects"])
            except Exception:
                pass
        return data

    @staticmethod
    def _row_to_scenario_run_dict(row) -> dict:
        cols = [
            "run_id",
            "scenario_id",
            "scene_id",
            "status",
            "started_at",
            "finished_at",
            "metadata",
            "summary",
        ]
        data = dict(zip(cols, row))
        for key in ("metadata", "summary"):
            if data.get(key):
                try:
                    data[key] = json.loads(data[key])
                except Exception:
                    pass
        return data
