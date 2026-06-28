"""n8n workflow orchestration — replaces Guardian UI triggers with automation webhooks."""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

import httpx

logger = logging.getLogger(__name__)

WORKFLOW_CATALOG: tuple[dict[str, str], ...] = (
    {
        "id": "post-ingest",
        "name": "Post-ingestion RAN",
        "description": "Integrity check, change detection, anomaly scan, Power BI sync",
        "webhook_env": "N8N_WEBHOOK_POST_INGEST",
        "icon": "ingest",
    },
    {
        "id": "guardian-run",
        "name": "Guardian engines",
        "description": "Run integrity, changes, anomalies and risk engines via API",
        "webhook_env": "N8N_WEBHOOK_GUARDIAN_RUN",
        "icon": "shield",
    },
    {
        "id": "powerbi-sync",
        "name": "Power BI export",
        "description": "Refresh CSV exports and premium datasets",
        "webhook_env": "N8N_WEBHOOK_POWERBI_SYNC",
        "icon": "chart",
    },
    {
        "id": "anomaly-alert",
        "name": "Anomaly alerting",
        "description": "Notify NOC when anomaly thresholds are exceeded",
        "webhook_env": "N8N_WEBHOOK_ANOMALY_ALERT",
        "icon": "alert",
    },
    {
        "id": "signup-access",
        "name": "Signup access approval",
        "description": "Notify admin on access requests and users on approve/reject",
        "webhook_env": "N8N_WEBHOOK_SIGNUP_ACCESS",
        "icon": "user",
    },
)


class N8nService:
    def __init__(self) -> None:
        self.base_url = os.getenv("N8N_BASE_URL", "http://localhost:5678").rstrip("/")
        self.api_key = os.getenv("N8N_API_KEY", "").strip()
        self.embed_url = os.getenv("N8N_EMBED_URL", self.base_url).strip()
        self.timeout = float(os.getenv("N8N_HTTP_TIMEOUT", "30"))

    @property
    def enabled(self) -> bool:
        return os.getenv("N8N_ENABLED", "false").lower() in {"1", "true", "yes"}

    def public_config(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "baseUrl": self.base_url,
            "embedUrl": self.embed_url,
            "workflows": [
                {
                    "id": item["id"],
                    "name": item["name"],
                    "description": item["description"],
                    "icon": item["icon"],
                    "configured": bool(os.getenv(item["webhook_env"], "").strip()),
                }
                for item in WORKFLOW_CATALOG
            ],
        }

    def _webhook_url(self, webhook_env: str) -> str | None:
        url = os.getenv(webhook_env, "").strip()
        return url or None

    async def trigger_webhook(self, webhook_env: str, payload: dict[str, Any]) -> dict[str, Any]:
        url = self._webhook_url(webhook_env)
        if not url:
            raise ValueError(f"Webhook not configured ({webhook_env})")
        body = {
            **payload,
            "triggered_at": datetime.now(timezone.utc).isoformat(),
            "source": "ran-intelligence",
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(url, json=body)
            response.raise_for_status()
            try:
                data = response.json()
            except json.JSONDecodeError:
                data = {"status": "ok", "raw": response.text[:500]}
        return {"webhook": webhook_env, "status": "triggered", "response": data}

    async def trigger_workflow(self, workflow_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        catalog = {item["id"]: item for item in WORKFLOW_CATALOG}
        item = catalog.get(workflow_id)
        if not item:
            raise ValueError(f"Unknown workflow: {workflow_id}")
        return await self.trigger_webhook(item["webhook_env"], payload)

    async def trigger_post_ingest(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.trigger_webhook("N8N_WEBHOOK_POST_INGEST", payload)

    async def list_executions(self, limit: int = 10) -> list[dict[str, Any]]:
        if not self.api_key:
            return []
        headers = {"X-N8N-API-KEY": self.api_key}
        url = f"{self.base_url}/api/v1/executions"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(url, headers=headers, params={"limit": limit})
                response.raise_for_status()
                data = response.json()
        except Exception as exc:
            logger.warning("n8n executions fetch failed: %s", exc)
            return []
        rows = data.get("data") if isinstance(data, dict) else data
        if not isinstance(rows, list):
            return []
        return rows[:limit]

    def trigger_post_ingest_sync(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        if not self.enabled:
            return None
        url = self._webhook_url("N8N_WEBHOOK_POST_INGEST")
        if not url:
            return None
        body = {**payload, "triggered_at": datetime.now(timezone.utc).isoformat(), "source": "ran-intelligence"}
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(url, json=body)
                response.raise_for_status()
                try:
                    return response.json()
                except json.JSONDecodeError:
                    return {"status": "ok"}
        except Exception as exc:
            logger.warning("n8n post-ingest webhook failed: %s", exc)
            return {"error": str(exc)}

    def trigger_signup_access_sync(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        if not self.enabled:
            return None
        url = self._webhook_url("N8N_WEBHOOK_SIGNUP_ACCESS")
        if not url:
            return None
        body = {**payload, "triggered_at": datetime.now(timezone.utc).isoformat(), "source": "ran-intelligence"}
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(url, json=body)
                response.raise_for_status()
                try:
                    return response.json()
                except json.JSONDecodeError:
                    return {"status": "ok"}
        except Exception as exc:
            logger.warning("n8n signup-access webhook failed: %s", exc)
            return {"error": str(exc)}


n8n_service = N8nService()
