from __future__ import annotations

import hashlib
import json
import os
import time
from typing import Any, Callable


class CacheService:
    """Memory cache with optional Redis backend for hot API paths."""

    def __init__(self) -> None:
        self.enabled = os.getenv("CACHE_ENABLED", "true").lower() in {"1", "true", "yes"}
        self.default_ttl = int(os.getenv("CACHE_DEFAULT_TTL_SECONDS", "120"))
        self._memory: dict[str, tuple[float, Any]] = {}
        self._hits = 0
        self._misses = 0
        self._redis = None
        redis_url = os.getenv("REDIS_URL", "").strip()
        if redis_url:
            try:
                import redis

                self._redis = redis.from_url(redis_url, decode_responses=True)
                self._redis.ping()
            except Exception:
                self._redis = None

    def stats(self) -> dict[str, Any]:
        total = self._hits + self._misses
        return {
            "enabled": self.enabled,
            "backend": "redis" if self._redis else "memory",
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": round(self._hits / total, 4) if total else 0.0,
            "memory_entries": len(self._memory),
        }

    @staticmethod
    def make_key(namespace: str, payload: Any) -> str:
        raw = json.dumps(payload, sort_keys=True, default=str)
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]
        return f"ran:{namespace}:{digest}"

    def get(self, key: str) -> Any | None:
        if not self.enabled:
            return None
        if self._redis is not None:
            try:
                raw = self._redis.get(key)
                if raw is None:
                    self._misses += 1
                    return None
                self._hits += 1
                return json.loads(raw)
            except Exception:
                pass
        entry = self._memory.get(key)
        if entry is None:
            self._misses += 1
            return None
        expires_at, value = entry
        if expires_at < time.time():
            self._memory.pop(key, None)
            self._misses += 1
            return None
        self._hits += 1
        return value

    def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        if not self.enabled:
            return
        lifetime = ttl if ttl is not None else self.default_ttl
        if self._redis is not None:
            try:
                self._redis.setex(key, lifetime, json.dumps(value, default=str))
                return
            except Exception:
                pass
        self._memory[key] = (time.time() + lifetime, value)

    def invalidate_prefix(self, prefix: str) -> None:
        if self._redis is not None:
            try:
                for key in self._redis.scan_iter(match=f"{prefix}*"):
                    self._redis.delete(key)
            except Exception:
                pass
        doomed = [key for key in self._memory if key.startswith(prefix)]
        for key in doomed:
            self._memory.pop(key, None)

    def get_or_set(self, key: str, producer: Callable[[], Any], ttl: int | None = None) -> Any:
        cached = self.get(key)
        if cached is not None:
            return cached
        value = producer()
        self.set(key, value, ttl=ttl)
        return value


cache_service = CacheService()
