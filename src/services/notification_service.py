from __future__ import annotations

import logging
import os
import re
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

import requests

logger = logging.getLogger(__name__)

OTP_MINUTES = int(os.getenv("AUTH_OTP_MINUTES", "10"))
BRAND = os.getenv("NOTIFY_BRAND_NAME", "RAN Intelligence · Ooredoo")
TWILIO_VERIFY_MARKER = "__TWILIO_VERIFY__"
VONAGE_VERIFY_PREFIX = "__VONAGE_VERIFY__:"
WEBOTP_DOMAIN = (
    os.getenv("APP_WEBOTP_DOMAIN", "").strip()
    or os.getenv("APP_FRONTEND_URL", os.getenv("FRONTEND_URL", "http://localhost:3000"))
    .replace("https://", "")
    .replace("http://", "")
    .split("/")[0]
    .strip()
)

PURPOSE_LABELS = {
    "signup_verify": "activation de votre compte",
    "login_mfa": "connexion sécurisée",
    "admin_login": "connexion administrateur",
    "admin_bootstrap": "activation administrateur",
    "provision_verify": "activation de votre compte",
    "login_security": "vérification de sécurité après échecs de connexion",
    "email_verify": "vérification de votre adresse email",
    "password_reset": "réinitialisation de mot de passe",
    "password_reset_sms": "réinitialisation de mot de passe",
}


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _is_placeholder(value: str) -> bool:
    raw = value.strip()
    if not raw:
        return True
    lower = raw.lower()
    if lower == "api":
        return False
    if lower.startswith("ac") and set(lower[2:].replace("0", "")) <= {"x"}:
        return True
    markers = ("votre_", "your_", "change-me", "xxxxxxxx", "<your", "placeholder", "example.com token")
    if any(m in lower for m in markers):
        return True
    if len(raw) >= 8 and set(lower) <= {"x"}:
        return True
    return False


