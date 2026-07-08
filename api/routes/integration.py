"""Platform integrations: auth config and n8n automation."""

from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import get_current_user, require_admin
from src.services.auth_service import AuthUser
from src.services.auth_token_resolver import auth_provider
from src.services.n8n_service import n8n_service

router = APIRouter(prefix="/integrations", tags=["integrations"])


def public_signup_enabled() -> bool:
    return os.getenv("AUTH_PUBLIC_SIGNUP", "false").lower() in {"1", "true", "yes"}


def google_oauth_enabled() -> bool:
    return auth_provider() == "google" and bool(os.getenv("GOOGLE_CLIENT_ID")) and bool(os.getenv("GOOGLE_REDIRECT_URI"))


@router.get("/auth/config")
def integration_auth_config() -> dict[str, Any]:
    return {
        "data": {
            "provider": auth_provider(),
            "public_signup": public_signup_enabled(),
            "oauth": {
                "google_enabled": google_oauth_enabled(),
                "google_client_id": os.getenv("GOOGLE_CLIENT_ID", ""),
                "google_redirect_uri": os.getenv("GOOGLE_REDIRECT_URI", ""),
            },
        }
    }


@router.get("/n8n/status")
def n8n_status(_: AuthUser = Depends(get_current_user)) -> dict[str, Any]:
    return {"data": n8n_service.public_config()}


@router.get("/n8n/executions")
async def n8n_executions(_: AuthUser = Depends(require_admin)) -> dict[str, Any]:
    rows = await n8n_service.list_executions()
    return {"data": rows}


@router.post("/n8n/workflows/{workflow_id}/trigger")
async def n8n_trigger_workflow(
    workflow_id: str,
    payload: dict[str, Any] | None = None,
    _: AuthUser = Depends(require_admin),
) -> dict[str, Any]:
    if not n8n_service.enabled:
        raise HTTPException(status_code=503, detail="n8n integration is disabled")
    try:
        result = await n8n_service.trigger_workflow(workflow_id, payload or {})
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"n8n trigger failed: {exc}") from exc
    return {"data": result}
