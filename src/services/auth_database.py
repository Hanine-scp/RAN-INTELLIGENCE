from __future__ import annotations

import logging
import os
import re
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

def auth_db_path() -> Path:
    return Path(os.getenv("AUTH_DB_PATH", "data/auth/platform_auth.db"))


def auth_database_url() -> str:
    return os.getenv("AUTH_DATABASE_URL", "").strip()


SQLITE_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'responsable')),
    job_profile TEXT NOT NULL DEFAULT '',
    personal_access_key_hash TEXT,
    email_verified INTEGER NOT NULL DEFAULT 0,
    phone_verified INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    last_login_at TEXT,
    department TEXT NOT NULL DEFAULT '',
    employee_id TEXT NOT NULL DEFAULT '',
    created_by_admin_id INTEGER,
    recovery_email TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS access_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_hash TEXT NOT NULL UNIQUE,
    key_label TEXT NOT NULL,
    key_type TEXT NOT NULL CHECK(key_type IN ('signup', 'admin_login')),
    created_by INTEGER,
    max_uses INTEGER NOT NULL DEFAULT 1,
    uses_count INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS otp_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    channel TEXT NOT NULL CHECK(channel IN ('email', 'phone')),
    code_hash TEXT NOT NULL,
    purpose TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS auth_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS secure_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL,
    token_type TEXT NOT NULL CHECK(token_type IN ('email_verify', 'password_reset')),
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_secure_tokens_hash ON secure_tokens(token_hash, token_type);
"""

POSTGRES_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'responsable')),
    job_profile TEXT NOT NULL DEFAULT '',
    personal_access_key_hash TEXT,
    email_verified INTEGER NOT NULL DEFAULT 0,
    phone_verified INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    last_login_at TEXT,
    department TEXT NOT NULL DEFAULT '',
    employee_id TEXT NOT NULL DEFAULT '',
    created_by_admin_id INTEGER,
    recovery_email TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS access_keys (
    id SERIAL PRIMARY KEY,
    key_hash TEXT NOT NULL UNIQUE,
    key_label TEXT NOT NULL,
    key_type TEXT NOT NULL CHECK(key_type IN ('signup', 'admin_login')),
    created_by INTEGER,
    max_uses INTEGER NOT NULL DEFAULT 1,
    uses_count INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS otp_codes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    channel TEXT NOT NULL CHECK(channel IN ('email', 'phone')),
    code_hash TEXT NOT NULL,
    purpose TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_audit (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    action TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS secure_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token_hash TEXT NOT NULL,
    token_type TEXT NOT NULL CHECK(token_type IN ('email_verify', 'password_reset')),
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_secure_tokens_hash ON secure_tokens(token_hash, token_type);
"""


class DbRow(dict[str, Any]):
    def __getitem__(self, key: str | int) -> Any:
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


class DbCursor:
    def __init__(self, cursor: Any, description: list[Any] | None) -> None:
        self._cursor = cursor
        self._description = description

    def _wrap_row(self, row: Any) -> DbRow | None:
        if row is None:
            return None
        if isinstance(row, DbRow):
            return row
        if isinstance(row, dict):
            return DbRow(row)
        if isinstance(row, sqlite3.Row):
            return DbRow(dict(row))
        if self._description:
            keys = [str(col[0]) for col in self._description]
            return DbRow(dict(zip(keys, row)))
        return DbRow(dict(enumerate(row)))

    def fetchone(self) -> DbRow | None:
        return self._wrap_row(self._cursor.fetchone())

    def fetchall(self) -> list[DbRow]:
        return [row for row in (self._wrap_row(r) for r in self._cursor.fetchall()) if row is not None]


class AuthDbConnection:
    def __init__(self, conn: Any, *, is_postgres: bool) -> None:
        self._conn = conn
        self._is_postgres = is_postgres

    @property
    def is_postgres(self) -> bool:
        return self._is_postgres

    def _adapt_sql(self, sql: str) -> str:
        if not self._is_postgres:
            return sql
        return sql.replace("?", "%s")

    def execute(self, sql: str, params: tuple[Any, ...] | list[Any] = ()) -> DbCursor:
        sql = self._adapt_sql(sql)
        if self._is_postgres:
            cursor = self._conn.cursor()
            cursor.execute(sql, params)
            return DbCursor(cursor, cursor.description)
        cursor = self._conn.execute(sql, params)
        return DbCursor(cursor, cursor.description)

    def executescript(self, sql: str) -> None:
        if self._is_postgres:
            statements = [part.strip() for part in re.split(r";\s*", sql) if part.strip()]
            for statement in statements:
                self.execute(statement)
            return
        self._conn.executescript(sql)

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()


def use_postgres() -> bool:
    return auth_database_url().startswith(("postgresql://", "postgres://"))


def database_info() -> dict[str, Any]:
    if use_postgres():
        safe_url = auth_database_url()
        if "@" in safe_url:
            prefix, rest = safe_url.split("@", 1)
            if "://" in prefix:
                scheme, creds = prefix.split("://", 1)
                if ":" in creds:
                    user = creds.split(":", 1)[0]
                    safe_url = f"{scheme}://{user}:***@{rest}"
        return {
            "engine": "postgresql",
            "url": safe_url,
            "connected": False,
            "tables": [],
        }
    return {
        "engine": "sqlite",
        "path": str(auth_db_path().resolve()),
        "connected": False,
        "tables": [],
    }


