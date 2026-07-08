"""Resolve Bearer tokens from the platform JWT (legacy auth) and publish the configured auth provider."""

from __future__ import annotations

import os

from src.services.auth_service import AuthUser, auth_service


def auth_provider() -> str:
    return os.getenv("AUTH_PROVIDER", "legacy").strip().lower() or "legacy"


def resolve_access_token(token: str) -> AuthUser:
    return auth_service.get_user_from_access_token(token)
