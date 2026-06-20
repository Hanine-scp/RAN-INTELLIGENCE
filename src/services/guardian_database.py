"""SQLite store for RAN Guardian intelligence tables."""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
GUARDIAN_DIR = _REPO_ROOT / "data" / "guardian"
GUARDIAN_DB = GUARDIAN_DIR / "guardian_intelligence.db"


def utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def guardian_connect() -> sqlite3.Connection:
    GUARDIAN_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(GUARDIAN_DB)
    conn.row_factory = sqlite3.Row
    return conn


def init_guardian_schema() -> None:
    with guardian_connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS snapshot_audit (
                snapshot_date TEXT NOT NULL,
                vendor TEXT NOT NULL DEFAULT 'nokia',
                file_count INTEGER NOT NULL DEFAULT 0,
                parsed_file_count INTEGER NOT NULL DEFAULT 0,
                failed_file_count INTEGER NOT NULL DEFAULT 0,
                completeness_rate REAL,
                snapshot_hash TEXT,
                previous_snapshot_hash TEXT,
                chained_hash TEXT,
                status TEXT NOT NULL DEFAULT 'PENDING',
                created_at TEXT NOT NULL,
                PRIMARY KEY (snapshot_date, vendor)
            );

            CREATE TABLE IF NOT EXISTS change_events (
                event_id TEXT PRIMARY KEY,
                snapshot_date TEXT NOT NULL,
                compare_date TEXT,
                vendor TEXT NOT NULL DEFAULT 'nokia',
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                parent_site_id TEXT,
                change_type TEXT NOT NULL,
                old_value TEXT,
                new_value TEXT,
                severity TEXT,
                confidence REAL,
                replacement_score REAL,
                evidence_json TEXT,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_change_events_date ON change_events(snapshot_date);
            CREATE INDEX IF NOT EXISTS idx_change_events_site ON change_events(parent_site_id);

            CREATE TABLE IF NOT EXISTS anomalies (
                anomaly_id TEXT PRIMARY KEY,
                snapshot_date TEXT NOT NULL,
                vendor TEXT NOT NULL DEFAULT 'nokia',
                entity_type TEXT NOT NULL,
                entity_id TEXT,
                parent_site_id TEXT,
                anomaly_type TEXT NOT NULL,
                severity TEXT NOT NULL,
                anomaly_score REAL,
                confidence REAL,
                detector_name TEXT NOT NULL,
                evidence_json TEXT,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_anomalies_date ON anomalies(snapshot_date);

            CREATE TABLE IF NOT EXISTS risk_predictions (
                prediction_id TEXT PRIMARY KEY,
                snapshot_date TEXT NOT NULL,
                horizon_days INTEGER NOT NULL,
                vendor TEXT NOT NULL DEFAULT 'nokia',
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                risk_type TEXT NOT NULL,
                risk_score REAL NOT NULL,
                risk_level TEXT NOT NULL,
                top_features_json TEXT,
                model_name TEXT NOT NULL,
                model_version TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_risk_predictions_date ON risk_predictions(snapshot_date);

            CREATE TABLE IF NOT EXISTS ai_audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                question TEXT NOT NULL,
                tools_called TEXT,
                snapshot_dates TEXT,
                confidence REAL,
                response_preview TEXT,
                created_at TEXT NOT NULL
            );
            """
        )
        conn.commit()
