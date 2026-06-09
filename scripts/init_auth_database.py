#!/usr/bin/env python3
"""Initialise et vérifie la base auth (SQLite ou PostgreSQL)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config.env_loader import load_auth_env

load_auth_env()

from src.services.auth_database import auth_db_connect, check_database_connection, init_auth_schema


def main() -> int:
    status = check_database_connection()
    print(f"Engine: {status['engine']}")
    if status["engine"] == "sqlite":
        print(f"Path:   {status['path']}")
    else:
        print(f"URL:    {status.get('url', '')}")

    if not status.get("connected"):
        print(f"ERROR: {status.get('error', 'connection failed')}")
        return 1

    print(f"Version: {status.get('version', 'n/a')}")
    print(f"Tables:  {', '.join(status.get('tables', [])) or '(none)'}")

    try:
        with auth_db_connect() as conn:
            init_auth_schema(conn)
        from src.services.auth_service import AuthService

        AuthService()
    except Exception as exc:
        if "InsufficientPrivilege" in type(exc).__name__ or "droit refusé" in str(exc).lower():
            print("ERROR: droits insuffisants pour ran_auth sur le schéma public.")
            print("Dans pgAdmin (rio_db), ouvrez la base ran_intelligence et exécutez :")
            print("  scripts/sql/grant_ran_auth_privileges.sql")
            return 1
        raise

    print("Schema OK — compte admin par défaut assuré.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
