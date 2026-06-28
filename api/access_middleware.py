"""Enforce RBAC and read-only rules on authenticated API routes."""

from __future__ import annotations

import json
import logging
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from src.services.access_control import (
    READ_ONLY_FORBIDDEN_METHODS,
    USER_WRITE_ALLOWED_PREFIXES,
    access_denied_message,
    match_route_rule,
)
from src.services.auth_service import auth_service
from src.services.auth_token_resolver import resolve_access_token

logger = logging.getLogger(__name__)


def _extract_bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        return None
    token = header[7:].strip()
    return token or None


class AccessControlMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        method = request.method.upper()
        rule = match_route_rule(path, method)
        if rule is None:
            return await call_next(request)

        token = _extract_bearer_token(request)
        if token is None:
            if rule.admin_only or rule.permission:
                return JSONResponse(status_code=401, content={"detail": "Authentication required"})
            return await call_next(request)

        try:
            user = resolve_access_token(token)
        except ValueError:
            return JSONResponse(status_code=401, content={"detail": "Invalid token"})

        request.state.auth_user = user

        if rule.admin_only and user.role != "admin":
            self._log_denied(user.id, path, method, "admin_only")
            return JSONResponse(status_code=403, content={"detail": access_denied_message(read_only=True)})

        if user.role == "responsable" and method in READ_ONLY_FORBIDDEN_METHODS:
            if not any(path.startswith(prefix) for prefix in USER_WRITE_ALLOWED_PREFIXES):
                self._log_denied(user.id, path, method, "read_only_method")
                return JSONResponse(status_code=403, content={"detail": access_denied_message(read_only=True)})

        if rule.permission and rule.permission not in user.permissions:
            self._log_denied(user.id, path, method, rule.permission)
            return JSONResponse(
                status_code=403,
                content={"detail": access_denied_message(permission=rule.permission, read_only=True)},
            )

        return await call_next(request)

    @staticmethod
    def _log_denied(user_id: int, path: str, method: str, reason: str) -> None:
        try:
            with auth_service._connect() as conn:
                auth_service._audit(
                    conn,
                    user_id,
                    "access_denied",
                    json.dumps({"path": path, "method": method, "reason": reason}, ensure_ascii=False),
                )
        except Exception as exc:
            logger.debug("access_denied audit skipped: %s", exc)
