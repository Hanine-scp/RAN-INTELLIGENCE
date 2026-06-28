#!/usr/bin/env python3
"""Importe et active les workflows n8n corrigés (Docker ran-n8n)."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config.env_loader import load_auth_env

load_auth_env()

CONTAINER = "ran-n8n"
WORKFLOWS_DIR = ROOT / "infra" / "n8n" / "workflows" / "synced"


def _http_node(
    *,
    node_id: str,
    name: str,
    url: str,
    position: list[int],
    json_body: str | None = None,
) -> dict:
    params: dict = {
        "method": "POST",
        "url": url,
        "sendHeaders": True,
        "headerParameters": {
            "parameters": [
                {"name": "Authorization", "value": "=Bearer {{ $env.RAN_API_TOKEN }}"},
                {"name": "Content-Type", "value": "application/json"},
            ]
        },
        "options": {"response": {"response": {"neverError": True}}},
    }
    if json_body is not None:
        params["sendBody"] = True
        params["specifyBody"] = "json"
        params["jsonBody"] = json_body
    return {
        "parameters": params,
        "id": node_id,
        "name": name,
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": position,
    }


def _webhook_node(*, node_id: str, name: str, path: str, webhook_id: str, position: list[int]) -> dict:
    return {
        "parameters": {
            "httpMethod": "POST",
            "path": path,
            "responseMode": "onReceived",
            "options": {},
        },
        "id": node_id,
        "name": name,
        "type": "n8n-nodes-base.webhook",
        "typeVersion": 2,
        "position": position,
        "webhookId": webhook_id,
    }


def build_workflows() -> list[dict]:
    backend = "={{ $env.RAN_BACKEND_URL || 'http://host.docker.internal:8010' }}"
    empty_dates = '{"snapshot_dates": []}'
    overview_body = '{"selected_dates": [], "vendor": "nokia"}'

    def wf(
        wf_id: str,
        name: str,
        path: str,
        webhook_id: str,
        chain: list[dict],
    ) -> dict:
        webhook = _webhook_node(
            node_id=f"wh-{wf_id}",
            name="Webhook",
            path=path,
            webhook_id=webhook_id,
            position=[240, 300],
        )
        nodes = [webhook, *chain]
        connections: dict = {webhook["name"]: {"main": [[{"node": chain[0]["name"], "type": "main", "index": 0}]]}}
        for prev, nxt in zip(chain, chain[1:]):
            connections[prev["name"]] = {"main": [[{"node": nxt["name"], "type": "main", "index": 0}]]}
        return {
            "id": wf_id,
            "name": name,
            "active": True,
            "nodes": nodes,
            "connections": connections,
            "settings": {"executionOrder": "v1"},
        }

    return [
        wf(
            "CuiSO1RRYCJT0m4Y",
            "RAN · Post-Ingestion",
            "ran/post-ingest",
            "480e6a35-59ad-45ed-85c7-a86ac43e3c4c",
            [
                _http_node(
                    node_id="pi-guardian",
                    name="Guardian run",
                    url=f"{backend}/guardian/run",
                    position=[520, 300],
                    json_body=empty_dates,
                ),
                _http_node(
                    node_id="pi-pbi",
                    name="Power BI sync",
                    url=f"{backend}/integrations/powerbi/sync",
                    position=[800, 300],
                ),
            ],
        ),
        wf(
            "eMAKUWF9EG9ZCOXU",
            "RAN · Guardian Engines",
            "ran/guardian-run",
            "fb107a08-7fad-4051-ab34-92c43d1b872f",
            [
                _http_node(
                    node_id="gr-run",
                    name="Guardian run",
                    url=f"{backend}/guardian/run",
                    position=[520, 300],
                    json_body=empty_dates,
                ),
            ],
        ),
        wf(
            "DyWgmcVvq6R9x5oB",
            "RAN · Power BI Sync",
            "ran/powerbi-sync",
            "ran-powerbi-sync",
            [
                _http_node(
                    node_id="pbi-sync",
                    name="Power BI sync",
                    url=f"{backend}/integrations/powerbi/sync",
                    position=[520, 300],
                ),
            ],
        ),
        wf(
            "elWrTvnOtOoZlnHg",
            "RAN · Anomaly Alerting",
            "ran/anomaly-alert",
            "ran-anomaly-alert",
            [
                _http_node(
                    node_id="aa-overview",
                    name="Guardian overview",
                    url=f"{backend}/guardian/overview",
                    position=[520, 300],
                    json_body=overview_body,
                ),
            ],
        ),
    ]


def docker_import(workflow: dict) -> None:
    WORKFLOWS_DIR.mkdir(parents=True, exist_ok=True)
    path = WORKFLOWS_DIR / f"{workflow['id']}.json"
    path.write_text(json.dumps([workflow], indent=2), encoding="utf-8")
    remote = f"/tmp/n8n-{workflow['id']}.json"
    subprocess.run(["docker", "cp", str(path), f"{CONTAINER}:{remote}"], check=True)
    subprocess.run(["docker", "exec", CONTAINER, "n8n", "import:workflow", "-i", remote], check=True)
    subprocess.run(
        ["docker", "exec", CONTAINER, "n8n", "update:workflow", f"--id={workflow['id']}", "--active=true"],
        check=True,
    )


def main() -> int:
    try:
        subprocess.run(["docker", "inspect", CONTAINER], check=True, capture_output=True)
    except subprocess.CalledProcessError:
        print(f"ERROR: conteneur {CONTAINER} introuvable. Lancez docker compose -f docker-compose.n8n.yml up -d")
        return 1

    workflows = build_workflows()
    for wf in workflows:
        print(f"Import {wf['name']} …")
        docker_import(wf)
        print(f"  OK — webhook /webhook/{wf['nodes'][0]['parameters']['path']}")

    print("Redémarrage n8n pour enregistrer les webhooks …")
    subprocess.run(["docker", "restart", CONTAINER], check=True)
    print("\nWorkflows synchronisés et actifs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
