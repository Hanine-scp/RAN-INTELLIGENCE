"""Persistance serveur des conversations RAN Intelligence."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from src.services.auth_database import auth_db_connect

CONVERSATION_SCHEMA = """
CREATE TABLE IF NOT EXISTS ai_conversations (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id);
"""

CONVERSATION_SCHEMA_POSTGRES = """
CREATE TABLE IF NOT EXISTS ai_conversations (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id);
"""


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_conversation_tables(conn) -> None:
    conn.executescript(CONVERSATION_SCHEMA_POSTGRES if conn.is_postgres else CONVERSATION_SCHEMA)


def _new_id() -> str:
    return f"chat-{uuid.uuid4().hex[:12]}"


class ConversationHistoryService:
    def list_conversations(self, user_id: int) -> list[dict[str, Any]]:
        with auth_db_connect() as conn:
            rows = conn.execute(
                """
                SELECT c.id, c.title, c.pinned, c.created_at, c.updated_at,
                       (
                         SELECT m.content FROM ai_messages m
                         WHERE m.conversation_id = c.id AND m.role = 'user'
                         ORDER BY m.created_at ASC LIMIT 1
                       ) AS preview
                FROM ai_conversations c
                WHERE c.user_id = ?
                ORDER BY c.pinned DESC, c.updated_at DESC
                """,
                (user_id,),
            ).fetchall()
        return [
            {
                "id": str(row["id"]),
                "title": str(row["title"]),
                "pinned": bool(row["pinned"]),
                "createdAt": str(row["created_at"]),
                "updatedAt": str(row["updated_at"]),
                "preview": (str(row["preview"]) if row["preview"] else "")[:80],
            }
            for row in rows
        ]

    def get_conversation(self, user_id: int, conversation_id: str) -> dict[str, Any] | None:
        with auth_db_connect() as conn:
            header = conn.execute(
                "SELECT id, title, pinned, created_at, updated_at FROM ai_conversations WHERE id = ? AND user_id = ?",
                (conversation_id, user_id),
            ).fetchone()
            if not header:
                return None
            msg_rows = conn.execute(
                """
                SELECT id, role, content, metadata_json, created_at
                FROM ai_messages
                WHERE conversation_id = ?
                ORDER BY created_at ASC
                """,
                (conversation_id,),
            ).fetchall()

        messages: list[dict[str, Any]] = []
        for row in msg_rows:
            meta: dict[str, Any] = {}
            try:
                meta = json.loads(str(row["metadata_json"] or "{}"))
            except json.JSONDecodeError:
                meta = {}
            messages.append(
                {
                    "id": str(row["id"]),
                    "role": str(row["role"]),
                    "content": str(row["content"]),
                    "createdAt": str(row["created_at"]),
                    **meta,
                }
            )

        return {
            "id": str(header["id"]),
            "userId": user_id,
            "title": str(header["title"]),
            "pinned": bool(header["pinned"]),
            "createdAt": str(header["created_at"]),
            "updatedAt": str(header["updated_at"]),
            "messages": messages,
        }

    def create_conversation(self, user_id: int, title: str = "Nouvelle conversation") -> dict[str, Any]:
        now = _utcnow()
        conv_id = _new_id()
        with auth_db_connect() as conn:
            conn.execute(
                """
                INSERT INTO ai_conversations (id, user_id, title, pinned, created_at, updated_at)
                VALUES (?, ?, ?, 0, ?, ?)
                """,
                (conv_id, user_id, title, now, now),
            )
            conn.commit()
        return {
            "id": conv_id,
            "userId": user_id,
            "title": title,
            "pinned": False,
            "createdAt": now,
            "updatedAt": now,
            "messages": [],
        }

    def delete_conversation(self, user_id: int, conversation_id: str) -> bool:
        with auth_db_connect() as conn:
            existing = conn.execute(
                "SELECT id FROM ai_conversations WHERE id = ? AND user_id = ?",
                (conversation_id, user_id),
            ).fetchone()
            if not existing:
                return False
            conn.execute("DELETE FROM ai_messages WHERE conversation_id = ?", (conversation_id,))
            conn.execute(
                "DELETE FROM ai_conversations WHERE id = ? AND user_id = ?",
                (conversation_id, user_id),
            )
            conn.commit()
            return True

    def toggle_pin(self, user_id: int, conversation_id: str) -> bool:
        with auth_db_connect() as conn:
            row = conn.execute(
                "SELECT pinned FROM ai_conversations WHERE id = ? AND user_id = ?",
                (conversation_id, user_id),
            ).fetchone()
            if not row:
                return False
            new_val = 0 if int(row["pinned"]) else 1
            conn.execute(
                "UPDATE ai_conversations SET pinned = ?, updated_at = ? WHERE id = ? AND user_id = ?",
                (new_val, _utcnow(), conversation_id, user_id),
            )
            conn.commit()
            return True

    def sync_conversation(self, user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        conv_id = str(payload.get("id") or _new_id())
        title = str(payload.get("title") or "Nouvelle conversation")
        pinned = 1 if payload.get("pinned") else 0
        messages = payload.get("messages") or []
        now = _utcnow()

        with auth_db_connect() as conn:
            existing = conn.execute(
                "SELECT id FROM ai_conversations WHERE id = ? AND user_id = ?",
                (conv_id, user_id),
            ).fetchone()
            if existing:
                conn.execute(
                    "UPDATE ai_conversations SET title = ?, pinned = ?, updated_at = ? WHERE id = ? AND user_id = ?",
                    (title, pinned, now, conv_id, user_id),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO ai_conversations (id, user_id, title, pinned, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (conv_id, user_id, title, pinned, now, now),
                )

            conn.execute("DELETE FROM ai_messages WHERE conversation_id = ?", (conv_id,))
            for msg in messages:
                if not isinstance(msg, dict):
                    continue
                role = str(msg.get("role") or "")
                content = str(msg.get("content") or "")
                if role not in {"user", "assistant"} or not content.strip():
                    continue
                msg_id = str(msg.get("id") or f"m-{uuid.uuid4().hex[:10]}")
                created = str(msg.get("createdAt") or now)
                meta = {
                    k: v
                    for k, v in msg.items()
                    if k not in {"id", "role", "content", "createdAt"}
                }
                conn.execute(
                    """
                    INSERT INTO ai_messages (id, conversation_id, role, content, metadata_json, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (msg_id, conv_id, role, content, json.dumps(meta, ensure_ascii=False), created),
                )
            conn.commit()

        result = self.get_conversation(user_id, conv_id)
        return result or {"id": conv_id, "userId": user_id, "title": title, "messages": []}


conversation_history_service = ConversationHistoryService()
