#!/usr/bin/env python3
"""Migre le role 'user' -> 'responsable' dans la base d'authentification.

- SQLite : reecrit la contrainte CHECK de la table users via writable_schema,
  puis met a jour les lignes existantes.
- PostgreSQL : recree la contrainte CHECK puis met a jour les lignes.

Idempotent : peut etre relance sans risque.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config.env_loader import load_auth_env

load_auth_env()

from src.services.auth_database import auth_db_connect


def _role_counts(conn) -> dict[str, int]:
    rows = conn.execute("SELECT role, COUNT(*) AS n FROM users GROUP BY role").fetchall()
    counts: dict[str, int] = {}
    for row in rows:
        try:
            role = row["role"]
            n = row["n"]
        except (TypeError, KeyError, IndexError):
            role, n = row[0], row[1]
        counts[str(role)] = int(n)
    return counts


def _rewrite_sqlite_check(conn) -> bool:
    """Reecrit la contrainte CHECK dans le schema stocke. Retourne True si modifie."""
    raw = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'"
    ).fetchone()
    try:
        table_sql = raw["sql"] if raw else ""
    except (TypeError, KeyError, IndexError):
        table_sql = raw[0] if raw else ""

    if "'admin', 'user'" not in table_sql:
        print("[*] Contrainte CHECK deja a jour (ou absente).")
        return False

    print("[*] Reecriture de la contrainte CHECK (admin, user) -> (admin, responsable)")
    conn.execute("PRAGMA writable_schema = ON")
    conn.execute(
        "UPDATE sqlite_master "
        "SET sql = replace(sql, '''admin'', ''user''', '''admin'', ''responsable''') "
        "WHERE type='table' AND name='users'"
    )
    conn.execute("PRAGMA writable_schema = OFF")
    return True


def _migrate_postgres(conn) -> None:
    print("[*] PostgreSQL : mise a jour de la contrainte et des lignes")
    conn.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check")
    conn.execute("UPDATE users SET role = 'responsable' WHERE role = 'user'")
    conn.execute(
        "ALTER TABLE users ADD CONSTRAINT users_role_check "
        "CHECK (role IN ('admin', 'responsable'))"
    )
    print("[*] Migration PostgreSQL terminee.")


def main() -> int:
    with auth_db_connect() as conn:
        print("Avant :", _role_counts(conn))
        is_pg = conn.is_postgres
        if is_pg:
            _migrate_postgres(conn)
        else:
            _rewrite_sqlite_check(conn)

    if not is_pg:
        # Nouvelle connexion : le schema modifie est recharge, le CHECK accepte 'responsable'.
        with auth_db_connect() as conn:
            conn.execute("UPDATE users SET role = 'responsable' WHERE role = 'user'")
            print("[*] Lignes 'user' mises a jour vers 'responsable'.")

    with auth_db_connect() as conn:
        print("Apres :", _role_counts(conn))

    print("Migration OK.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
