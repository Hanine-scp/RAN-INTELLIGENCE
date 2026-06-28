"""Resolve Bearer tokens from the platform JWT (legacy auth)."""

from __future__ import annotations

from src.services.auth_service import AuthUser, auth_service


def auth_provider() -> str:
    return "legacy"


def resolve_access_token(token: str) -> AuthUser:
    return auth_service.get_user_from_access_token(token)
