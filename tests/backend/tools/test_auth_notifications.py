#!/usr/bin/env python3
"""Teste l'envoi email (Mailtrap Live) et SMS (Vonage Verify)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config.env_loader import load_auth_env

load_auth_env()

from src.services.notification_service import notification_service


def main() -> int:
    parser = argparse.ArgumentParser(description="Test notifications auth RAN Intelligence")
    parser.add_argument("--email", default="hbenahmed2001@gmail.com", help="Adresse email de test")
    parser.add_argument("--phone", default="+21623669609", help="Téléphone E.164 ou tunisien")
    args = parser.parse_args()

    status = notification_service.status()
    print("=== Statut notifications ===")
    for key, value in status.items():
        print(f"  {key}: {value}")

    if not status.get("email_otp_ready") and not status.get("email_ready"):
        print("\nERREUR email: configurez MAILTRAP/SMTP ou Twilio Verify (email) dans .env.auth")
        return 1

    if not status.get("sms_otp_ready") and not status.get("sms_ready"):
        print(
            "\nERREUR SMS: définissez SMS_PROVIDER=vonage, VONAGE_API_KEY, VONAGE_API_SECRET "
            "(ou Twilio Verify en fallback)"
        )
        return 1

    print("\n=== Envoi email test ===")
    email_ok = notification_service.send_otp_email(
        to=args.email,
        full_name="Test RAN",
        code="TEST01",
        purpose="admin_bootstrap",
    )
    print(f"  Email: {'OK' if email_ok else 'ÉCHEC'}")

    print("\n=== Envoi SMS test (Vonage Verify) ===")
    sms_ok = False
    if notification_service.vonage_verify_ready():
        request_id = notification_service.start_vonage_verify(
            phone=args.phone,
            purpose="admin_bootstrap",
        )
        sms_ok = bool(request_id)
        print(
            f"  Vonage Verify SMS: "
            f"{'OK — vérifiez votre téléphone' if sms_ok else 'ÉCHEC'}"
            + (f" (request_id={request_id})" if request_id else "")
        )
    elif notification_service.twilio_verify_ready():
        sms_ok = notification_service.start_twilio_verify(
            destination=args.phone,
            channel="sms",
            purpose="admin_bootstrap",
        )
        print(f"  Twilio Verify SMS (fallback): {'OK — vérifiez votre téléphone' if sms_ok else 'ÉCHEC'}")
        if not notification_service.email_ready():
            email_verify_ok = notification_service.start_twilio_verify(
                destination=args.email,
                channel="email",
                purpose="admin_bootstrap",
            )
            print(
                f"  Twilio Verify Email (fallback): "
                f"{'OK' if email_verify_ok else 'ÉCHEC (activer Email+SendGrid dans Verify)'}"
            )
            email_ok = email_ok or email_verify_ok
    else:
        sms_ok = notification_service.send_otp_sms(
            phone=args.phone,
            code="123456",
            purpose="admin_bootstrap",
        )
        print(f"  SMS (Twilio Messages): {'OK' if sms_ok else 'ÉCHEC'}")

    if email_ok and sms_ok:
        print("\nSuccès — redémarrez l'API puis testez /admin/setup")
        return 0
    print("\nÉchec — consultez les logs ci-dessus et .env.auth")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
