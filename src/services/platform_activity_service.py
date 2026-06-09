from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

from src.services.auth_database import auth_db_connect

ACTIVITY_ENABLED = os.getenv("PLATFORM_ACTIVITY_ENABLED", "true").lower() in {"1", "true", "yes"}

OOREDOO_DATA_PREFIXES = (
    "/filters/",
    "/dashboard",
    "/sites",
    "/inventory",
    "/delta",
    "/statistics",
    "/replacements",
    "/risk-cards",
    "/vendors",
    "/prediction",
    "/analytics",
    "/temporal-changes",
    "/asset-distribution",
    "/global-counters",
    "/quality",
    "/investigate/",
    "/anomalies",
    "/ai-report",
    "/spares",
    "/clustering",
    "/ops/",
    "/trust/",
    "/ingest/",
    "/snapshots/",
)

PLATFORM_SCHEMA = """
CREATE TABLE IF NOT EXISTS app_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    category TEXT NOT NULL,
    action TEXT NOT NULL,
    method TEXT,
    path TEXT,
    detail TEXT,
    status_code INTEGER,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assistant_queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    question TEXT NOT NULL,
    context_summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    channel TEXT NOT NULL,
    destination TEXT NOT NULL,
    purpose TEXT NOT NULL,
    status TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL
);
"""

PLATFORM_SCHEMA_POSTGRES = """
CREATE TABLE IF NOT EXISTS app_activity (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    category TEXT NOT NULL,
    action TEXT NOT NULL,
    method TEXT,
    path TEXT,
    detail TEXT,
    status_code INTEGER,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assistant_queries (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    question TEXT NOT NULL,
    context_summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    channel TEXT NOT NULL,
    destination TEXT NOT NULL,
    purpose TEXT NOT NULL,
    status TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL
);
"""


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_platform_tables(conn) -> None:
    conn.executescript(PLATFORM_SCHEMA_POSTGRES if conn.is_postgres else PLATFORM_SCHEMA)
    from src.services.conversation_history_service import init_conversation_tables
    from src.services.rag_service import rag_service
    from src.services.spares_tracking_service import init_spares_tracking_tables
    init_conversation_tables(conn)
    init_spares_tracking_tables(conn)
    try:
        rag_service.seed_defaults()
    except Exception:
        pass


def _category_for_path(path: str) -> str:
    if path.startswith("/auth"):
        return "auth"
    if path.startswith("/assistant"):
        return "assistant"
    if any(path.startswith(prefix) or path == prefix.rstrip("/") for prefix in OOREDOO_DATA_PREFIXES):
        return "ooredoo_access"
    return "platform"


class PlatformActivityService:
    def ensure_tables(self) -> None:
        with auth_db_connect() as conn:
            init_platform_tables(conn)

    def log_activity(
        self,
        *,
        user_id: int | None,
        category: str,
        action: str,
        method: str | None = None,
        path: str | None = None,
        detail: str | None = None,
        status_code: int | None = None,
    ) -> None:
        if not ACTIVITY_ENABLED:
            return
        with auth_db_connect() as conn:
            conn.execute(
                """
                INSERT INTO app_activity (user_id, category, action, method, path, detail, status_code, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (user_id, category, action, method, path, detail, status_code, _utcnow()),
            )

    def log_api_request(
        self,
        *,
        user_id: int | None,
        method: str,
        path: str,
        status_code: int,
    ) -> None:
        if not ACTIVITY_ENABLED or method == "OPTIONS":
            return
        if path in {"/health", "/ready", "/auth/database/status"}:
            return
        category = _category_for_path(path)
        action = "ooredoo_query" if category == "ooredoo_access" else "api_request"
        self.log_activity(
            user_id=user_id,
            category=category,
            action=action,
            method=method,
            path=path,
            status_code=status_code,
        )

    def log_assistant_query(
        self,
        *,
        user_id: int,
        question: str,
        context_summary: str = "",
    ) -> None:
        if not ACTIVITY_ENABLED:
            return
        cleaned = (question or "").strip()[:2000]
        with auth_db_connect() as conn:
            conn.execute(
                """
                INSERT INTO assistant_queries (user_id, question, context_summary, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (user_id, cleaned, (context_summary or "")[:500], _utcnow()),
            )
        self.log_activity(
            user_id=user_id,
            category="assistant",
            action="question",
            detail=cleaned[:240],
        )

    def log_notification(
        self,
        *,
        user_id: int | None,
        channel: str,
        destination: str,
        purpose: str,
        status: str,
        detail: str | None = None,
    ) -> None:
        if not ACTIVITY_ENABLED:
            return
        masked = destination
        if channel == "email" and "@" in destination:
            local, _, domain = destination.partition("@")
            masked = f"{local[:2]}***@{domain}" if local else destination
        elif channel == "phone" and len(destination) > 4:
            masked = f"***{destination[-4:]}"
        with auth_db_connect() as conn:
            conn.execute(
                """
                INSERT INTO notification_log (user_id, channel, destination, purpose, status, detail, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (user_id, channel, masked, purpose, status, detail, _utcnow()),
            )

    def recent_activity(self, *, limit: int = 50) -> list[dict[str, Any]]:
        with auth_db_connect() as conn:
            rows = conn.execute(
                """
                SELECT a.id, a.user_id, u.email, a.category, a.action, a.method, a.path, a.detail, a.status_code, a.created_at
                FROM app_activity a
                LEFT JOIN users u ON u.id = a.user_id
                ORDER BY a.id DESC
                LIMIT ?
                """,
                (max(1, min(limit, 200)),),
            ).fetchall()
        return [dict(row) for row in rows]

    def activity_summary(self) -> dict[str, Any]:
        with auth_db_connect() as conn:
            totals = conn.execute(
                """
                SELECT category, COUNT(*) AS total
                FROM app_activity
                GROUP BY category
                ORDER BY total DESC
                """
            ).fetchall()
            users = conn.execute("SELECT COUNT(*) AS total FROM users").fetchone()
            assistants = conn.execute("SELECT COUNT(*) AS total FROM assistant_queries").fetchone()
            notifications = conn.execute("SELECT COUNT(*) AS total FROM notification_log").fetchone()
        return {
            "users": int(users["total"]) if users else 0,
            "assistant_queries": int(assistants["total"]) if assistants else 0,
            "notifications": int(notifications["total"]) if notifications else 0,
            "by_category": {str(row["category"]): int(row["total"]) for row in totals},
        }


def build_filter_context_summary(ctx) -> str:
    dates = len(getattr(ctx, "effective_dates", None) or getattr(ctx, "selected_dates", None) or [])
    sites = len(getattr(ctx, "selected_sites", None) or [])
    files = len(getattr(ctx, "selected_files", None) or [])
    return json.dumps({"dates": dates, "sites": sites, "files": files}, separators=(",", ":"))


platform_activity_service = PlatformActivityService()
