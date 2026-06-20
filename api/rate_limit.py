from __future__ import annotations

import os
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from src.services.feature_flags import feature_flags


class RateLimiter:
    def __init__(self) -> None:
        self.enabled = feature_flags.rate_limit_enabled
        self.window_seconds = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
        self.max_requests = int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "30"))
        self._events: dict[str, deque[float]] = defaultdict(deque)

    def _client_key(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        return forwarded or (request.client.host if request.client else "unknown")

    def check(self, request: Request, *, namespace: str = "default", max_requests: int | None = None) -> None:
        if not self.enabled:
            return
        limit = max_requests if max_requests is not None else self.max_requests
        key = f"{namespace}:{self._client_key(request)}"
        now = time.time()
        bucket = self._events[key]
        while bucket and now - bucket[0] > self.window_seconds:
            bucket.popleft()
        if len(bucket) >= limit:
            raise HTTPException(status_code=429, detail="Too many requests. Please retry shortly.")
        bucket.append(now)


rate_limiter = RateLimiter()
