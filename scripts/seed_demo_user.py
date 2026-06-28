from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config.env_loader import load_auth_env

load_auth_env()

from src.services.auth_database import auth_db_connect
from src.services.auth_service import pwd_context

USER_EMAIL = os.getenv("DEMO_USER_EMAIL", "user@ooredoo.tn")
USER_PASSWORD = os.getenv("DEMO_USER_PASSWORD", "RAN-User-2026!")
USER_NAME = os.getenv("DEMO_USER_NAME", "Responsable RAN")
USER_PHONE = os.getenv("DEMO_USER_PHONE", "+21620000000")
USER_JOB = os.getenv("DEMO_USER_JOB", "data_analyst_bi")
USER_DEPT = os.getenv("DEMO_USER_DEPT", "NOC RAN · Tunis")


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def main() -> int:
    now = _iso(datetime.now(timezone.utc))
    with auth_db_connect() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (USER_EMAIL.lower(),)).fetchone()
        if existing:
            print(f"User déjà présent : {USER_EMAIL}")
            return 0
        conn.execute(
            """
            INSERT INTO users (
                email, phone, password_hash, full_name, role, job_profile,
                personal_access_key_hash, email_verified, phone_verified, is_active,
                created_at, department, employee_id, signup_status
            ) VALUES (?, ?, ?, ?, 'responsable', ?, NULL, 1, 1, 1, ?, ?, '', 'approved')
            """,
            (
                USER_EMAIL.lower(),
                "".join(ch for ch in USER_PHONE if ch.isdigit()),
                pwd_context.hash(USER_PASSWORD),
                USER_NAME,
                USER_JOB,
                now,
                USER_DEPT,
            ),
        )
    print("User créé :")
    print(f"  Email       : {USER_EMAIL}")
    print(f"  Mot de passe: {USER_PASSWORD}")
    print(f"  Profil      : {USER_JOB}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
