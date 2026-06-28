#!/usr/bin/env python3
"""Synchronise le compte admin en base avec ADMIN_* dans .env.auth."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config.env_loader import load_auth_env

load_auth_env()

from passlib.context import CryptContext

from src.services.auth_database import auth_db_connect
from src.services.auth_service import _hash_secret, _normalize_email
from src.services.notification_service import notification_service

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def main() -> int:
    email = _normalize_email(os.getenv("ADMIN_EMAIL", ""))
    password = os.getenv("ADMIN_PASSWORD", "")
    phone = notification_service.format_phone_e164(os.getenv("ADMIN_PHONE", "+21623669609"))
    access_key = os.getenv("ADMIN_ACCESS_KEY", "RAN-ADMIN-MASTER-KEY")

    if not email or not password:
        print("ADMIN_EMAIL et ADMIN_PASSWORD requis dans .env.auth")
        return 1

    with auth_db_connect() as conn:
        conflict = conn.execute(
            "SELECT id, role FROM users WHERE email = ? AND role != 'admin'",
            (email,),
        ).fetchone()
        if conflict:
            print(f"Email déjà utilisé par un compte {conflict['role']} (id={conflict['id']})")
            return 1

        admin = conn.execute("SELECT id, email FROM users WHERE role = 'admin' LIMIT 1").fetchone()
        if admin is None:
            print("Aucun admin en base — lancez l'API avec SEED_DEFAULT_ADMIN=true")
            return 1

        conn.execute(
            """
            UPDATE users
            SET email = ?, phone = ?, password_hash = ?, personal_access_key_hash = ?,
                is_active = 1, email_verified = 1, phone_verified = 1
            WHERE id = ?
            """,
            (email, phone, pwd_context.hash(password), _hash_secret(access_key), admin["id"]),
        )
        row = conn.execute(
            "SELECT id, email, phone, is_active FROM users WHERE role = 'admin' LIMIT 1"
        ).fetchone()
        hash_row = conn.execute(
            "SELECT password_hash FROM users WHERE role = 'admin' LIMIT 1"
        ).fetchone()

    print("Admin synchronisé avec .env.auth :")
    print(f"  Email   : {row['email']}")
    print(f"  Phone   : {row['phone']}")
    print(f"  Active  : {bool(row['is_active'])}")
    print(f"  Clé     : {access_key}")
    print(f"  Password OK: {pwd_context.verify(password, str(hash_row['password_hash']))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
