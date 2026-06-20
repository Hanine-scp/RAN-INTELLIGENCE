#!/usr/bin/env python3
"""Teste l'envoi email (Mailtrap Live) et SMS (Twilio Verify)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config.env_loader import load_auth_env

load_auth_env()

from src.services.notification_service import notification_service


def main() -> int:
    parser = argparse.ArgumentParser(description="Test notifications auth RAN Intelligence")
    parser.add_argument("--email", required=True, help="Adresse email de test (ex: vous@gmail.com)")
    parser.add_argument("--phone", required=True, help="Téléphone E.164 ou tunisien (ex: +21623669609)")
    args = parser.parse_args()

    status = notification_service.status()
    print("=== Statut notifications ===")
    for key, value in status.items():
        print(f"  {key}: {value}")

    if not status.get("email_ready"):
        print("\nERREUR email: définissez MAILTRAP_API_TOKEN dans .env.auth")
        print("  mailtrap.io → Settings → API Tokens")
        return 1

    if not status.get("twilio_verify_ready") and not status.get("sms_ready"):
        print("\nERREUR SMS: définissez TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID")
        return 1

    print("\n=== Envoi email test ===")
    email_ok = notification_service.send_otp_email(
        to=args.email,
        full_name="Test RAN",
        code="TEST01",
        purpose="admin_bootstrap",
    )
    print(f"  Email: {'OK' if email_ok else 'ÉCHEC'}")

    print("\n=== Envoi SMS test ===")
    if notification_service.twilio_verify_ready():
        sms_ok = notification_service.start_twilio_verify(
            phone=args.phone,
            purpose="admin_bootstrap",
        )
        print(f"  Twilio Verify: {'OK — vérifiez votre téléphone' if sms_ok else 'ÉCHEC'}")
    else:
        sms_ok = notification_service.send_otp_sms(
            phone=args.phone,
            code="123456",
            purpose="admin_bootstrap",
        )
        print(f"  SMS: {'OK' if sms_ok else 'ÉCHEC'}")

    if email_ok and sms_ok:
        print("\nSuccès — redémarrez l'API puis testez /admin/setup")
        return 0
    print("\nÉchec — consultez les logs ci-dessus et .env.auth")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
