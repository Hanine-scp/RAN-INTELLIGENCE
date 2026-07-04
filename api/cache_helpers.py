"""Shared API response cache helpers for heavy DuckDB read paths."""

from __future__ import annotations

import asyncio
import os
from typing import Any, Callable

from src.services.auth_service import AuthUser
from src.services.cache_service import cache_service
from src.services.data_service import FilterContext


def ctx_cache_payload(ctx: FilterContext, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "vendor": ctx.vendor,
        "effective_dates": sorted(ctx.effective_dates or []),
        "selected_dates": sorted(ctx.selected_dates or []),
        "selected_files": sorted(ctx.selected_files or []),
        "selected_sites": sorted(ctx.selected_sites or []),
        "smart": (
            ctx.smart_missing_serial,
            ctx.smart_duplicates,
            ctx.smart_critical_quality,
        ),
        "site_search": (ctx.site_search or "").strip(),
        "period_start": ctx.period_start or "",
        "period_end": ctx.period_end or "",
    }
    if extra:
        payload.update(extra)
    return payload


def cache_ttl(env_name: str, default: int) -> int:
    return int(os.getenv(env_name, str(default)))


async def cached_call(namespace: str, ctx: FilterContext, producer: Callable[[], Any], *, extra: dict[str, Any] | None = None, ttl: int | None = None) -> Any:
    lifetime = ttl if ttl is not None else cache_ttl("CACHE_DEFAULT_TTL_SECONDS", 120)
    key = cache_service.make_key(namespace, ctx_cache_payload(ctx, extra))
    return await asyncio.to_thread(cache_service.get_or_set, key, producer, lifetime)


def invalidate_all_data_cache() -> None:
    cache_service.invalidate_prefix("ran:")
