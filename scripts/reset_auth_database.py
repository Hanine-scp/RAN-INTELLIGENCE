#!/usr/bin/env python3
"""Efface tous les comptes et données plateforme, puis recrée l'admin par défaut."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config.env_loader import load_auth_env

load_auth_env()

from src.services.auth_database import auth_db_connect, check_database_connection, use_postgres
from src.services.auth_service import AuthService

RESET_TABLES = (
    "assistant_queries",
    "otp_codes",
    "refresh_tokens",
    "notification_log",
    "auth_audit",
    "app_activity",
    "access_keys",
    "users",
)


def main() -> int:
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
        for table in RESET_TABLES:
            conn.execute(f"DELETE FROM {table}")
        if not conn.is_postgres:
            conn.execute(
                "DELETE FROM sqlite_sequence WHERE name IN ({})".format(
                    ", ".join(f"'{t}'" for t in RESET_TABLES)
                )
            )

    AuthService()
    print("Reset OK — tous les comptes supprimés.")
    print("Admin recréé : admin@ooredoo.ran / Admin@RAN2026! / RAN-ADMIN-MASTER-KEY")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
