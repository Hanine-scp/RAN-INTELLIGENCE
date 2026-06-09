from __future__ import annotations

import hashlib
import os
import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import jwt
from passlib.context import CryptContext

from src.services.auth_database import (
    AuthDbConnection,
    DbRow,
    auth_db_connect,
    auth_db_path,
    init_auth_schema,
    use_postgres,
)
from src.services.platform_activity_service import init_platform_tables
from src.services.notification_service import notification_service

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
JWT_SECRET = os.getenv("AUTH_JWT_SECRET", "change-me-ran-intelligence-internal")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = int(os.getenv("AUTH_ACCESS_TOKEN_MINUTES", "30"))
REFRESH_TOKEN_DAYS = int(os.getenv("AUTH_REFRESH_TOKEN_DAYS", "7"))
OTP_MINUTES = int(os.getenv("AUTH_OTP_MINUTES", "10"))
AUTH_DEV_MODE = os.getenv("AUTH_DEV_MODE", "true").lower() in {"1", "true", "yes"}

USER_JOB_PROFILES = [
    "ingenieur_ran_nokia",
    "ingenieur_optimisation_ran",
    "equipe_maintenance",
    "responsable_spares",
    "data_analyst_bi",
    "data_scientist_ia",
    "responsable_reseau_manager",
]

USER_PERMISSIONS = [
    "view_sites",
    "view_inventory",
    "compare_dates",
    "view_statistics",
    "view_failure_cards",
    "use_ai_search",
    "view_predictions",
    "view_spares",
    "export_reports",
]

ADMIN_PERMISSIONS = USER_PERMISSIONS + [
    "import_xml",
    "manage_snapshots",
    "manage_users",
    "manage_roles",
    "manage_settings",
    "manage_trust",
    "view_ops",
]


@dataclass
class AuthUser:
    id: int
    email: str
    phone: str
    full_name: str
    role: str
    job_profile: str
    permissions: list[str]
    email_verified: bool
    phone_verified: bool
    is_active: bool


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _normalize_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone.strip())
    return digits


