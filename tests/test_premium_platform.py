from __future__ import annotations

from fastapi.testclient import TestClient

from api.main import app
from src.services.cache_service import cache_service
from src.services.metrics_service import metrics_service


client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert "X-Request-ID" in response.headers


def test_metrics_endpoint():
    response = client.get("/metrics")
    assert response.status_code == 200
    assert "ran_http_requests_total" in response.text


def test_cache_roundtrip():
    cache_service.enabled = True
    cache_service.set("test:key", {"ok": True}, ttl=30)
    assert cache_service.get("test:key") == {"ok": True}


def test_http_metrics_summary():
    metrics_service.record_request(
        method="GET",
        path="/health",
        status_code=200,
        duration_ms=12.5,
        request_id="test-request",
    )
    summary = metrics_service.http_summary()
    assert summary["samples"] >= 1
    assert "p95_ms" in summary