def check_database_connection() -> dict[str, Any]:
    info = database_info()
    try:
        with auth_db_connect() as conn:
            if conn.is_postgres:
                row = conn.execute("SELECT version() AS version").fetchone()
                info["version"] = str(row["version"]) if row else ""
            else:
                row = conn.execute("SELECT sqlite_version() AS version").fetchone()
                info["version"] = str(row["version"]) if row else ""
            tables = conn.execute(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                ORDER BY table_name
                """
                if conn.is_postgres
                else "SELECT name AS table_name FROM sqlite_master WHERE type = 'table' ORDER BY name"
            ).fetchall()
            info["tables"] = [str(row["table_name"]) for row in tables]
            info["connected"] = True
    except Exception as exc:
        info["connected"] = False
        info["error"] = str(exc)
    return info


def init_auth_schema(conn: AuthDbConnection) -> None:
    conn.executescript(POSTGRES_SCHEMA if conn.is_postgres else SQLITE_SCHEMA)
    _ensure_user_columns(conn)
    _ensure_secure_tokens_table(conn)


def _ensure_secure_tokens_table(conn: AuthDbConnection) -> None:
    if conn.is_postgres:
        exists = conn.execute(
            """
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'secure_tokens'
            """
        ).fetchone()
    else:
        exists = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'secure_tokens'"
        ).fetchone()
    if exists is None:
        if conn.is_postgres:
            conn.execute(
                """
                CREATE TABLE secure_tokens (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    token_hash TEXT NOT NULL,
                    token_type TEXT NOT NULL CHECK(token_type IN ('email_verify', 'password_reset')),
                    expires_at TEXT NOT NULL,
                    consumed_at TEXT,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_secure_tokens_hash ON secure_tokens(token_hash, token_type)"
            )
        else:
            conn.execute(
                """
                CREATE TABLE secure_tokens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    token_hash TEXT NOT NULL,
                    token_type TEXT NOT NULL CHECK(token_type IN ('email_verify', 'password_reset')),
                    expires_at TEXT NOT NULL,
                    consumed_at TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_secure_tokens_hash ON secure_tokens(token_hash, token_type)"
            )


def _ensure_user_columns(conn: AuthDbConnection) -> None:
    logger = logging.getLogger(__name__)
    if conn.is_postgres:
        rows = conn.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'users'
            """
        ).fetchall()
        existing = {str(row["column_name"]) for row in rows}
    else:
        existing = {str(row["name"]) for row in conn.execute("PRAGMA table_info(users)").fetchall()}

    migrations = {
        "department": "ALTER TABLE users ADD COLUMN department TEXT NOT NULL DEFAULT ''",
        "employee_id": "ALTER TABLE users ADD COLUMN employee_id TEXT NOT NULL DEFAULT ''",
        "created_by_admin_id": "ALTER TABLE users ADD COLUMN created_by_admin_id INTEGER",
        "recovery_email": "ALTER TABLE users ADD COLUMN recovery_email TEXT NOT NULL DEFAULT ''",
        "failed_login_attempts": "ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0",
        "login_security_required": "ALTER TABLE users ADD COLUMN login_security_required INTEGER NOT NULL DEFAULT 0",
        "must_change_password": "ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0",
        "last_failed_login_at": "ALTER TABLE users ADD COLUMN last_failed_login_at TEXT",
        "allowed_regions": "ALTER TABLE users ADD COLUMN allowed_regions TEXT NOT NULL DEFAULT 'National'",
        "allowed_vendors": "ALTER TABLE users ADD COLUMN allowed_vendors TEXT NOT NULL DEFAULT 'nokia,huawei'",
        "last_login_ip": "ALTER TABLE users ADD COLUMN last_login_ip TEXT",
        "last_login_user_agent": "ALTER TABLE users ADD COLUMN last_login_user_agent TEXT",
        "signup_status": "ALTER TABLE users ADD COLUMN signup_status TEXT NOT NULL DEFAULT ''",
    }
    for column, statement in migrations.items():
        if column in existing:
            continue
        try:
            conn.execute(statement)
        except Exception as exc:
            if conn.is_postgres and "InsufficientPrivilege" in type(exc).__name__:
                raise RuntimeError(
                    f"PostgreSQL: impossible d'ajouter la colonne users.{column} "
                    f"(l'utilisateur n'est pas propriétaire de la table).\n"
                    f"Exécutez en tant que postgres:\n  {statement}\n"
                    f"Ou commentez AUTH_DATABASE_URL dans .env.auth pour utiliser SQLite en local.\n"
                    f"Ou utilisez le conteneur Docker auth (port 5433):\n"
                    f"  AUTH_DATABASE_URL=postgresql://ran_auth:ran_auth_dev@localhost:5433/ran_intelligence"
                ) from exc
            logger.warning("Migration users.%s skipped: %s", column, exc)


@contextmanager
def auth_db_connect(db_path: Path | None = None) -> Iterator[AuthDbConnection]:
    if use_postgres():
        import psycopg
        from psycopg.rows import dict_row

        conn = psycopg.connect(auth_database_url(), row_factory=dict_row, autocommit=False)
        wrapper = AuthDbConnection(conn, is_postgres=True)
        try:
            yield wrapper
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
        return

    path = db_path or auth_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    wrapper = AuthDbConnection(conn, is_postgres=False)
    try:
        yield wrapper
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
