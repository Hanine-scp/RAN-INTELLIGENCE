from __future__ import annotations

import os
import time

from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)

HEALTH_BUDGET_MS = float(os.getenv("CI_HEALTH_BUDGET_MS", "200"))
READY_BUDGET_MS = float(os.getenv("CI_READY_BUDGET_MS", "500"))
METRICS_BUDGET_MS = float(os.getenv("CI_METRICS_BUDGET_MS", "300"))


def _elapsed_ms(start: float) -> float:
    return (time.perf_counter() - start) * 1000


def test_health_latency_budget():
    start = time.perf_counter()
    response = client.get("/health")
    elapsed = _elapsed_ms(start)
    assert response.status_code == 200
    assert elapsed <= HEALTH_BUDGET_MS, f"/health took {elapsed:.1f}ms (budget {HEALTH_BUDGET_MS}ms)"


def test_ready_latency_budget():
    start = time.perf_counter()
    response = client.get("/ready")
    elapsed = _elapsed_ms(start)
    assert response.status_code == 200
    assert elapsed <= READY_BUDGET_MS, f"/ready took {elapsed:.1f}ms (budget {READY_BUDGET_MS}ms)"


def test_metrics_latency_budget():
    start = time.perf_counter()
    response = client.get("/metrics")
    elapsed = _elapsed_ms(start)
    assert response.status_code == 200
    assert elapsed <= METRICS_BUDGET_MS, f"/metrics took {elapsed:.1f}ms (budget {METRICS_BUDGET_MS}ms)"
