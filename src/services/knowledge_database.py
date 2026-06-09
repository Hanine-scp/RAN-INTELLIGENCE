"""Connexion PostgreSQL/SQLite pour KPI time-series et RAG."""

from __future__ import annotations

import os
import re
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from src.services.auth_database import AuthDbConnection, DbCursor, DbRow, auth_database_url, auth_db_path, use_postgres


def knowledge_database_url() -> str:
    return (
        os.getenv("TIMESERIES_DATABASE_URL")
        or os.getenv("RAG_DATABASE_URL")
        or os.getenv("KNOWLEDGE_DATABASE_URL")
        or auth_database_url()
    )


def knowledge_db_path() -> Path:
    return Path(os.getenv("KNOWLEDGE_SQLITE_PATH", "data/knowledge/ran_knowledge.db"))


@contextmanager
def knowledge_db_connect() -> Iterator[AuthDbConnection]:
    url = knowledge_database_url()
    if url.startswith(("postgresql://", "postgres://")):
        import psycopg
        from psycopg.rows import dict_row

        conn = psycopg.connect(url, row_factory=dict_row, autocommit=False)
        wrapper = AuthDbConnection(conn, is_postgres=True)
        try:
            yield wrapper
            wrapper.commit()
        except Exception:
            wrapper.rollback()
            raise
        finally:
            conn.close()
        return

    path = knowledge_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    wrapper = AuthDbConnection(conn, is_postgres=False)
    try:
        yield wrapper
        wrapper.commit()
    except Exception:
        wrapper.rollback()
        raise
    finally:
        conn.close()


def try_enable_extension(conn: AuthDbConnection, sql: str) -> bool:
    try:
        conn.execute(sql)
        return True
    except Exception:
        return False
