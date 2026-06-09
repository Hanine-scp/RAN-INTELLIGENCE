#!/usr/bin/env python3
"""Crée l'utilisateur et la base PostgreSQL pour l'auth RAN Intelligence."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config.env_loader import load_auth_env

load_auth_env()

import psycopg
from psycopg import sql

ADMIN_URL = os.getenv(
    "POSTGRES_ADMIN_URL",
    "postgresql://postgres:postgres@localhost:5432/postgres",
)
AUTH_USER = os.getenv("AUTH_PG_USER", "ran_auth")
AUTH_PASSWORD = os.getenv("AUTH_PG_PASSWORD", "ran_auth_dev")
AUTH_DB = os.getenv("AUTH_PG_DATABASE", "ran_intelligence")
SCHEMA_FILE = ROOT / "scripts" / "sql" / "auth_schema_postgres.sql"


def main() -> int:
    print(f"Connexion admin: {ADMIN_URL.split('@')[-1]}")
    try:
        with psycopg.connect(ADMIN_URL, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (AUTH_USER,))
                if cur.fetchone() is None:
                    cur.execute(
                        sql.SQL("CREATE ROLE {} WITH LOGIN PASSWORD %s").format(sql.Identifier(AUTH_USER)),
                        (AUTH_PASSWORD,),
                    )
                    print(f"Utilisateur créé: {AUTH_USER}")
                else:
                    cur.execute(
                        sql.SQL("ALTER ROLE {} WITH LOGIN PASSWORD %s").format(sql.Identifier(AUTH_USER)),
                        (AUTH_PASSWORD,),
                    )
                    print(f"Utilisateur mis à jour: {AUTH_USER}")

                cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (AUTH_DB,))
                if cur.fetchone() is None:
                    cur.execute(
                        sql.SQL("CREATE DATABASE {} OWNER {}").format(
                            sql.Identifier(AUTH_DB),
                            sql.Identifier(AUTH_USER),
                        )
                    )
                    print(f"Base créée: {AUTH_DB}")
                else:
                    print(f"Base existante: {AUTH_DB}")

        auth_url = f"postgresql://{AUTH_USER}:{AUTH_PASSWORD}@localhost:5432/{AUTH_DB}"
        with psycopg.connect(auth_url, autocommit=True) as conn:
            schema = SCHEMA_FILE.read_text(encoding="utf-8")
            with conn.cursor() as cur:
                cur.execute(schema)
            print("Schéma auth appliqué.")

        print(f"AUTH_DATABASE_URL={auth_url}")
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}")
        print("Définissez POSTGRES_ADMIN_URL avec le mot de passe superuser postgres, ex.:")
        print("  POSTGRES_ADMIN_URL=postgresql://postgres:VOTRE_MDP@localhost:5432/postgres")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
