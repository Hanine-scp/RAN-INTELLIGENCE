from __future__ import annotations

import os
from pathlib import Path


def _patch_bcrypt_for_passlib() -> None:
    """passlib 1.7.x expects bcrypt.__about__.__version__ (removed in bcrypt 4.1+)."""
    try:
        import bcrypt

        if not hasattr(bcrypt, "__about__"):
            bcrypt.__about__ = type(  # type: ignore[attr-defined]
                "_About",
                (),
                {"__version__": getattr(bcrypt, "__version__", "4.2.1")},
            )()
    except Exception:
        pass


def _apply_env_aliases() -> None:
    """Map common auth env names to internal keys without overriding explicit values."""
    if not os.getenv("AUTH_JWT_SECRET") and os.getenv("JWT_SECRET"):
        os.environ["AUTH_JWT_SECRET"] = os.getenv("JWT_SECRET", "")
    if not os.getenv("AUTH_ACCESS_TOKEN_MINUTES") and os.getenv("JWT_EXPIRES_IN"):
        os.environ["AUTH_ACCESS_TOKEN_MINUTES"] = os.getenv("JWT_EXPIRES_IN", "")
    if not os.getenv("SMTP_PASSWORD") and os.getenv("SMTP_PASS"):
        os.environ["SMTP_PASSWORD"] = os.getenv("SMTP_PASS", "")
    if not os.getenv("SMTP_PASS") and os.getenv("MAILTRAP_API_TOKEN"):
        os.environ["SMTP_PASS"] = os.getenv("MAILTRAP_API_TOKEN", "")
    if not os.getenv("SMTP_PASSWORD") and os.getenv("MAILTRAP_API_TOKEN"):
        os.environ["SMTP_PASSWORD"] = os.getenv("MAILTRAP_API_TOKEN", "")
    if not os.getenv("SMTP_USER") and os.getenv("MAILTRAP_API_TOKEN"):
        os.environ["SMTP_USER"] = "api"
    if not os.getenv("AUTH_PROVIDER") and os.getenv("OAUTH_PROVIDER"):
        os.environ["AUTH_PROVIDER"] = os.getenv("OAUTH_PROVIDER", "")
    if not os.getenv("GOOGLE_CLIENT_ID") and os.getenv("AUTH_GOOGLE_CLIENT_ID"):
        os.environ["GOOGLE_CLIENT_ID"] = os.getenv("AUTH_GOOGLE_CLIENT_ID", "")
    if not os.getenv("GOOGLE_CLIENT_SECRET") and os.getenv("AUTH_GOOGLE_CLIENT_SECRET"):
        os.environ["GOOGLE_CLIENT_SECRET"] = os.getenv("AUTH_GOOGLE_CLIENT_SECRET", "")
    if not os.getenv("GOOGLE_REDIRECT_URI") and os.getenv("AUTH_GOOGLE_REDIRECT_URI"):
        os.environ["GOOGLE_REDIRECT_URI"] = os.getenv("AUTH_GOOGLE_REDIRECT_URI", "")


def load_auth_env() -> None:
    """Load auth and optional feature environment files.

    The API loads `.env.auth` first, then optional backend files for AI, performance,
    and Power BI features, and finally falls back to `.env` for any remaining values.
    Note: `.env.identity` is not loaded by the API; it is only used by docker/n8n automation.
    """
    _patch_bcrypt_for_passlib()
    root = Path(__file__).resolve().parents[1]
    for name in (".env.auth", ".env.ai", ".env.performance", ".env.powerbi", ".env"):
        path = root / name
        if not path.exists():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
    _apply_env_aliases()