class NotificationService:
    def __init__(self) -> None:
        self.smtp_host = os.getenv("SMTP_HOST", "").strip()
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_user = os.getenv("SMTP_USER", "").strip()
        self.smtp_password = (os.getenv("SMTP_PASS") or os.getenv("SMTP_PASSWORD", "")).strip()
        raw_from = os.getenv("SMTP_FROM", self.smtp_user).strip()
        if raw_from and "@" in raw_from and "<" not in raw_from:
            self.smtp_from = f"{BRAND} <{raw_from}>"
        else:
            self.smtp_from = raw_from or self.smtp_user
        self.smtp_use_tls = _truthy(os.getenv("SMTP_USE_TLS", "true"))
        self.sms_provider = os.getenv("SMS_PROVIDER", "vonage").strip().lower()
        self.vonage_api_key = os.getenv("VONAGE_API_KEY", "").strip()
        self.vonage_api_secret = os.getenv("VONAGE_API_SECRET", "").strip()
        self.vonage_brand = (os.getenv("VONAGE_BRAND", "RANIntel") or "RANIntel").strip()[:18]
        self.vonage_code_length = int(os.getenv("VONAGE_CODE_LENGTH", "6"))
        self.twilio_sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
        self.twilio_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
        self.twilio_from = os.getenv("TWILIO_FROM_NUMBER", "").strip()
        self.twilio_sms_sender = os.getenv("TWILIO_SMS_SENDER_ID", "").strip()
        self.twilio_verify_sid = os.getenv("TWILIO_VERIFY_SERVICE_SID", "").strip()
        self.enabled = _truthy(os.getenv("AUTH_NOTIFICATIONS_ENABLED", "false"))

    def email_ready(self) -> bool:
        return bool(
            self.enabled
            and self.smtp_host
            and self.smtp_from
            and self.smtp_user
            and self.smtp_password
            and not _is_placeholder(self.smtp_user)
            and not _is_placeholder(self.smtp_password)
        )

    def vonage_verify_ready(self) -> bool:
        return bool(
            self.enabled
            and self.sms_provider in {"vonage", "nexmo", ""}
            and self.vonage_api_key
            and self.vonage_api_secret
            and not _is_placeholder(self.vonage_api_key)
            and not _is_placeholder(self.vonage_api_secret)
        )

    def twilio_messages_ready(self) -> bool:
        if not (self.enabled and self.twilio_sid and self.twilio_token):
            return False
        if _is_placeholder(self.twilio_sid) or _is_placeholder(self.twilio_token):
            return False
        from_number = self.twilio_from or self.twilio_sms_sender
        return bool(from_number and not _is_placeholder(from_number))

    def sms_ready(self) -> bool:
        return self.vonage_verify_ready() or self.twilio_verify_ready() or self.twilio_messages_ready()

    def twilio_verify_ready(self) -> bool:
        return bool(
            self.enabled
            and self.twilio_sid
            and self.twilio_token
            and self.twilio_verify_sid
            and not _is_placeholder(self.twilio_sid)
            and not _is_placeholder(self.twilio_token)
            and not _is_placeholder(self.twilio_verify_sid)
        )

    def email_otp_ready(self) -> bool:
        """Mailtrap/SMTP transactionnel (prioritaire) ou Twilio Verify email si SMTP absent."""
        return self.email_ready() or self.twilio_verify_ready()

    def sms_otp_ready(self) -> bool:
        return self.vonage_verify_ready() or self.sms_ready() or self.twilio_verify_ready()

    def external_sms_verify_ready(self) -> bool:
        return self.vonage_verify_ready() or self.twilio_verify_ready()

    def _sms_from(self) -> str:
        return self.twilio_sms_sender or self.twilio_from

    @staticmethod
    def format_phone_e164(phone: str) -> str:
        digits = re.sub(r"\D", "", phone.strip())
        if not digits:
            return phone.strip()
        if digits.startswith("216"):
            return f"+{digits}"
        if len(digits) == 8:
            return f"+216{digits}"
        if digits.startswith("0") and len(digits) == 9:
            return f"+216{digits[1:]}"
        return f"+{digits}"

    @staticmethod
    def format_phone_for_vonage(phone: str) -> str:
        """Vonage Verify v2 : numéro international sans + ni 00 (ex. 21623669609)."""
        return re.sub(r"\D", "", phone.strip())

    def _vonage_auth(self) -> tuple[str, str]:
        return (self.vonage_api_key, self.vonage_api_secret)

    def _purpose_label(self, purpose: str) -> str:
        return PURPOSE_LABELS.get(purpose, "vérification sécurisée")

    def _log_delivery(
        self,
        *,
        channel: str,
        destination: str,
        purpose: str,
        status: str,
        user_id: int | None = None,
        detail: str | None = None,
    ) -> None:
        try:
            from src.services.platform_activity_service import platform_activity_service

            platform_activity_service.log_notification(
                user_id=user_id,
                channel=channel,
                destination=destination,
                purpose=purpose,
                status=status,
                detail=detail,
            )
        except Exception:
            pass

    def _send_email(
        self,
        to: str,
        subject: str,
        text_body: str,
        html_body: str,
        *,
        purpose: str = "email",
        user_id: int | None = None,
    ) -> bool:
        if not self.email_ready():
            logger.warning("Email notifications not configured")
            return False
        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = self.smtp_from
        message["To"] = to
        message.attach(MIMEText(text_body, "plain", "utf-8"))
        message.attach(MIMEText(html_body, "html", "utf-8"))
        try:
            with smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=30) as server:
                server.ehlo()
                if self.smtp_use_tls:
                    server.starttls()
                    server.ehlo()
                if self.smtp_user and self.smtp_password:
                    server.login(self.smtp_user, self.smtp_password)
                server.sendmail(self.smtp_from, [to], message.as_string())
            logger.info("Email sent to %s — %s", to, subject)
            self._log_delivery(channel="email", destination=to, purpose=purpose, status="sent", user_id=user_id)
            return True
        except Exception as exc:
            logger.error("Email delivery failed to %s: %s", to, exc)
            self._log_delivery(
                channel="email",
                destination=to,
                purpose=purpose,
                status="failed",
                user_id=user_id,
                detail=str(exc)[:240],
            )
            return False

    def _send_sms(
        self,
        phone: str,
        body: str,
        *,
        purpose: str = "sms",
        user_id: int | None = None,
    ) -> bool:
        if not self.twilio_messages_ready():
            logger.warning("Twilio Messages API not configured")
            return False
        to_number = self.format_phone_e164(phone)
        try:
            response = requests.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{self.twilio_sid}/Messages.json",
                auth=(self.twilio_sid, self.twilio_token),
                data={"From": self._sms_from(), "To": to_number, "Body": body},
                timeout=20,
            )
            if response.status_code >= 400:
                logger.error("SMS delivery failed to %s: %s %s", to_number, response.status_code, response.text)
                return False
            logger.info("SMS sent to %s", to_number)
            self._log_delivery(channel="phone", destination=to_number, purpose=purpose, status="sent", user_id=user_id)
            return True
        except Exception as exc:
            logger.error("SMS delivery failed to %s: %s", to_number, exc)
            self._log_delivery(
                channel="phone",
                destination=to_number,
                purpose=purpose,
                status="failed",
                user_id=user_id,
                detail=str(exc)[:240],
            )
            return False

    def _html_shell(self, title: str, content: str) -> str:
        return f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px;">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">
