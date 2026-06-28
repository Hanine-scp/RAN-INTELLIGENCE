#!/usr/bin/env python3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config.env_loader import load_auth_env

load_auth_env()

from passlib.context import CryptContext
from src.services.auth_database import auth_db_connect

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

with auth_db_connect() as conn:
    admins = conn.execute(
        "SELECT id, email, role, is_active, email_verified, phone_verified FROM users WHERE role='admin'"
    ).fetchall()
    print("=== Admins ===")
    for row in admins:
        print(dict(row))
    if not admins:
        print("(aucun admin)")

    import os

    test_email = os.getenv("ADMIN_EMAIL", "").strip().lower()
    test_password = os.getenv("ADMIN_PASSWORD", "")
    row = conn.execute("SELECT * FROM users WHERE email = ? AND role = 'admin'", (test_email,)).fetchone()
    if row:
        ok = pwd.verify(test_password, str(row["password_hash"]))
        print(f"\n.env ADMIN_EMAIL match: {test_email} password_ok={ok} is_active={row['is_active']}")
    else:
        print(f"\n.env ADMIN_EMAIL {test_email!r} — aucun admin avec cet email en base")

    key_row = conn.execute(
        "SELECT key_type, is_active FROM access_keys WHERE key_type='admin_login' LIMIT 1"
    ).fetchone()
    print(f"admin_login key in DB: {dict(key_row) if key_row else 'NONE'}")
