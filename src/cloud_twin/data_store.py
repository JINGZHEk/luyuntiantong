import sqlite3
import json
import threading
from pathlib import Path
from typing import Optional
from src.utils import setup_logger, ErrorCode


class DataStore:
    """SQLite-based storage for V2X perception, decision, and event data."""

    def __init__(self, db_path: str = "data/v2x_cloud.db"):
        self.logger = setup_logger("cloud.datastore")
        self.db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._init_db()

    def _init_db(self):
        with self._get_conn() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS frames (
                    frame_id INTEGER PRIMARY KEY,
                    timestamp INTEGER NOT NULL,
                    scene_id TEXT NOT NULL,
                    node_id TEXT,
                    perception_data TEXT,
                    decision_data TEXT,
                    vehicle_status TEXT
                );

                CREATE TABLE IF NOT EXISTS events (
                    event_id TEXT PRIMARY KEY,
                    timestamp INTEGER NOT NULL,
                    event_type TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    scene_id TEXT NOT NULL,
                    min_ttc REAL,
                    outcome TEXT DEFAULT 'pending',
                    description TEXT,
                    involved_objects TEXT,
                    replay_start_frame INTEGER,
                    replay_end_frame INTEGER
                );

                CREATE TABLE IF NOT EXISTS metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp INTEGER NOT NULL,
                    metric_type TEXT NOT NULL,
                    data TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_frames_ts ON frames(timestamp);
                CREATE INDEX IF NOT EXISTS idx_frames_scene ON frames(scene_id);
                CREATE INDEX IF NOT EXISTS idx_events_ts ON events(timestamp);
                CREATE INDEX IF NOT EXISTS idx_events_severity ON events(severity);
            """)
        self.logger.info(f"Database initialized: {self.db_path}")

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        return conn

    def store_frame(self, frame_id: int, timestamp: int, scene_id: str,
                    node_id: str = None, perception: dict = None,
                    decision: dict = None, vehicle_status: dict = None):
        with self._lock:
            try:
                with self._get_conn() as conn:
                    conn.execute("""
                        INSERT OR REPLACE INTO frames
                        (frame_id, timestamp, scene_id, node_id, perception_data, decision_data, vehicle_status)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (
                        frame_id, timestamp, scene_id, node_id,
                        json.dumps(perception) if perception else None,
                        json.dumps(decision) if decision else None,
                        json.dumps(vehicle_status) if vehicle_status else None,
                    ))
            except Exception as e:
                self.logger.error(f"[{ErrorCode.E3001}] Frame store failed: {e}")

    def store_event(self, event: dict):
        with self._lock:
            try:
                with self._get_conn() as conn:
                    conn.execute("""
                        INSERT OR REPLACE INTO events
                        (event_id, timestamp, event_type, severity, scene_id,
                         min_ttc, outcome, description, involved_objects,
                         replay_start_frame, replay_end_frame)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        event["event_id"], event["timestamp"], event["event_type"],
                        event["severity"], event["scene_id"],
                        event.get("min_ttc"), event.get("outcome", "pending"),
                        event.get("description", ""),
                        json.dumps(event.get("involved_objects", [])),
                        event.get("replay_start_frame"),
                        event.get("replay_end_frame"),
                    ))
            except Exception as e:
                self.logger.error(f"[{ErrorCode.E3001}] Event store failed: {e}")

    def get_frame(self, frame_id: int) -> Optional[dict]:
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM frames WHERE frame_id = ?", (frame_id,)
            ).fetchone()
            if row:
                return self._row_to_frame(row)
        return None

    def get_frames_range(self, start_ts: int, end_ts: int,
                         scene_id: str = None, limit: int = 1000) -> list:
        with self._get_conn() as conn:
            if scene_id:
                rows = conn.execute(
                    "SELECT * FROM frames WHERE timestamp BETWEEN ? AND ? AND scene_id = ? ORDER BY frame_id LIMIT ?",
                    (start_ts, end_ts, scene_id, limit)
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM frames WHERE timestamp BETWEEN ? AND ? ORDER BY frame_id LIMIT ?",
                    (start_ts, end_ts, limit)
                ).fetchall()
            return [self._row_to_frame(r) for r in rows]

    def get_events(self, scene_id: str = None, severity: str = None,
                   limit: int = 50, offset: int = 0) -> tuple:
        with self._get_conn() as conn:
            conditions = []
            params = []
            if scene_id:
                conditions.append("scene_id = ?")
                params.append(scene_id)
            if severity:
                conditions.append("severity = ?")
                params.append(severity)

            where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
            total = conn.execute(
                f"SELECT COUNT(*) FROM events {where}", params
            ).fetchone()[0]

            rows = conn.execute(
                f"SELECT * FROM events {where} ORDER BY timestamp DESC LIMIT ? OFFSET ?",
                params + [limit, offset]
            ).fetchall()

            events = []
            for row in rows:
                events.append({
                    "event_id": row["event_id"],
                    "timestamp": row["timestamp"],
                    "event_type": row["event_type"],
                    "severity": row["severity"],
                    "scene_id": row["scene_id"],
                    "min_ttc": row["min_ttc"],
                    "outcome": row["outcome"],
                    "description": row["description"],
                    "involved_objects": json.loads(row["involved_objects"]) if row["involved_objects"] else [],
                })
            return total, events

    def get_event_replay(self, event_id: str) -> Optional[dict]:
        with self._get_conn() as conn:
            event_row = conn.execute(
                "SELECT * FROM events WHERE event_id = ?", (event_id,)
            ).fetchone()
            if not event_row:
                return None

            start_frame = event_row["replay_start_frame"] or 0
            end_frame = event_row["replay_end_frame"] or start_frame + 100

            frames = conn.execute(
                "SELECT * FROM frames WHERE frame_id BETWEEN ? AND ? ORDER BY frame_id",
                (start_frame, end_frame)
            ).fetchall()

            return {
                "event": {
                    "event_id": event_row["event_id"],
                    "timestamp": event_row["timestamp"],
                    "event_type": event_row["event_type"],
                    "severity": event_row["severity"],
                    "description": event_row["description"],
                },
                "frames": [self._row_to_frame(f) for f in frames],
                "total_frames": len(frames),
            }

    def _row_to_frame(self, row) -> dict:
        return {
            "frame_id": row["frame_id"],
            "timestamp": row["timestamp"],
            "scene_id": row["scene_id"],
            "node_id": row["node_id"],
            "perception": json.loads(row["perception_data"]) if row["perception_data"] else None,
            "decision": json.loads(row["decision_data"]) if row["decision_data"] else None,
            "vehicle_status": json.loads(row["vehicle_status"]) if row["vehicle_status"] else None,
        }