<tr><td style="background:#ed1c24;padding:20px 28px;color:#fff;font-size:18px;font-weight:bold;">{BRAND}</td></tr>
<tr><td style="padding:28px;color:#333;line-height:1.6;">
<h2 style="margin:0 0 12px;color:#ed1c24;">{title}</h2>
{content}
<p style="margin-top:24px;font-size:12px;color:#888;">Message automatique — ne pas répondre.<br/>Ooredoo Tunisie · Plateforme interne RAN</p>
</td></tr></table></td></tr></table></body></html>"""

    def send_otp_email(self, *, to: str, full_name: str, code: str, purpose: str, user_id: int | None = None) -> bool:
        label = self._purpose_label(purpose)
        subject = f"{BRAND} — Code de vérification"
        text = (
            f"Bonjour {full_name},\n\n"
            f"Votre code pour la {label} est : {code}\n"
            f"Valide {OTP_MINUTES} minutes.\n\n"
            f"— {BRAND}"
        )
        html = self._html_shell(
            "Code de vérification",
            f"<p>Bonjour <strong>{full_name}</strong>,</p>"
            f"<p>Votre code pour la <strong>{label}</strong> :</p>"
            f'<p style="font-size:28px;font-weight:bold;letter-spacing:4px;color:#ed1c24;">{code}</p>'
            f"<p>Valide <strong>{OTP_MINUTES} minutes</strong>. Ne partagez ce code avec personne.</p>",
        )
        return self._send_email(to, subject, text, html, purpose=purpose, user_id=user_id)

    def send_otp_sms(self, *, phone: str, code: str, purpose: str, user_id: int | None = None) -> bool:
        label = self._purpose_label(purpose)
        body = (
            f"{BRAND}: code {label} = {code}. Valide {OTP_MINUTES} min. Ne partagez pas ce code.\n\n"
            f"@{WEBOTP_DOMAIN} #{code}"
        )
        return self._send_sms(phone, body, purpose=purpose, user_id=user_id)

    def start_twilio_verify(
        self,
        *,
        destination: str,
        channel: str,
        purpose: str,
        user_id: int | None = None,
    ) -> bool:
        if not self.twilio_verify_ready():
            return False
        verify_channel = channel.strip().lower()
        if verify_channel not in {"sms", "email"}:
            return False
        to = self.format_phone_e164(destination) if verify_channel == "sms" else destination.strip().lower()
        if not to:
            return False
        try:
            response = requests.post(
                f"https://verify.twilio.com/v2/Services/{self.twilio_verify_sid}/Verifications",
                auth=(self.twilio_sid, self.twilio_token),
                data={"To": to, "Channel": verify_channel},
                timeout=20,
            )
            if response.status_code >= 400:
                logger.error(
                    "Twilio Verify start failed for %s (%s): %s %s",
                    to,
                    verify_channel,
                    response.status_code,
                    response.text,
                )
                self._log_delivery(
                    channel=verify_channel,
                    destination=to,
                    purpose=purpose,
                    status="failed",
                    user_id=user_id,
                    detail=response.text[:240],
                )
                return False
            logger.info("Twilio Verify started for %s (%s)", to, verify_channel)
            self._log_delivery(
                channel=verify_channel,
                destination=to,
                purpose=purpose,
                status="sent",
                user_id=user_id,
                detail="twilio_verify",
            )
            return True
        except Exception as exc:
            logger.error("Twilio Verify start failed for %s (%s): %s", to, verify_channel, exc)
            self._log_delivery(
                channel=verify_channel,
                destination=to,
                purpose=purpose,
                status="failed",
                user_id=user_id,
                detail=str(exc)[:240],
            )
            return False

    def check_twilio_verify(
        self,
        *,
        destination: str,
        channel: str,
        code: str,
        purpose: str,
        user_id: int | None = None,
    ) -> bool:
        if not self.twilio_verify_ready():
            return False
        verify_channel = channel.strip().lower()
        if verify_channel not in {"sms", "email"}:
            return False
        to = self.format_phone_e164(destination) if verify_channel == "sms" else destination.strip().lower()
        if not to:
            return False
        try:
            response = requests.post(
                f"https://verify.twilio.com/v2/Services/{self.twilio_verify_sid}/VerificationCheck",
                auth=(self.twilio_sid, self.twilio_token),
                data={"To": to, "Code": code.strip()},
                timeout=20,
            )
            if response.status_code >= 400:
                return False
            payload = response.json()
            approved = str(payload.get("status", "")).lower() == "approved"
            self._log_delivery(
                channel=verify_channel,
                destination=to,
                purpose=purpose,
                status="verified" if approved else "failed",
                user_id=user_id,
                detail=str(payload.get("status", ""))[:120],
            )
            return approved
        except Exception as exc:
            logger.error("Twilio Verify check failed for %s (%s): %s", to, verify_channel, exc)
            return False

    def start_twilio_verify_sms(self, *, phone: str, purpose: str, user_id: int | None = None) -> bool:
        """Compatibilité ascendante."""
        return self.start_twilio_verify(destination=phone, channel="sms", purpose=purpose, user_id=user_id)

    def start_vonage_verify(
        self,
        *,
        phone: str,
        purpose: str,
        user_id: int | None = None,
    ) -> str | None:
        """Démarre Vonage Verify v2 — retourne request_id ou None."""
        if not self.vonage_verify_ready():
            return None
        to = self.format_phone_for_vonage(phone)
        if not to:
            return None
        payload = {
            "brand": self.vonage_brand,
            "code_length": self.vonage_code_length,
            "channel_timeout": 60,
            "workflow": [{"channel": "sms", "to": to}],
        }
        try:
            response = requests.post(
                "https://api.nexmo.com/v2/verify",
                auth=self._vonage_auth(),
                json=payload,
                timeout=20,
            )
            data = response.json() if response.text else {}
            if response.status_code >= 400:
                logger.error(
                    "Vonage Verify start failed for %s: %s %s",
                    to,
                    response.status_code,
                    response.text,
                )
                self._log_delivery(
                    channel="phone",
                    destination=to,
                    purpose=purpose,
                    status="failed",
                    user_id=user_id,
                    detail=str(data)[:240],
                )
                return None
            request_id = data.get("request_id")
            if not request_id:
                logger.error("Vonage Verify start missing request_id for %s: %s", to, data)
                return None
            logger.info("Vonage Verify started for %s (request_id=%s)", to, request_id)
            self._log_delivery(
                channel="phone",
                destination=to,
                purpose=purpose,
                status="sent",
                user_id=user_id,
                detail=f"vonage_verify:{request_id}",
            )
            return str(request_id)
        except Exception as exc:
            logger.error("Vonage Verify start failed for %s: %s", to, exc)
            self._log_delivery(
                channel="phone",
                destination=to,
                purpose=purpose,
                status="failed",
                user_id=user_id,
                detail=str(exc)[:240],
            )
            return None

    def check_vonage_verify(
        self,
        *,
        request_id: str,
        code: str,
        purpose: str,
        user_id: int | None = None,
    ) -> bool:
        if not self.vonage_verify_ready() or not request_id.strip():
            return False
        try:
            response = requests.post(
                f"https://api.nexmo.com/v2/verify/{request_id.strip()}",
                auth=self._vonage_auth(),
                json={"code": code.strip()},
                timeout=20,
            )
            data = response.json() if response.text else {}
            if response.status_code >= 400:
                self._log_delivery(
                    channel="phone",
                    destination=request_id,
                    purpose=purpose,
                    status="failed",
                    user_id=user_id,
                    detail=str(data)[:240],
                )
                return False
            completed = str(data.get("status", "")).lower() == "completed"
            self._log_delivery(
                channel="phone",
                destination=request_id,
                purpose=purpose,
                status="verified" if completed else "failed",
                user_id=user_id,
                detail=str(data.get("status", ""))[:120],
            )
            return completed
        except Exception as exc:
            logger.error("Vonage Verify check failed for %s: %s", request_id, exc)
            return False

    def send_access_key_email(
        self,
        *,
        to: str,
        full_name: str,
        access_key: str,
        context: str,
    ) -> bool:
        subject = f"{BRAND} — Clé d'accès session"
        text = (
            f"Bonjour {full_name},\n\n"
            f"Contexte : {context}\n"
            f"Votre clé d'accès pour la prochaine connexion :\n{access_key}\n\n"
            f"Cette clé change à chaque nouvelle session.\n\n— {BRAND}"
        )
        html = self._html_shell(
            "Clé d'accès session",
            f"<p>Bonjour <strong>{full_name}</strong>,</p>"
            f"<p><strong>{context}</strong></p>"
            f"<p>Votre clé pour la prochaine connexion :</p>"
            f'<p style="font-family:monospace;font-size:18px;font-weight:bold;color:#ed1c24;word-break:break-all;">{access_key}</p>'
            f"<p>Cette clé est renouvelée à chaque session. Conservez-la en lieu sûr.</p>",
        )
        return self._send_email(to, subject, text, html)

    def send_access_key_sms(self, *, phone: str, access_key: str, context: str) -> bool:
        body = f"{BRAND}: {context}. Clé prochaine session: {access_key}"
        return self._send_sms(phone, body)

    def send_account_welcome_email(
        self,
        *,
        to: str,
        full_name: str,
        personal_access_key: str,
        temporary_password: str | None = None,
    ) -> bool:
        subject = f"{BRAND} — Bienvenue, vos accès"
        pwd_block = ""
        pwd_html = ""
        if temporary_password:
            pwd_block = f"\nMot de passe temporaire : {temporary_password}\n"
            pwd_html = f"<p>Mot de passe temporaire : <code>{temporary_password}</code></p>"
        text = (
            f"Bonjour {full_name},\n\n"
            f"Votre compte RAN Intelligence a été créé.\n"
            f"{pwd_block}"
            f"Clé d'accès personnelle : {personal_access_key}\n\n"
            f"Les codes OTP ont été envoyés par email et SMS.\n\n— {BRAND}"
        )
        html = self._html_shell(
            "Bienvenue sur RAN Intelligence",
            f"<p>Bonjour <strong>{full_name}</strong>,</p>"
            f"<p>Votre compte a été créé avec succès.</p>"
            f"{pwd_html}"
            f"<p>Clé d'accès personnelle :</p>"
            f'<p style="font-family:monospace;font-weight:bold;color:#ed1c24;word-break:break-all;">{personal_access_key}</p>'
            f"<p>Les codes de vérification ont été envoyés sur votre email et votre téléphone.</p>",
        )
        return self._send_email(to, subject, text, html)

    def deliver_otp(
        self,
        *,
        channel: str,
        email: str,
        phone: str,
        full_name: str,
        code: str,
        purpose: str,
        user_id: int | None = None,
    ) -> bool:
        if channel == "email":
            return self.send_otp_email(to=email, full_name=full_name, code=code, purpose=purpose, user_id=user_id)
        if channel == "phone":
            return self.send_otp_sms(phone=phone, code=code, purpose=purpose, user_id=user_id)
        return False

    def send_email_verification(
        self,
        *,
        to: str,
        full_name: str,
        verify_url: str,
        expires_hours: int,
        user_id: int | None = None,
    ) -> bool:
        from src.services.email_templates import verification_email

        subject, text, html = verification_email(
            full_name=full_name,
            verify_url=verify_url,
            expires_hours=expires_hours,
            brand=BRAND,
        )
        return self._send_email(to, subject, text, html, purpose="email_verify", user_id=user_id)

    def send_password_reset(
        self,
        *,
        to: str,
        full_name: str,
        reset_url: str,
        expires_hours: int,
        user_id: int | None = None,
    ) -> bool:
        from src.services.email_templates import password_reset_email

        subject, text, html = password_reset_email(
            full_name=full_name,
            reset_url=reset_url,
            expires_hours=expires_hours,
            brand=BRAND,
        )
        return self._send_email(to, subject, text, html, purpose="password_reset", user_id=user_id)

    def send_failed_login_alert(
        self,
        *,
        to: str,
        full_name: str,
        failed_attempts: int,
        user_id: int | None = None,
    ) -> bool:
        from src.services.email_templates import failed_login_alert_email

        subject, text, html = failed_login_alert_email(
            full_name=full_name,
            failed_attempts=failed_attempts,
            brand=BRAND,
            login_url=f"{os.getenv('APP_FRONTEND_URL', os.getenv('FRONTEND_URL', 'http://localhost:3000')).rstrip('/')}/login",
        )
        return self._send_email(to, subject, text, html, purpose="login_security", user_id=user_id)

    def deliver_session_key(
        self,
        *,
        email: str,
        phone: str,
        full_name: str,
        access_key: str,
        context: str,
        role: str,
    ) -> dict[str, bool]:
        if role == "admin":
            return {"email": False, "sms": False}
        email_sent = self.send_access_key_email(to=email, full_name=full_name, access_key=access_key, context=context)
        sms_sent = self.send_access_key_sms(phone=phone, access_key=access_key, context=context)
        return {"email": email_sent, "sms": sms_sent}

    def send_signup_access_request_admin(
        self,
        *,
        to: str,
        full_name: str,
        user_email: str,
        phone: str,
        job_profile: str,
        department: str,
    ) -> bool:
        subject = f"{BRAND} — Nouvelle demande d'accès utilisateur"
        dept = department or "—"
        text = (
            f"Une nouvelle demande d'accès a été soumise.\n\n"
            f"Nom : {full_name}\nEmail : {user_email}\nTéléphone : {phone}\n"
            f"Profil : {job_profile}\nDépartement : {dept}\n\n"
            f"Validez la demande dans Admin → Utilisateurs.\n— {BRAND}"
        )
        html = self._html_shell(
            "Demande d'accès en attente",
            f"<p><strong>{full_name}</strong> ({user_email}) a demandé un accès.</p>"
            f"<ul><li>Téléphone : {phone}</li><li>Profil : {job_profile}</li><li>Département : {dept}</li></ul>"
            f"<p>Connectez-vous à la plateforme → <strong>Admin / Utilisateurs</strong> pour accepter ou refuser.</p>",
        )
        return self._send_email(to, subject, text, html, purpose="signup_access_request")

    def send_signup_access_approved(
        self,
        *,
        to: str,
        full_name: str,
        login_url: str,
        user_id: int | None = None,
    ) -> bool:
        subject = f"{BRAND} — Accès approuvé"
        text = (
            f"Bonjour {full_name},\n\n"
            f"Votre demande d'accès à RAN Intelligence a été approuvée par un administrateur.\n"
            f"Connectez-vous : {login_url}\n\n— {BRAND}"
        )
        html = self._html_shell(
            "Accès approuvé",
            f"<p>Bonjour <strong>{full_name}</strong>,</p>"
            f"<p>Votre demande d'accès a été <strong>approuvée</strong>.</p>"
            f'<p><a href="{login_url}" style="color:#ed1c24;font-weight:bold;">Se connecter</a></p>',
        )
        return self._send_email(to, subject, text, html, purpose="signup_access_approved", user_id=user_id)

    def send_signup_access_rejected(
        self,
        *,
        to: str,
        full_name: str,
        user_id: int | None = None,
    ) -> bool:
        subject = f"{BRAND} — Demande d'accès refusée"
        text = (
            f"Bonjour {full_name},\n\n"
            f"Votre demande d'accès à RAN Intelligence n'a pas été approuvée.\n"
            f"Contactez votre administrateur pour plus d'informations.\n\n— {BRAND}"
        )
        html = self._html_shell(
            "Demande non approuvée",
            f"<p>Bonjour <strong>{full_name}</strong>,</p>"
            f"<p>Votre demande d'accès n'a pas été approuvée. Contactez votre administrateur.</p>",
        )
        return self._send_email(to, subject, text, html, purpose="signup_access_rejected", user_id=user_id)

    def status(self) -> dict[str, Any]:
        dev_mode = os.getenv("AUTH_DEV_MODE", "true").strip().lower() in {"1", "true", "yes"}
        return {
            "enabled": self.enabled,
            "dev_mode": dev_mode,
            "sms_provider": self.sms_provider,
            "email_ready": self.email_ready(),
            "sms_ready": self.sms_ready(),
            "email_otp_ready": self.email_otp_ready(),
            "sms_otp_ready": self.sms_otp_ready(),
            "vonage_verify_ready": self.vonage_verify_ready(),
            "twilio_verify_ready": self.twilio_verify_ready(),
            "sms_sender_id": self.vonage_brand if self.vonage_verify_ready() else (self.twilio_sms_sender or None),
        }


notification_service = NotificationService()
