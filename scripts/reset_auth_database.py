#!/usr/bin/env python3
"""Efface tous les comptes et données plateforme."""

from __future__ import annotations

import argparse
import hashlib
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config.env_loader import load_auth_env

load_auth_env()

from src.services.auth_database import auth_db_connect, check_database_connection
from src.services.auth_service import AuthService

RESET_TABLES = (
    "assistant_queries",
    "secure_tokens",
    "otp_codes",
    "refresh_tokens",
    "notification_log",
    "auth_audit",
    "app_activity",
    "access_keys",
    "users",
)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def _hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _purge(conn) -> None:
    for table in RESET_TABLES:
        conn.execute(f"DELETE FROM {table}")
    if not conn.is_postgres:
        conn.execute(
            "DELETE FROM sqlite_sequence WHERE name IN ({})".format(
                ", ".join(f"'{t}'" for t in RESET_TABLES)
            )
        )


def _seed_access_keys_only(conn) -> None:
    now = _iso(datetime.now(timezone.utc))
    admin_access_key = os.getenv("ADMIN_ACCESS_KEY", "RAN-ADMIN-MASTER-KEY")
    default_signup_key = os.getenv("DEFAULT_SIGNUP_KEY", "RAN-USER-INVITE-2026")
    conn.execute(
        """
        INSERT INTO access_keys (key_hash, key_label, key_type, created_by, max_uses, uses_count, is_active, created_at)
        VALUES (?, 'Admin master key', 'admin_login', NULL, 999999, 0, 1, ?)
        """,
        (_hash_secret(admin_access_key), now),
    )
    conn.execute(
        """
        INSERT INTO access_keys (key_hash, key_label, key_type, created_by, max_uses, uses_count, is_active, created_at)
        VALUES (?, 'Default user invite', 'signup', NULL, 999999, 0, 1, ?)
        """,
        (_hash_secret(default_signup_key), now),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Reset auth / platform database")
    parser.add_argument(
        "--no-seed",
        action="store_true",
        help="Ne pas recréer l'admin — purge totale (clés d'invitation recréées pour retester l'inscription)",
    )
    args = parser.parse_args()

    status = check_database_connection()
    if not status.get("connected"):
        print(f"ERROR: base non connectée — {status.get('error', 'unknown')}")
        return 1

    engine = status["engine"]
    print(f"Engine: {engine}")
    if engine == "sqlite":
        print(f"Path:   {status.get('path')}")
    else:
        print(f"URL:    {status.get('url')}")

    with auth_db_connect() as conn:
        _purge(conn)
        if args.no_seed:
            _seed_access_keys_only(conn)

    if args.no_seed:
        print("Reset OK — tous les comptes supprimés (admin inclus).")
        print("Clés recréées pour retester l'inscription :")
        print(f"  Signup key : {os.getenv('DEFAULT_SIGNUP_KEY', 'RAN-USER-INVITE-2026')}")
        print(f"  Admin key  : {os.getenv('ADMIN_ACCESS_KEY', 'RAN-ADMIN-MASTER-KEY')}")
        print("Inscription classique (email/mot de passe) : /register sans clé d'invitation.")
    else:
        AuthService()
        print("Reset OK — tous les comptes supprimés.")
        print("Admin recréé : admin@ooredoo.ran / Admin@RAN2026! / RAN-ADMIN-MASTER-KEY")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
