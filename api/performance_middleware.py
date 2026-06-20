from __future__ import annotations

import json
import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from src.services.feature_flags import feature_flags
from src.services.metrics_service import metrics_service

logger = logging.getLogger("ran.api")


class PerformanceMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = (time.perf_counter() - started) * 1000
            metrics_service.record_request(
                method=request.method,
                path=request.url.path,
                status_code=500,
                duration_ms=duration_ms,
                request_id=request_id,
            )
            if feature_flags.structured_logs:
                logger.exception(
                    json.dumps(
                        {
                            "event": "http_request_failed",
                            "request_id": request_id,
                            "method": request.method,
                            "path": request.url.path,
                            "duration_ms": round(duration_ms, 2),
                        }
                    )
                )
            raise

        duration_ms = (time.perf_counter() - started) * 1000
        metrics_service.record_request(
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms,
            request_id=request_id,
        )
        response.headers["X-Request-ID"] = request_id
        if feature_flags.structured_logs and request.url.path not in {"/health", "/ready", "/metrics"}:
            logger.info(
                json.dumps(
                    {
                        "event": "http_request",
                        "request_id": request_id,
                        "method": request.method,
                        "path": request.url.path,
                        "status_code": response.status_code,
                        "duration_ms": round(duration_ms, 2),
                    }
                )
            )
        return response
