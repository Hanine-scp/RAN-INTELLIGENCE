from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from src.services.auth_service import auth_service
from src.services.platform_activity_service import platform_activity_service


class PlatformActivityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        user_id: int | None = None
        auth_header = request.headers.get("authorization", "")
        if auth_header.lower().startswith("bearer "):
            token = auth_header[7:].strip()
            try:
                user = auth_service.get_user_from_access_token(token)
                user_id = user.id
            except ValueError:
                user_id = None
        try:
            platform_activity_service.log_api_request(
                user_id=user_id,
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
            )
        except Exception:
            pass
        return response