def _hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class AuthService:
    def __init__(self, db_path: Path | None = None) -> None:
        self.db_path = db_path or auth_db_path()
        if not use_postgres():
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
        self._seed_defaults()

    def _connect(self):
        return auth_db_connect(None if use_postgres() else self.db_path)

    def _init_db(self) -> None:
        with self._connect() as conn:
            init_auth_schema(conn)
            init_platform_tables(conn)

    def _generate_temp_password(self) -> str:
        return f"RAN-{secrets.token_urlsafe(10)}!1"

    def _seed_defaults(self) -> None:
        admin_email = os.getenv("ADMIN_EMAIL", "admin@ooredoo.ran").strip().lower()
        admin_password = os.getenv("ADMIN_PASSWORD", "Admin@RAN2026!")
        admin_phone = os.getenv("ADMIN_PHONE", "21600000000")
        admin_name = os.getenv("ADMIN_NAME", "Administrateur RAN")
        admin_access_key = os.getenv("ADMIN_ACCESS_KEY", "RAN-ADMIN-MASTER-KEY")

        with self._connect() as conn:
            row = conn.execute("SELECT id FROM users WHERE role = 'admin' LIMIT 1").fetchone()
            if row is None:
                now = _iso(_utcnow())
                conn.execute(
                    """
                    INSERT INTO users (
                        email, phone, password_hash, full_name, role, job_profile,
                        personal_access_key_hash, email_verified, phone_verified, is_active, created_at
                    ) VALUES (?, ?, ?, ?, 'admin', 'platform_admin', ?, 1, 1, 1, ?)
                    """,
                    (
                        admin_email,
                        admin_phone,
                        pwd_context.hash(admin_password),
                        admin_name,
                        _hash_secret(admin_access_key),
                        now,
                    ),
                )
                admin_id = conn.execute("SELECT id FROM users WHERE email = ?", (admin_email,)).fetchone()["id"]
                self._audit(conn, admin_id, "seed_admin", "Default admin account created")

            admin_key_exists = conn.execute(
                "SELECT id FROM access_keys WHERE key_type = 'admin_login' LIMIT 1"
            ).fetchone()
            if admin_key_exists is None:
                now = _iso(_utcnow())
                conn.execute(
                    """
                    INSERT INTO access_keys (key_hash, key_label, key_type, created_by, max_uses, uses_count, is_active, created_at)
                    VALUES (?, 'Admin master key', 'admin_login', NULL, 999999, 0, 1, ?)
                    """,
                    (_hash_secret(admin_access_key), now),
                )

            signup_key_exists = conn.execute(
                "SELECT id FROM access_keys WHERE key_type = 'signup' LIMIT 1"
            ).fetchone()
            if signup_key_exists is None:
                default_signup_key = os.getenv("DEFAULT_SIGNUP_KEY", "RAN-USER-INVITE-2026")
                now = _iso(_utcnow())
                conn.execute(
                    """
                    INSERT INTO access_keys (key_hash, key_label, key_type, created_by, max_uses, uses_count, is_active, created_at)
                    VALUES (?, 'Default user invite', 'signup', NULL, 999999, 0, 1, ?)
                    """,
                    (_hash_secret(default_signup_key), now),
                )

    def _audit(self, conn: AuthDbConnection, user_id: int | None, action: str, detail: str = "") -> None:
        conn.execute(
            "INSERT INTO auth_audit (user_id, action, detail, created_at) VALUES (?, ?, ?, ?)",
            (user_id, action, detail, _iso(_utcnow())),
        )

    def _permissions_for_role(self, role: str) -> list[str]:
        return ADMIN_PERMISSIONS if role == "admin" else USER_PERMISSIONS

    def _row_to_user(self, row: DbRow) -> AuthUser:
        role = str(row["role"])
        return AuthUser(
            id=int(row["id"]),
            email=str(row["email"]),
            phone=str(row["phone"]),
            full_name=str(row["full_name"]),
            role=role,
            job_profile=str(row["job_profile"] or ""),
            permissions=self._permissions_for_role(role),
            email_verified=bool(row["email_verified"]),
            phone_verified=bool(row["phone_verified"]),
            is_active=bool(row["is_active"]),
        )

    def _rotate_personal_access_key(self, conn: AuthDbConnection, user_id: int) -> str:
        new_key = secrets.token_urlsafe(16).upper()
        conn.execute(
            "UPDATE users SET personal_access_key_hash = ? WHERE id = ?",
            (_hash_secret(new_key), user_id),
        )
        return new_key

    def _issue_tokens(self, user: AuthUser, *, session_access_key: str | None = None) -> dict[str, Any]:
        now = _utcnow()
        access_payload = {
            "sub": str(user.id),
            "role": user.role,
            "email": user.email,
            "permissions": user.permissions,
            "type": "access",
            "exp": now + timedelta(minutes=ACCESS_TOKEN_MINUTES),
        }
        refresh_value = secrets.token_urlsafe(48)
        refresh_payload = {
            "sub": str(user.id),
            "type": "refresh",
            "jti": _hash_secret(refresh_value),
            "exp": now + timedelta(days=REFRESH_TOKEN_DAYS),
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO refresh_tokens (user_id, token_hash, expires_at, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (user.id, _hash_secret(refresh_value), _iso(now + timedelta(days=REFRESH_TOKEN_DAYS)), _iso(now)),
            )
            conn.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (_iso(now), user.id))
            self._audit(conn, user.id, "login_success")
        payload: dict[str, Any] = {
            "access_token": jwt.encode(access_payload, JWT_SECRET, algorithm=JWT_ALGORITHM),
            "refresh_token": refresh_value,
            "token_type": "bearer",
            "expires_in": ACCESS_TOKEN_MINUTES * 60,
            "user": self.serialize_user(user),
        }
        if session_access_key:
            payload["session_access_key"] = session_access_key
        return payload

    def serialize_user(self, user: AuthUser) -> dict[str, Any]:
        return {
            "id": user.id,
            "email": user.email,
            "phone": user.phone,
            "full_name": user.full_name,
            "role": user.role,
            "job_profile": user.job_profile,
            "permissions": user.permissions,
            "email_verified": user.email_verified,
            "phone_verified": user.phone_verified,
            "is_active": user.is_active,
        }

    def decode_token(self, token: str, expected_type: str = "access") -> dict[str, Any]:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        except jwt.PyJWTError as exc:
            raise ValueError("Invalid token") from exc
        if payload.get("type") != expected_type:
            raise ValueError("Invalid token type")
        return payload

    def get_user_by_id(self, user_id: int) -> AuthUser | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return self._row_to_user(row) if row else None

    def get_user_from_access_token(self, token: str) -> AuthUser:
        payload = self.decode_token(token, "access")
        user = self.get_user_by_id(int(payload["sub"]))
        if not user or not user.is_active:
            raise ValueError("User inactive")
        return user

    def _validate_access_key(self, conn: AuthDbConnection, raw_key: str, key_type: str) -> DbRow:
        key_hash = _hash_secret(raw_key.strip())
        row = conn.execute(
            """
            SELECT * FROM access_keys
            WHERE key_hash = ? AND key_type = ? AND is_active = 1
            """,
            (key_hash, key_type),
        ).fetchone()
        if row is None:
            raise ValueError("Invalid access key")
        if row["expires_at"]:
            expires_at = datetime.fromisoformat(str(row["expires_at"]))
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if _utcnow() > expires_at:
                raise ValueError("Access key expired")
        if int(row["uses_count"]) >= int(row["max_uses"]):
            raise ValueError("Access key usage limit reached")
        return row

    def _consume_access_key(self, conn: AuthDbConnection, key_id: int) -> None:
        conn.execute("UPDATE access_keys SET uses_count = uses_count + 1 WHERE id = ?", (key_id,))

    def _user_contact(self, conn: AuthDbConnection, user_id: int) -> tuple[str, str, str]:
        row = conn.execute("SELECT email, phone, full_name FROM users WHERE id = ?", (user_id,)).fetchone()
        if row is None:
            raise ValueError("User not found")
        return str(row["email"]), str(row["phone"]), str(row["full_name"])

    def _generate_otp_code(self, channel: str) -> str:
        if channel == "email":
            alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
            return "".join(secrets.choice(alphabet) for _ in range(6))
        return f"{secrets.randbelow(1_000_000):06d}"

    def _normalize_otp_input(self, channel: str, code: str) -> str:
        if channel == "email":
            return re.sub(r"[^A-Z0-9]", "", code.strip().upper())
        return re.sub(r"\D", "", code.strip())

    def _create_otp(self, conn: AuthDbConnection, user_id: int, channel: str, purpose: str) -> tuple[str, str]:
        code = self._generate_otp_code(channel)
        expires = _iso(_utcnow() + timedelta(minutes=OTP_MINUTES))
        conn.execute(
            """
            INSERT INTO otp_codes (user_id, channel, code_hash, purpose, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (user_id, channel, _hash_secret(code), purpose, expires, _iso(_utcnow())),
        )
        return expires, code

    def _issue_otp(self, conn: AuthDbConnection, user_id: int, channel: str, purpose: str) -> tuple[str, str | None, bool]:
        expires, code = self._create_otp(conn, user_id, channel, purpose)
        email, phone, full_name = self._user_contact(conn, user_id)
        sent = notification_service.deliver_otp(
            channel=channel,
            email=email,
            phone=phone,
            full_name=full_name,
            code=code,
            purpose=purpose,
            user_id=user_id,
        )
        dev_hint = code if (AUTH_DEV_MODE and not sent) else None
        return expires, dev_hint, sent

    def _expose_secret(self, value: str, delivered: bool) -> str | None:
        if delivered:
            return None
        return value if AUTH_DEV_MODE else None

    def _deliver_session_access_key(self, user: AuthUser, access_key: str, context: str) -> dict[str, bool]:
        return notification_service.deliver_session_key(
            email=user.email,
            phone=user.phone,
            full_name=user.full_name,
            access_key=access_key,
            context=context,
            role=user.role,
        )

    def _verify_otp(self, conn: AuthDbConnection, user_id: int, channel: str, purpose: str, code: str) -> None:
        row = conn.execute(
            """
            SELECT * FROM otp_codes
            WHERE user_id = ? AND channel = ? AND purpose = ? AND consumed_at IS NULL
            ORDER BY id DESC LIMIT 1
            """,
            (user_id, channel, purpose),
        ).fetchone()
        if row is None:
            raise ValueError("OTP not found")
        expires_at = datetime.fromisoformat(str(row["expires_at"]))
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if _utcnow() > expires_at:
            raise ValueError("OTP expired")
        normalized = self._normalize_otp_input(channel, code)
        if _hash_secret(normalized) != str(row["code_hash"]):
            raise ValueError("Invalid OTP")
        conn.execute("UPDATE otp_codes SET consumed_at = ? WHERE id = ?", (_iso(_utcnow()), row["id"]))

    def signup_user(
        self,
        *,
        email: str,
        phone: str,
        password: str,
        full_name: str,
        job_profile: str,
        signup_access_key: str,
    ) -> dict[str, Any]:
        email_norm = _normalize_email(email)
        phone_norm = _normalize_phone(phone) if phone else ""
        if not full_name.strip():
            raise ValueError("Full name is required")
        if phone_norm and len(phone_norm) < 8:
            raise ValueError("Invalid phone number")
        if job_profile not in USER_JOB_PROFILES:
            raise ValueError("Invalid job profile")
        if len(password) < 10:
            raise ValueError("Password must be at least 10 characters")

        personal_key = secrets.token_urlsafe(16).upper()
        phone_expires: str | None = None
        phone_code: str | None = None
        phone_sent = False
        with self._connect() as conn:
            existing = conn.execute("SELECT id FROM users WHERE email = ?", (email_norm,)).fetchone()
            if existing:
                raise ValueError("Email already registered")
            key_row = self._validate_access_key(conn, signup_access_key, "signup")
            now = _iso(_utcnow())
            conn.execute(
                """
                INSERT INTO users (
                    email, phone, password_hash, full_name, role, job_profile,
                    personal_access_key_hash, email_verified, phone_verified, is_active, created_at
                ) VALUES (?, ?, ?, ?, 'user', ?, ?, 0, 0, 0, ?)
                """,
                (
                    email_norm,
                    phone_norm,
                    pwd_context.hash(password),
                    full_name.strip(),
                    job_profile,
                    _hash_secret(personal_key),
                    now,
                ),
            )
            user_id = conn.execute("SELECT id FROM users WHERE email = ?", (email_norm,)).fetchone()["id"]
            self._consume_access_key(conn, int(key_row["id"]))
            email_expires, email_code, email_sent = self._issue_otp(conn, user_id, "email", "signup_verify")
            if phone_norm:
                phone_expires, phone_code, phone_sent = self._issue_otp(conn, user_id, "phone", "signup_verify")
            welcome_sent = notification_service.send_account_welcome_email(
                to=email_norm,
                full_name=full_name.strip(),
                personal_access_key=personal_key,
            )
            self._audit(conn, user_id, "signup_started", job_profile)

        delivered = email_sent or phone_sent or welcome_sent
        return {
            "user_id": user_id,
            "message": "Compte créé. Consultez votre email et SMS pour les codes de vérification."
            if phone_sent
            else "Compte créé. Un email a été envoyé."
            if delivered
            else "Compte créé. Vérifiez votre email.",
            "personal_access_key": self._expose_secret(personal_key, welcome_sent),
            "notifications": {
                "email_otp": email_sent,
                "sms_otp": phone_sent,
                "welcome_email": welcome_sent,
            },
            "verification": {
                "email_expires_at": email_expires,
                "phone_expires_at": phone_expires,
                "dev_email_code": email_code,
                "dev_phone_code": phone_code,
            },
        }

    def resend_signup_otp(self, *, user_id: int) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, is_active, phone FROM users WHERE id = ? AND role = 'user'",
                (user_id,),
            ).fetchone()
            if row is None:
                raise ValueError("User not found")
            if bool(row["is_active"]):
                raise ValueError("Account already activated")
            for channel in ("email", "phone"):
                conn.execute(
                    """
                    UPDATE otp_codes SET consumed_at = ?
                    WHERE user_id = ? AND channel = ? AND purpose = 'signup_verify' AND consumed_at IS NULL
                    """,
                    (_iso(_utcnow()), user_id, channel),
                )
            email_expires, email_code, email_sent = self._issue_otp(conn, user_id, "email", "signup_verify")
            phone_expires: str | None = None
            phone_code: str | None = None
            phone_sent = False
            if str(row["phone"] or "").strip():
                phone_expires, phone_code, phone_sent = self._issue_otp(conn, user_id, "phone", "signup_verify")
            self._audit(conn, user_id, "signup_otp_resent")
        return {
            "user_id": user_id,
            "message": "Nouveaux codes générés.",
            "notifications": {"email_otp": email_sent, "sms_otp": phone_sent},
            "verification": {
                "email_expires_at": email_expires,
                "phone_expires_at": phone_expires,
                "dev_email_code": email_code,
                "dev_phone_code": phone_code,
            },
        }

    def signup_set_phone(self, *, user_id: int, phone: str) -> dict[str, Any]:
        phone_norm = _normalize_phone(phone)
        if not phone_norm or len(phone_norm) < 8:
            raise ValueError("Invalid phone number")
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, is_active, email FROM users WHERE id = ? AND role = 'user'",
                (user_id,),
            ).fetchone()
            if row is None:
                raise ValueError("User not found")
            if bool(row["is_active"]):
                raise ValueError("Account already activated")
            conn.execute("UPDATE users SET phone = ? WHERE id = ?", (phone_norm, user_id))
            conn.execute(
                """
                UPDATE otp_codes SET consumed_at = ?
                WHERE user_id = ? AND channel = 'phone' AND purpose = 'signup_verify' AND consumed_at IS NULL
                """,
                (_iso(_utcnow()), user_id),
            )
            phone_expires, phone_code, phone_sent = self._issue_otp(conn, user_id, "phone", "signup_verify")
            self._audit(conn, user_id, "signup_phone_set", phone_norm)
        return {
            "user_id": user_id,
            "phone": phone_norm,
            "message": "Code SMS envoyé sur votre téléphone." if phone_sent else "Téléphone enregistré.",
            "notifications": {"sms_otp": phone_sent},
            "verification": {
                "phone_expires_at": phone_expires,
                "dev_phone_code": phone_code,
            },
        }

    def verify_signup(self, *, user_id: int, email_code: str, phone_code: str) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ? AND role = 'user'", (user_id,)).fetchone()
            if row is None:
                raise ValueError("User not found")
            if not str(row["phone"] or "").strip():
                raise ValueError("Phone number required before verification")
            self._verify_otp(conn, user_id, "email", "signup_verify", email_code)
            self._verify_otp(conn, user_id, "phone", "signup_verify", phone_code)
            conn.execute(
                "UPDATE users SET email_verified = 1, phone_verified = 1, is_active = 1 WHERE id = ?",
                (user_id,),
            )
            self._audit(conn, user_id, "signup_verified")
            session_key = self._rotate_personal_access_key(conn, user_id)
        user = self.get_user_by_id(user_id)
        if not user:
            raise ValueError("User not found")
        key_delivery = self._deliver_session_access_key(user, session_key, "Activation du compte réussie")
        tokens = self._issue_tokens(
            user,
            session_access_key=session_key if not (key_delivery["email"] or key_delivery["sms"]) else None,
        )
        tokens["notifications"] = key_delivery
        if key_delivery["email"] or key_delivery["sms"]:
            tokens["message"] = "Compte activé. Votre nouvelle clé d'accès a été envoyée par email et SMS."
        return tokens

    def login_user_step1(self, *, email: str, password: str) -> dict[str, Any]:
        email_norm = _normalize_email(email)
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM users WHERE email = ? AND role = 'user'", (email_norm,)).fetchone()
            if row is None or not pwd_context.verify(password, str(row["password_hash"])):
                raise ValueError("Invalid credentials")
            if not bool(row["is_active"]):
                raise ValueError("Account pending verification")
            user_id = int(row["id"])
            email_expires, email_code, email_sent = self._issue_otp(conn, user_id, "email", "login_mfa")
            phone_expires, phone_code, phone_sent = self._issue_otp(conn, user_id, "phone", "login_mfa")
            self._audit(conn, user_id, "login_user_step1")
        return {
            "user_id": user_id,
            "mfa_required": True,
            "channels": ["email", "phone", "access_key"],
            "message": "Codes envoyés par email et SMS." if (email_sent or phone_sent) else "",
            "notifications": {"email_otp": email_sent, "sms_otp": phone_sent},
            "verification": {
                "email_expires_at": email_expires,
                "phone_expires_at": phone_expires,
                "dev_email_code": email_code,
                "dev_phone_code": phone_code,
            },
        }

    def login_user_step2(
        self,
        *,
        user_id: int,
        channel: str,
        code: str = "",
        access_key: str = "",
    ) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ? AND role = 'user'", (user_id,)).fetchone()
            if row is None:
                raise ValueError("User not found")
            if channel in {"email", "phone"}:
                self._verify_otp(conn, user_id, channel, "login_mfa", code)
            elif channel == "access_key":
                if _hash_secret(access_key.strip()) != str(row["personal_access_key_hash"] or ""):
                    raise ValueError("Invalid personal access key")
            else:
                raise ValueError("Invalid MFA channel")
            self._audit(conn, user_id, "login_user_mfa", channel)
            session_key = self._rotate_personal_access_key(conn, user_id)
        user = self.get_user_by_id(user_id)
        if not user:
            raise ValueError("User not found")
        key_delivery = self._deliver_session_access_key(user, session_key, "Connexion réussie")
        tokens = self._issue_tokens(
            user,
            session_access_key=session_key if not (key_delivery["email"] or key_delivery["sms"]) else None,
        )
        tokens["notifications"] = key_delivery
        if key_delivery["email"] or key_delivery["sms"]:
            tokens["message"] = "Connexion réussie. Votre nouvelle clé d'accès a été envoyée par email et SMS."
        return tokens

    def login_admin_step1(self, *, email: str, password: str, admin_access_key: str) -> dict[str, Any]:
        email_norm = _normalize_email(email)
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM users WHERE email = ? AND role = 'admin'", (email_norm,)).fetchone()
            if row is None or not pwd_context.verify(password, str(row["password_hash"])):
                raise ValueError("Invalid admin credentials")
            key_row = self._validate_access_key(conn, admin_access_key, "admin_login")
            user_id = int(row["id"])
            self._consume_access_key(conn, int(key_row["id"]))
            email_expires, email_code, email_sent = self._issue_otp(conn, user_id, "email", "admin_login")
            self._audit(conn, user_id, "login_admin_step1")
        return {
            "user_id": user_id,
            "mfa_required": True,
            "channels": ["email"],
            "message": "Code envoyé par email." if email_sent else "",
            "notifications": {"email_otp": email_sent},
            "verification": {
                "email_expires_at": email_expires,
                "dev_email_code": email_code,
            },
        }

    def login_admin_step2(self, *, user_id: int, email_code: str) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ? AND role = 'admin'", (user_id,)).fetchone()
            if row is None:
                raise ValueError("Admin not found")
            self._verify_otp(conn, user_id, "email", "admin_login", email_code)
            self._audit(conn, user_id, "login_admin_verified")
        user = self.get_user_by_id(user_id)
        if not user:
            raise ValueError("Admin not found")
        return self._issue_tokens(user)

    def refresh_session(self, refresh_token: str) -> dict[str, Any]:
        payload = self.decode_token(refresh_token, "refresh")
        token_hash = str(payload.get("jti", ""))
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT * FROM refresh_tokens
                WHERE token_hash = ? AND revoked_at IS NULL
                """,
                (token_hash,),
            ).fetchone()
            if row is None:
                raise ValueError("Refresh token revoked")
            expires_at = datetime.fromisoformat(str(row["expires_at"]))
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if _utcnow() > expires_at:
                raise ValueError("Refresh token expired")
            conn.execute("UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?", (_iso(_utcnow()), row["id"]))
        user = self.get_user_by_id(int(payload["sub"]))
        if not user:
            raise ValueError("User not found")
        return self._issue_tokens(user)

    def logout(self, refresh_token: str) -> None:
        token_hash = _hash_secret(refresh_token)
        with self._connect() as conn:
            conn.execute(
                "UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?",
                (_iso(_utcnow()), token_hash),
            )

    def admin_create_user(
        self,
        *,
        created_by: int,
        full_name: str,
        email: str,
        phone: str,
        job_profile: str,
        department: str = "",
        employee_id: str = "",
        password: str = "",
    ) -> dict[str, Any]:
        email_norm = _normalize_email(email)
        phone_norm = _normalize_phone(phone)
        if not phone_norm or len(phone_norm) < 8:
            raise ValueError("Invalid phone number")
        if job_profile not in USER_JOB_PROFILES:
            raise ValueError("Invalid job profile")
        if not full_name.strip():
            raise ValueError("Full name is required")
        if not department.strip():
            raise ValueError("Department is required")

        temp_password = password.strip() or self._generate_temp_password()
        if len(temp_password) < 10:
            raise ValueError("Password must be at least 10 characters")

        personal_key = secrets.token_urlsafe(16).upper()
        now = _iso(_utcnow())
        with self._connect() as conn:
            existing = conn.execute("SELECT id FROM users WHERE email = ?", (email_norm,)).fetchone()
            if existing:
                raise ValueError("Email already registered")
            conn.execute(
                """
                INSERT INTO users (
                    email, phone, password_hash, full_name, role, job_profile,
                    personal_access_key_hash, email_verified, phone_verified, is_active,
                    created_at, department, employee_id, created_by_admin_id
                ) VALUES (?, ?, ?, ?, 'user', ?, ?, 0, 0, 0, ?, ?, ?, ?)
                """,
                (
                    email_norm,
                    phone_norm,
                    pwd_context.hash(temp_password),
                    full_name.strip(),
                    job_profile,
                    _hash_secret(personal_key),
                    now,
                    department.strip(),
                    employee_id.strip(),
                    created_by,
                ),
            )
            user_id = int(conn.execute("SELECT id FROM users WHERE email = ?", (email_norm,)).fetchone()["id"])
            email_expires, email_code, email_sent = self._issue_otp(conn, user_id, "email", "provision_verify")
            phone_expires, phone_code, phone_sent = self._issue_otp(conn, user_id, "phone", "provision_verify")
            welcome_sent = notification_service.send_account_welcome_email(
                to=email_norm,
                full_name=full_name.strip(),
                personal_access_key=personal_key,
                temporary_password=temp_password,
            )
            self._audit(conn, created_by, "admin_user_created", f"{user_id}:{email_norm}")

        delivered = email_sent or phone_sent or welcome_sent
        return {
            "user_id": user_id,
            "email": email_norm,
            "phone": phone_norm,
            "message": "Compte créé. Email et SMS envoyés avec les codes et accès."
            if delivered
            else "Compte créé. Vérification email et téléphone requise.",
            "temporary_password": self._expose_secret(temp_password, welcome_sent),
            "personal_access_key": self._expose_secret(personal_key, welcome_sent),
            "notifications": {
                "email_otp": email_sent,
                "sms_otp": phone_sent,
                "welcome_email": welcome_sent,
            },
            "verification": {
                "email_expires_at": email_expires,
                "phone_expires_at": phone_expires,
                "dev_email_code": email_code,
                "dev_phone_code": phone_code,
            },
        }

    def verify_user_provision(
        self,
        *,
        user_id: int,
        email_code: str,
        phone_code: str,
        actor_id: int | None = None,
    ) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ? AND role = 'user'", (user_id,)).fetchone()
            if row is None:
                raise ValueError("User not found")
            self._verify_otp(conn, user_id, "email", "provision_verify", email_code)
            self._verify_otp(conn, user_id, "phone", "provision_verify", phone_code)
            conn.execute(
                "UPDATE users SET email_verified = 1, phone_verified = 1, is_active = 1 WHERE id = ?",
                (user_id,),
            )
            self._audit(conn, actor_id or user_id, "user_provision_verified", str(user_id))
        user = self.get_user_by_id(user_id)
        if not user:
            raise ValueError("User not found")
        return {
            "user": self.serialize_user(user),
            "message": "Compte activé. L'utilisateur peut se connecter.",
        }

    def activate_user_by_email(
        self,
        *,
        email: str,
        email_code: str,
        phone_code: str,
    ) -> dict[str, Any]:
        email_norm = _normalize_email(email)
        with self._connect() as conn:
            row = conn.execute("SELECT id FROM users WHERE email = ? AND role = 'user'", (email_norm,)).fetchone()
            if row is None:
                raise ValueError("User not found")
            user_id = int(row["id"])
        return self.verify_user_provision(user_id=user_id, email_code=email_code, phone_code=phone_code, actor_id=user_id)

    def resend_provision_otp(self, *, user_id: int, actor_id: int) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, is_active, email_verified, phone_verified FROM users WHERE id = ? AND role = 'user'",
                (user_id,),
            ).fetchone()
            if row is None:
                raise ValueError("User not found")
            if bool(row["is_active"]) and bool(row["email_verified"]) and bool(row["phone_verified"]):
                raise ValueError("User already verified")
            email_expires, email_code, email_sent = self._issue_otp(conn, user_id, "email", "provision_verify")
            phone_expires, phone_code, phone_sent = self._issue_otp(conn, user_id, "phone", "provision_verify")
            self._audit(conn, actor_id, "provision_otp_resent", str(user_id))
        return {
            "user_id": user_id,
            "message": "Nouveaux codes envoyés par email et SMS." if (email_sent or phone_sent) else "",
            "notifications": {"email_otp": email_sent, "sms_otp": phone_sent},
            "verification": {
                "email_expires_at": email_expires,
                "phone_expires_at": phone_expires,
                "dev_email_code": email_code,
                "dev_phone_code": phone_code,
            },
        }

    def list_users(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT
                    id, email, phone, full_name, role, job_profile, department, employee_id,
                    email_verified, phone_verified, is_active, created_at, last_login_at, created_by_admin_id
                FROM users ORDER BY role DESC, full_name
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def create_access_key(self, *, key_label: str, key_type: str, max_uses: int, created_by: int) -> dict[str, Any]:
        if key_type not in {"signup", "admin_login"}:
            raise ValueError("Invalid key type")
        raw_key = f"RAN-{secrets.token_urlsafe(12).upper()}"
        now = _iso(_utcnow())
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO access_keys (key_hash, key_label, key_type, created_by, max_uses, uses_count, is_active, created_at)
                VALUES (?, ?, ?, ?, ?, 0, 1, ?)
                """,
                (_hash_secret(raw_key), key_label.strip(), key_type, created_by, max_uses, now),
            )
            self._audit(conn, created_by, "access_key_created", f"{key_type}:{key_label}")
        return {"access_key": raw_key, "key_label": key_label, "key_type": key_type, "max_uses": max_uses}

    def set_user_active(self, *, user_id: int, is_active: bool, actor_id: int) -> dict[str, Any]:
        with self._connect() as conn:
            conn.execute("UPDATE users SET is_active = ? WHERE id = ? AND role = 'user'", (int(is_active), user_id))
            self._audit(conn, actor_id, "user_status_changed", f"{user_id}:{is_active}")
        user = self.get_user_by_id(user_id)
        if not user:
            raise ValueError("User not found")
        return self.serialize_user(user)

    def job_profiles(self) -> list[dict[str, str]]:
        labels = {
            "ingenieur_ran_nokia": {"fr": "Ingénieur RAN Nokia", "en": "Nokia RAN Engineer"},
            "ingenieur_optimisation_ran": {"fr": "Ingénieur optimisation RAN", "en": "RAN Optimization Engineer"},
            "equipe_maintenance": {"fr": "Équipe maintenance", "en": "Maintenance Team"},
            "responsable_spares": {"fr": "Responsable spares", "en": "Spares Manager"},
            "data_analyst_bi": {"fr": "Data Analyst / BI Engineer", "en": "Data Analyst / BI Engineer"},
            "data_scientist_ia": {"fr": "Data Scientist / IA Engineer", "en": "Data Scientist / AI Engineer"},
            "responsable_reseau_manager": {"fr": "Responsable réseau / Manager", "en": "Network Manager"},
        }
        return [{"id": key, **labels[key]} for key in USER_JOB_PROFILES]


auth_service = AuthService()
