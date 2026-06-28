#!/usr/bin/env python3
"""Prépare une session de test auth réelle : purge DB + vérifie email/SMS."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config.env_loader import load_auth_env

load_auth_env()

from src.services.notification_service import notification_service


def main() -> int:
    print("=== RAN Intelligence — préparation test auth réel ===\n")

    rc = subprocess.call([sys.executable, str(ROOT / "scripts" / "reset_auth_database.py"), "--no-seed"])
    if rc != 0:
        return rc

    status = notification_service.status()
    email_ok = status.get("email_otp_ready") or status.get("email_ready", False)
    sms_ok = status.get("sms_otp_ready") or status.get("vonage_verify_ready") or status.get("sms_ready", False)

    print("\n--- Notifications ---")
    print(f"  Email OTP (Mailtrap SMTP) : {'OK' if email_ok else 'NON CONFIGURÉ'}")
    print(f"  SMS OTP (Vonage Verify)   : {'OK' if sms_ok else 'NON CONFIGURÉ'}")

    if not email_ok or not sms_ok:
        print("\nComplétez .env.auth (MAILTRAP_API_TOKEN/SMTP_PASS + VONAGE_API_KEY/SECRET) puis redémarrez l'API.")
        print("Voir docs/AUTH_NOTIFICATIONS_SETUP.md")

    print("\n--- URLs de test ---")
    print("  Admin (1er compte) : http://localhost:3000/admin/setup")
    print("  User signup       : http://localhost:3000/signup")
    print("  Login user/admin  : http://localhost:3000/login")
    print("\n  Clé bootstrap admin : ADMIN_BOOTSTRAP_KEY dans .env.auth")
    print("  Clé invite user     : RAN-USER-INVITE-2026 (DEFAULT_SIGNUP_KEY)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
