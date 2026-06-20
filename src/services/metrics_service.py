from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any


def _percentile(values: list[float], ratio: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = min(len(ordered) - 1, int(ratio * (len(ordered) - 1)))
    return float(ordered[idx])


@dataclass
class RouteStats:
    count: int = 0
    errors: int = 0
    durations_ms: deque[float] = field(default_factory=lambda: deque(maxlen=500))

    def record(self, duration_ms: float, status_code: int) -> None:
        self.count += 1
        if status_code >= 500:
            self.errors += 1
        self.durations_ms.append(duration_ms)


class MetricsService:
    def __init__(self) -> None:
        self.enabled = os.getenv("METRICS_ENABLED", "true").lower() in {"1", "true", "yes"}
        self._global_ms: deque[float] = deque(maxlen=2000)
        self._routes: dict[str, RouteStats] = defaultdict(RouteStats)
        self._started_at = time.time()

    def record_request(
        self,
        *,
        method: str,
        path: str,
        status_code: int,
        duration_ms: float,
        request_id: str,
        user_id: int | None = None,
    ) -> None:
        if not self.enabled:
            return
        route_key = f"{method} {path}"
        self._global_ms.append(duration_ms)
        self._routes[route_key].record(duration_ms, status_code)
        _ = request_id, user_id

    def http_summary(self, *, slow_limit: int = 10) -> dict[str, Any]:
        samples = list(self._global_ms)
        route_rows: list[dict[str, Any]] = []
        for route, stats in self._routes.items():
            durations = list(stats.durations_ms)
            if not durations:
                continue
            route_rows.append(
                {
                    "route": route,
                    "count": stats.count,
                    "errors": stats.errors,
                    "avg_ms": round(sum(durations) / len(durations), 2),
                    "p95_ms": round(_percentile(durations, 0.95), 2),
                    "p99_ms": round(_percentile(durations, 0.99), 2),
                    "max_ms": round(max(durations), 2),
                }
            )
        route_rows.sort(key=lambda row: row["p95_ms"], reverse=True)
        return {
            "uptime_seconds": round(time.time() - self._started_at, 1),
            "samples": len(samples),
            "avg_ms": round(sum(samples) / len(samples), 2) if samples else 0.0,
            "p50_ms": round(_percentile(samples, 0.5), 2),
            "p95_ms": round(_percentile(samples, 0.95), 2),
            "p99_ms": round(_percentile(samples, 0.99), 2),
            "max_ms": round(max(samples), 2) if samples else 0.0,
            "slowest_routes": route_rows[:slow_limit],
        }

    def prometheus_text(self) -> str:
        lines = [
            "# HELP ran_http_requests_total Total HTTP requests",
            "# TYPE ran_http_requests_total counter",
        ]
        for route, stats in sorted(self._routes.items()):
            method, _, path = route.partition(" ")
            safe_path = path.replace('"', '\\"')
            lines.append(f'ran_http_requests_total{{method="{method}",path="{safe_path}"}} {stats.count}')
        lines.extend(
            [
                "# HELP ran_http_request_duration_ms_p95 Route p95 latency in milliseconds",
                "# TYPE ran_http_request_duration_ms_p95 gauge",
            ]
        )
        for route, stats in sorted(self._routes.items()):
            method, _, path = route.partition(" ")
            durations = list(stats.durations_ms)
            p95 = _percentile(durations, 0.95) if durations else 0.0
            safe_path = path.replace('"', '\\"')
            lines.append(f'ran_http_request_duration_ms_p95{{method="{method}",path="{safe_path}"}} {round(p95, 2)}')
        return "\n".join(lines) + "\n"


metrics_service = MetricsService()
