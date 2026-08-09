from __future__ import annotations

import json
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from .models import (
    ScenarioActor,
    ScenarioDetail,
    ScenarioEventRule,
    ScenarioKeyframe,
    ScenarioSummary,
)


EXPECTED_CATEGORIES = {
    "ghost_probe",
    "non_motor",
    "intersection_conflict",
}


class ScenarioRepository:
    """SQLite persistence for declarative scenario templates and runs."""

    def __init__(self, db_path: str):
        self.db_path = str(Path(db_path).expanduser().resolve())
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._ensure_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30)
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    @contextmanager
    def _connection(self):
        conn = self._connect()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _ensure_schema(self) -> None:
        with self._connection() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS scenario_templates (
                    scenario_id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    category TEXT NOT NULL DEFAULT 'ghost_probe',
                    description TEXT NOT NULL DEFAULT '',
                    duration_ms INTEGER NOT NULL DEFAULT 10000,
                    default_fps REAL NOT NULL DEFAULT 10.0,
                    coordinate_frame TEXT NOT NULL DEFAULT 'road_xy',
                    road_layout TEXT NOT NULL DEFAULT '{}',
                    environment TEXT NOT NULL DEFAULT '{}',
                    expected_outcome TEXT NOT NULL DEFAULT '',
                    version INTEGER NOT NULL DEFAULT 1,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    source_refs TEXT NOT NULL DEFAULT '[]',
                    created_at INTEGER NOT NULL DEFAULT 0,
                    updated_at INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS scenario_actors (
                    scenario_id TEXT NOT NULL,
                    actor_id TEXT NOT NULL,
                    track_id INTEGER,
                    role TEXT NOT NULL DEFAULT 'background',
                    actor_class TEXT NOT NULL DEFAULT 'car',
                    actor_subtype TEXT,
                    dimensions TEXT NOT NULL DEFAULT '{}',
                    appearance TEXT NOT NULL DEFAULT '{}',
                    PRIMARY KEY (scenario_id, actor_id)
                );
                CREATE TABLE IF NOT EXISTS scenario_keyframes (
                    scenario_id TEXT NOT NULL,
                    actor_id TEXT NOT NULL,
                    t_ms INTEGER NOT NULL DEFAULT 0,
                    position_x REAL NOT NULL DEFAULT 0,
                    position_y REAL NOT NULL DEFAULT 0,
                    velocity_x REAL NOT NULL DEFAULT 0,
                    velocity_y REAL NOT NULL DEFAULT 0,
                    heading_deg REAL NOT NULL DEFAULT 0,
                    occlusion_level INTEGER NOT NULL DEFAULT 0,
                    confidence REAL NOT NULL DEFAULT 0.95,
                    visible INTEGER NOT NULL DEFAULT 1,
                    behavior_state TEXT NOT NULL DEFAULT 'moving',
                    PRIMARY KEY (scenario_id, actor_id, t_ms)
                );
                CREATE TABLE IF NOT EXISTS scenario_events (
                    scenario_id TEXT NOT NULL,
                    event_key TEXT NOT NULL,
                    event_order INTEGER NOT NULL DEFAULT 0,
                    t_ms INTEGER NOT NULL DEFAULT 0,
                    event_type TEXT NOT NULL DEFAULT 'scenario_event',
                    severity TEXT NOT NULL DEFAULT 'info',
                    description TEXT NOT NULL DEFAULT '',
                    involved_actor_ids TEXT NOT NULL DEFAULT '[]',
                    expected_decision TEXT NOT NULL DEFAULT '{}',
                    PRIMARY KEY (scenario_id, event_key)
                );
                CREATE TABLE IF NOT EXISTS scenario_runs (
                    run_id TEXT PRIMARY KEY,
                    scenario_id TEXT NOT NULL,
                    started_at INTEGER NOT NULL,
                    ended_at INTEGER,
                    requested_fps REAL NOT NULL DEFAULT 10.0,
                    loop_enabled INTEGER NOT NULL DEFAULT 0,
                    random_seed INTEGER NOT NULL DEFAULT 42,
                    status TEXT NOT NULL DEFAULT 'running',
                    current_frame INTEGER NOT NULL DEFAULT 0,
                    error_message TEXT
                );
                """
            )
            self._upgrade_legacy_tables(conn)
            self._create_unique_indexes(conn)

    @staticmethod
    def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
        return {
            row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
        }

    def _upgrade_legacy_tables(self, conn: sqlite3.Connection) -> None:
        self._add_missing_columns(
            conn,
            "scenario_templates",
            {
                "category": "TEXT NOT NULL DEFAULT 'ghost_probe'",
                "description": "TEXT NOT NULL DEFAULT ''",
                "duration_ms": "INTEGER NOT NULL DEFAULT 10000",
                "default_fps": "REAL NOT NULL DEFAULT 10.0",
                "coordinate_frame": "TEXT NOT NULL DEFAULT 'road_xy'",
                "road_layout": "TEXT NOT NULL DEFAULT '{}'",
                "environment": "TEXT NOT NULL DEFAULT '{}'",
                "expected_outcome": "TEXT NOT NULL DEFAULT ''",
                "version": "INTEGER NOT NULL DEFAULT 1",
                "enabled": "INTEGER NOT NULL DEFAULT 1",
                "source_refs": "TEXT NOT NULL DEFAULT '[]'",
                "updated_at": "INTEGER NOT NULL DEFAULT 0",
            },
        )

        self._add_missing_columns(
            conn,
            "scenario_actors",
            {
                "scenario_id": "TEXT NOT NULL DEFAULT ''",
                "track_id": "INTEGER",
                "role": "TEXT NOT NULL DEFAULT 'background'",
                "actor_class": "TEXT NOT NULL DEFAULT 'car'",
                "actor_subtype": "TEXT",
                "dimensions": "TEXT NOT NULL DEFAULT '{}'",
                "appearance": "TEXT NOT NULL DEFAULT '{}'",
            },
        )
        actor_pk = {
            row[1]: row[5]
            for row in conn.execute("PRAGMA table_info(scenario_actors)").fetchall()
        }
        if actor_pk.get("actor_id") == 1 and actor_pk.get("scenario_id", 0) == 0:
            self._rebuild_legacy_actors(conn)
        actor_columns = self._columns(conn, "scenario_actors")
        if "actor_class" in actor_columns and "actor_type" in actor_columns:
            conn.execute(
                "UPDATE scenario_actors SET actor_class = actor_type "
                "WHERE actor_class = 'car' AND actor_type IS NOT NULL"
            )

        if "t_ms" not in self._columns(conn, "scenario_keyframes"):
            self._rebuild_legacy_keyframes(conn)
        else:
            self._add_missing_columns(
                conn,
                "scenario_keyframes",
                {
                    "actor_id": "TEXT NOT NULL DEFAULT ''",
                    "position_x": "REAL NOT NULL DEFAULT 0",
                    "position_y": "REAL NOT NULL DEFAULT 0",
                    "velocity_x": "REAL NOT NULL DEFAULT 0",
                    "velocity_y": "REAL NOT NULL DEFAULT 0",
                    "heading_deg": "REAL NOT NULL DEFAULT 0",
                    "occlusion_level": "INTEGER NOT NULL DEFAULT 0",
                    "confidence": "REAL NOT NULL DEFAULT 0.95",
                    "visible": "INTEGER NOT NULL DEFAULT 1",
                    "behavior_state": "TEXT NOT NULL DEFAULT 'moving'",
                },
            )

        if "event_key" not in self._columns(conn, "scenario_events"):
            self._rebuild_legacy_events(conn)
        else:
            self._add_missing_columns(
                conn,
                "scenario_events",
                {
                    "event_order": "INTEGER NOT NULL DEFAULT 0",
                    "t_ms": "INTEGER NOT NULL DEFAULT 0",
                    "event_type": "TEXT NOT NULL DEFAULT 'scenario_event'",
                    "severity": "TEXT NOT NULL DEFAULT 'info'",
                    "description": "TEXT NOT NULL DEFAULT ''",
                    "involved_actor_ids": "TEXT NOT NULL DEFAULT '[]'",
                    "expected_decision": "TEXT NOT NULL DEFAULT '{}'",
                },
            )

        self._add_missing_columns(
            conn,
            "scenario_runs",
            {
                "ended_at": "INTEGER",
                "requested_fps": "REAL NOT NULL DEFAULT 10.0",
                "loop_enabled": "INTEGER NOT NULL DEFAULT 0",
                "random_seed": "INTEGER NOT NULL DEFAULT 42",
                "current_frame": "INTEGER NOT NULL DEFAULT 0",
                "error_message": "TEXT",
            },
        )

    @staticmethod
    def _add_missing_columns(
        conn: sqlite3.Connection,
        table: str,
        definitions: dict[str, str],
    ) -> None:
        columns = {
            row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
        }
        for name, definition in definitions.items():
            if name not in columns:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")

    @staticmethod
    def _rebuild_legacy_actors(conn: sqlite3.Connection) -> None:
        conn.execute("ALTER TABLE scenario_actors RENAME TO scenario_actors_legacy")
        conn.execute(
            """CREATE TABLE scenario_actors (
                scenario_id TEXT NOT NULL,
                actor_id TEXT NOT NULL,
                track_id INTEGER,
                role TEXT NOT NULL DEFAULT 'background',
                actor_class TEXT NOT NULL DEFAULT 'car',
                actor_subtype TEXT,
                dimensions TEXT NOT NULL DEFAULT '{}',
                appearance TEXT NOT NULL DEFAULT '{}',
                PRIMARY KEY (scenario_id, actor_id)
            )"""
        )
        conn.execute(
            """INSERT INTO scenario_actors
            (scenario_id, actor_id, track_id, role, actor_class, actor_subtype,
             dimensions, appearance)
            SELECT scenario_id, actor_id, track_id, role, actor_class, actor_subtype,
                   dimensions, appearance
            FROM scenario_actors_legacy"""
        )
        conn.execute("DROP TABLE scenario_actors_legacy")

    @staticmethod
    def _rebuild_legacy_keyframes(conn: sqlite3.Connection) -> None:
        columns = {
            row[1] for row in conn.execute("PRAGMA table_info(scenario_keyframes)").fetchall()
        }
        conn.execute("ALTER TABLE scenario_keyframes RENAME TO scenario_keyframes_legacy")
        conn.execute(
            """CREATE TABLE scenario_keyframes (
                scenario_id TEXT NOT NULL,
                actor_id TEXT NOT NULL,
                t_ms INTEGER NOT NULL DEFAULT 0,
                position_x REAL NOT NULL DEFAULT 0,
                position_y REAL NOT NULL DEFAULT 0,
                velocity_x REAL NOT NULL DEFAULT 0,
                velocity_y REAL NOT NULL DEFAULT 0,
                heading_deg REAL NOT NULL DEFAULT 0,
                occlusion_level INTEGER NOT NULL DEFAULT 0,
                confidence REAL NOT NULL DEFAULT 0.95,
                visible INTEGER NOT NULL DEFAULT 1,
                behavior_state TEXT NOT NULL DEFAULT 'moving',
                PRIMARY KEY (scenario_id, actor_id, t_ms)
            )"""
        )
        if columns:
            frame_column = "frame_id" if "frame_id" in columns else "timestamp"
            conn.execute(
                "INSERT INTO scenario_keyframes "
                "(scenario_id, actor_id, t_ms) "
                "SELECT scenario_id, 'legacy-' || CAST(" + frame_column + " AS TEXT), "
                + frame_column + " FROM scenario_keyframes_legacy"
            )
        conn.execute("DROP TABLE scenario_keyframes_legacy")

    @staticmethod
    def _rebuild_legacy_events(conn: sqlite3.Connection) -> None:
        conn.execute("ALTER TABLE scenario_events RENAME TO scenario_events_legacy")
        conn.execute(
            """CREATE TABLE scenario_events (
                scenario_id TEXT NOT NULL,
                event_key TEXT NOT NULL,
                event_order INTEGER NOT NULL DEFAULT 0,
                t_ms INTEGER NOT NULL DEFAULT 0,
                event_type TEXT NOT NULL DEFAULT 'scenario_event',
                severity TEXT NOT NULL DEFAULT 'info',
                description TEXT NOT NULL DEFAULT '',
                involved_actor_ids TEXT NOT NULL DEFAULT '[]',
                expected_decision TEXT NOT NULL DEFAULT '{}',
                PRIMARY KEY (scenario_id, event_key)
            )"""
        )
        old_columns = {
            row[1]
            for row in conn.execute("PRAGMA table_info(scenario_events_legacy)").fetchall()
        }
        event_id = "event_id" if "event_id" in old_columns else "event_key"
        frame_id = "frame_id" if "frame_id" in old_columns else "t_ms"
        event_type = "event_type" if "event_type" in old_columns else "'scenario_event'"
        conn.execute(
            "INSERT INTO scenario_events "
            "(scenario_id, event_key, event_order, t_ms, event_type) "
            "SELECT scenario_id, " + event_id + ", " + frame_id + ", " + frame_id + ", "
            + event_type + " FROM scenario_events_legacy"
        )
        conn.execute("DROP TABLE scenario_events_legacy")

    @staticmethod
    def _create_unique_indexes(conn: sqlite3.Connection) -> None:
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS "
            "idx_scenario_actors_key ON scenario_actors(scenario_id, actor_id)"
        )
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS "
            "idx_scenario_keyframes_key ON scenario_keyframes(scenario_id, actor_id, t_ms)"
        )
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS "
            "idx_scenario_events_key ON scenario_events(scenario_id, event_key)"
        )

    def list_scenarios(self) -> list[ScenarioSummary]:
        with self._connection() as conn:
            rows = conn.execute(
                "SELECT scenario_id, name, category, description, duration_ms, "
                "default_fps, coordinate_frame, road_layout, environment, "
                "expected_outcome, version, enabled, source_refs "
                "FROM scenario_templates WHERE enabled = 1 ORDER BY scenario_id"
            ).fetchall()
        return [self._summary_from_row(row) for row in rows]

    def get_scenario(self, scenario_id: str) -> ScenarioDetail:
        with self._connection() as conn:
            template = conn.execute(
                "SELECT scenario_id, name, category, description, duration_ms, "
                "default_fps, coordinate_frame, road_layout, environment, "
                "expected_outcome, version, enabled, source_refs "
                "FROM scenario_templates WHERE scenario_id = ?",
                (scenario_id,),
            ).fetchone()
            if template is None:
                raise KeyError(f"Unknown scenario_id: {scenario_id}")
            actors = conn.execute(
                "SELECT scenario_id, actor_id, track_id, role, actor_class, "
                "actor_subtype, dimensions, appearance FROM scenario_actors "
                "WHERE scenario_id = ? ORDER BY COALESCE(track_id, -1), actor_id",
                (scenario_id,),
            ).fetchall()
            keyframes = conn.execute(
                "SELECT scenario_id, actor_id, t_ms, position_x, position_y, "
                "velocity_x, velocity_y, heading_deg, occlusion_level, confidence, "
                "visible, behavior_state FROM scenario_keyframes "
                "WHERE scenario_id = ? ORDER BY actor_id, t_ms",
                (scenario_id,),
            ).fetchall()
            events = conn.execute(
                "SELECT scenario_id, event_key, event_order, t_ms, event_type, "
                "severity, description, involved_actor_ids, expected_decision "
                "FROM scenario_events WHERE scenario_id = ? ORDER BY event_order, t_ms",
                (scenario_id,),
            ).fetchall()
        return ScenarioDetail(
            summary=self._summary_from_row(template),
            actors=tuple(self._actor_from_row(row) for row in actors),
            keyframes=tuple(self._keyframe_from_row(row) for row in keyframes),
            events=tuple(self._event_from_row(row) for row in events),
        )

    def upsert_seed(self, seed: dict[str, Any]) -> None:
        template = seed["template"]
        now = int(time.time() * 1000)
        scenario_id = template["scenario_id"]
        with self._connection() as conn:
            conn.execute(
                """INSERT INTO scenario_templates
                (scenario_id, name, category, description, duration_ms, default_fps,
                 coordinate_frame, road_layout, environment, expected_outcome, version,
                 enabled, source_refs, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(scenario_id) DO UPDATE SET
                  name=excluded.name, category=excluded.category,
                  description=excluded.description, duration_ms=excluded.duration_ms,
                  default_fps=excluded.default_fps, coordinate_frame=excluded.coordinate_frame,
                  road_layout=excluded.road_layout, environment=excluded.environment,
                  expected_outcome=excluded.expected_outcome, version=excluded.version,
                  enabled=excluded.enabled, source_refs=excluded.source_refs,
                  updated_at=excluded.updated_at""",
                (
                    scenario_id,
                    template["name"],
                    template["category"],
                    template.get("description", ""),
                    template["duration_ms"],
                    template.get("default_fps", 10.0),
                    template.get("coordinate_frame", "road_xy"),
                    self._dump(template.get("road_layout", {})),
                    self._dump(template.get("environment", {})),
                    template.get("expected_outcome", ""),
                    template.get("version", 1),
                    1 if template.get("enabled", True) else 0,
                    self._dump(template.get("source_refs", [])),
                    template.get("created_at", now),
                    now,
                ),
            )
            for actor in seed.get("actors", []):
                actor_values = (
                    scenario_id,
                    actor["actor_id"],
                    actor.get("track_id"),
                    actor["role"],
                    actor["actor_class"],
                    actor.get("actor_subtype"),
                    self._dump(actor.get("dimensions", {})),
                    self._dump(actor.get("appearance", {})),
                )
                if "actor_type" in self._columns(conn, "scenario_actors"):
                    conn.execute(
                        """INSERT INTO scenario_actors
                        (scenario_id, actor_id, track_id, role, actor_class, actor_type,
                         actor_subtype, dimensions, appearance)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(scenario_id, actor_id) DO UPDATE SET
                          track_id=excluded.track_id, role=excluded.role,
                          actor_class=excluded.actor_class, actor_type=excluded.actor_type,
                          actor_subtype=excluded.actor_subtype,
                          dimensions=excluded.dimensions, appearance=excluded.appearance""",
                        (
                            scenario_id,
                            actor["actor_id"],
                            actor.get("track_id"),
                            actor["role"],
                            actor["actor_class"],
                            actor["actor_class"],
                            actor.get("actor_subtype"),
                            self._dump(actor.get("dimensions", {})),
                            self._dump(actor.get("appearance", {})),
                        ),
                    )
                else:
                    conn.execute(
                        """INSERT INTO scenario_actors
                        (scenario_id, actor_id, track_id, role, actor_class, actor_subtype,
                         dimensions, appearance)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(scenario_id, actor_id) DO UPDATE SET
                          track_id=excluded.track_id, role=excluded.role,
                          actor_class=excluded.actor_class, actor_subtype=excluded.actor_subtype,
                          dimensions=excluded.dimensions, appearance=excluded.appearance""",
                        actor_values,
                    )
            for keyframe in seed.get("keyframes", []):
                position = keyframe["position"]
                velocity = keyframe["velocity"]
                conn.execute(
                    """INSERT INTO scenario_keyframes
                    (scenario_id, actor_id, t_ms, position_x, position_y, velocity_x,
                     velocity_y, heading_deg, occlusion_level, confidence, visible,
                     behavior_state)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(scenario_id, actor_id, t_ms) DO UPDATE SET
                      position_x=excluded.position_x, position_y=excluded.position_y,
                      velocity_x=excluded.velocity_x, velocity_y=excluded.velocity_y,
                      heading_deg=excluded.heading_deg, occlusion_level=excluded.occlusion_level,
                      confidence=excluded.confidence, visible=excluded.visible,
                      behavior_state=excluded.behavior_state""",
                    (
                        scenario_id,
                        keyframe["actor_id"],
                        keyframe["t_ms"],
                        position[0],
                        position[1],
                        velocity[0],
                        velocity[1],
                        keyframe.get("heading_deg", 0.0),
                        keyframe.get("occlusion_level", 0),
                        keyframe.get("confidence", 0.95),
                        1 if keyframe.get("visible", True) else 0,
                        keyframe.get("behavior_state", "moving"),
                    ),
                )
            for event in seed.get("events", []):
                conn.execute(
                    """INSERT INTO scenario_events
                    (scenario_id, event_key, event_order, t_ms, event_type, severity,
                     description, involved_actor_ids, expected_decision)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(scenario_id, event_key) DO UPDATE SET
                      event_order=excluded.event_order, t_ms=excluded.t_ms,
                      event_type=excluded.event_type, severity=excluded.severity,
                      description=excluded.description,
                      involved_actor_ids=excluded.involved_actor_ids,
                      expected_decision=excluded.expected_decision""",
                    (
                        scenario_id,
                        event["event_key"],
                        event["event_order"],
                        event["t_ms"],
                        event["event_type"],
                        event["severity"],
                        event["description"],
                        self._dump(event.get("involved_actor_ids", [])),
                        self._dump(event.get("expected_decision", {})),
                    ),
                )

    def validate_library(self) -> dict[str, Any]:
        with self._connection() as conn:
            templates = conn.execute(
                "SELECT scenario_id, category FROM scenario_templates WHERE enabled = 1"
            ).fetchall()
            actor_rows = conn.execute(
                "SELECT scenario_id, role, actor_class FROM scenario_actors"
            ).fetchall()
            keyframe_rows = conn.execute(
                "SELECT scenario_id, actor_id, COUNT(*) FROM scenario_keyframes "
                "GROUP BY scenario_id, actor_id"
            ).fetchall()
            event_counts = dict(
                conn.execute(
                    "SELECT scenario_id, COUNT(*) FROM scenario_events GROUP BY scenario_id"
                ).fetchall()
            )
        template_ids = {row[0] for row in templates}
        category_counts = {
            category: sum(1 for _, value in templates if value == category)
            for category in sorted(EXPECTED_CATEGORIES)
        }
        actors_by_scenario: dict[str, list[tuple[str, str]]] = {}
        for scenario_id, role, actor_class in actor_rows:
            actors_by_scenario.setdefault(scenario_id, []).append((role, actor_class))
        frames_by_actor = {
            (scenario_id, actor_id): count
            for scenario_id, actor_id, count in keyframe_rows
        }
        missing: list[str] = []
        invalid: list[str] = []
        for scenario_id in sorted(template_ids):
            actors = actors_by_scenario.get(scenario_id, [])
            roles = {role for role, _ in actors}
            if "ego" not in roles or "target" not in roles:
                invalid.append(f"{scenario_id}:missing ego/target")
            if not roles.intersection({"occluder", "conflict", "background"}):
                invalid.append(f"{scenario_id}:missing occluder/conflict")
            for actor_id, count in (
                (actor_id, count)
                for (sid, actor_id), count in frames_by_actor.items()
                if sid == scenario_id
            ):
                if count < 3:
                    invalid.append(f"{scenario_id}:{actor_id}:fewer than 3 keyframes")
            if event_counts.get(scenario_id, 0) < 4:
                invalid.append(f"{scenario_id}:fewer than 4 events")
        return {
            "templates": len(template_ids),
            "categories": category_counts,
            "missing": missing,
            "invalid": invalid,
        }

    def create_run(
        self,
        run_id: str,
        scenario_id: str,
        started_at: int,
        requested_fps: float,
        loop_enabled: bool,
        random_seed: int,
    ) -> dict[str, Any]:
        self.get_scenario(scenario_id)
        with self._connection() as conn:
            conn.execute(
                """INSERT INTO scenario_runs
                (run_id, scenario_id, started_at, requested_fps, loop_enabled,
                 random_seed, status, current_frame, error_message)
                VALUES (?, ?, ?, ?, ?, ?, 'running', 0, NULL)""",
                (run_id, scenario_id, started_at, requested_fps, int(loop_enabled), random_seed),
            )
        return self.get_run(run_id)

    def update_run(
        self,
        run_id: str,
        status: str,
        ended_at: int | None = None,
        current_frame: int = 0,
        error_message: str | None = None,
    ) -> dict[str, Any]:
        with self._connection() as conn:
            cursor = conn.execute(
                """UPDATE scenario_runs SET status=?, ended_at=?, current_frame=?,
                   error_message=? WHERE run_id=?""",
                (status, ended_at, current_frame, error_message, run_id),
            )
            if cursor.rowcount == 0:
                raise KeyError(f"Unknown run_id: {run_id}")
        return self.get_run(run_id)

    def get_run(self, run_id: str) -> dict[str, Any]:
        with self._connection() as conn:
            row = conn.execute(
                "SELECT run_id, scenario_id, started_at, ended_at, requested_fps, "
                "loop_enabled, random_seed, status, current_frame, error_message "
                "FROM scenario_runs WHERE run_id = ?",
                (run_id,),
            ).fetchone()
        if row is None:
            raise KeyError(f"Unknown run_id: {run_id}")
        keys = (
            "run_id", "scenario_id", "started_at", "ended_at", "requested_fps",
            "loop_enabled", "random_seed", "status", "current_frame", "error_message",
        )
        data = dict(zip(keys, row))
        data["loop_enabled"] = bool(data["loop_enabled"])
        return data

    @staticmethod
    def _dump(value: Any) -> str:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

    @classmethod
    def _load(cls, value: Any, default: Any) -> Any:
        if value in (None, ""):
            return default
        if not isinstance(value, str):
            return value
        try:
            return json.loads(value)
        except (TypeError, ValueError):
            return default

    @classmethod
    def _summary_from_row(cls, row: tuple[Any, ...]) -> ScenarioSummary:
        return ScenarioSummary(
            scenario_id=row[0], name=row[1], category=row[2], description=row[3],
            duration_ms=int(row[4]), default_fps=float(row[5]), coordinate_frame=row[6],
            road_layout=cls._load(row[7], {}), environment=cls._load(row[8], {}),
            expected_outcome=row[9], version=int(row[10]), enabled=bool(row[11]),
            source_refs=tuple(cls._load(row[12], [])),
        )

    @classmethod
    def _actor_from_row(cls, row: tuple[Any, ...]) -> ScenarioActor:
        return ScenarioActor(
            scenario_id=row[0], actor_id=row[1], track_id=row[2], role=row[3],
            actor_class=row[4], actor_subtype=row[5], dimensions=cls._load(row[6], {}),
            appearance=cls._load(row[7], {}),
        )

    @classmethod
    def _keyframe_from_row(cls, row: tuple[Any, ...]) -> ScenarioKeyframe:
        return ScenarioKeyframe(
            scenario_id=row[0], actor_id=row[1], t_ms=int(row[2]),
            position=(float(row[3]), float(row[4])),
            velocity=(float(row[5]), float(row[6])), heading_deg=float(row[7]),
            occlusion_level=int(row[8]), confidence=float(row[9]), visible=bool(row[10]),
            behavior_state=row[11],
        )

    @classmethod
    def _event_from_row(cls, row: tuple[Any, ...]) -> ScenarioEventRule:
        return ScenarioEventRule(
            scenario_id=row[0], event_key=row[1], event_order=int(row[2]), t_ms=int(row[3]),
            event_type=row[4], severity=row[5], description=row[6],
            involved_actor_ids=tuple(cls._load(row[7], [])),
            expected_decision=cls._load(row[8], {}),
        )
