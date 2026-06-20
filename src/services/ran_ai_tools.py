"""Outils contrôlés RAN Intelligence — l'IA ne lit jamais le réseau directement."""

from __future__ import annotations

import json
import re
from typing import Any

from src.services.change_intelligence_service import change_intelligence_service
from src.services.data_service import FilterContext, data_service
from src.services.guardian_database import guardian_connect, utc_now
from src.services.integrity_service import integrity_service
from src.services.anomaly_intelligence_service import anomaly_intelligence_service
from src.services.predictive_risk_service import predictive_risk_service
from src.services.ran_anomaly_rules import build_site_rca, evaluate_ran_rules
from src.services.rag_service import rag_service
from src.services.replacement_analytics_service import replacement_analytics_service
from src.services.risk_cards_service import risk_cards_service
from src.services.timeseries_kpi_service import timeseries_kpi_service

BRAND = "Guardian Copilot"

def _guardian_gate(ctx: FilterContext) -> None:
    dates = sorted(ctx.effective_dates or ctx.selected_dates or [])
    if dates:
        integrity_service.assert_ai_allowed(dates, vendor=ctx.vendor or "nokia")


def _log_ai_audit(user_id: int | None, question: str, tools: list[str], ctx: FilterContext, preview: str) -> None:
    with guardian_connect() as conn:
        conn.execute(
            """
            INSERT INTO ai_audit_log (user_id, question, tools_called, snapshot_dates, confidence, response_preview, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
                user_id,
                question[:2000],
                ",".join(tools),
                ",".join(sorted(ctx.effective_dates or ctx.selected_dates or [])),
                0.85,
                preview[:500],
                utc_now(),
            ],
        )
        conn.commit()


OPENAI_TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_snapshot_health",
            "description": "Santé intégrité snapshot : parsing, complétude, hash, statut VALIDATED.",
            "parameters": {
                "type": "object",
                "properties": {"snapshot_date": {"type": "string"}},
                "required": ["snapshot_date"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "verify_snapshot_integrity",
            "description": "Vérifie hash chaîné et audit d'intégrité pour un snapshot.",
            "parameters": {
                "type": "object",
                "properties": {"snapshot_date": {"type": "string"}},
                "required": ["snapshot_date"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_snapshots",
            "description": "Compare deux snapshots et retourne change_events (sites, cellules, équipements, remplacements).",
            "parameters": {
                "type": "object",
                "properties": {
                    "date_from": {"type": "string"},
                    "date_to": {"type": "string"},
                },
                "required": ["date_from", "date_to"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_guardian_anomalies",
            "description": "Anomalies hybrides persistées (règles + robust z-score + isolation forest) avec evidence.",
            "parameters": {
                "type": "object",
                "properties": {"snapshot_date": {"type": "string"}},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_risk_predictions",
            "description": "Prédictions de risque opérationnel J+1/J+3 par site.",
            "parameters": {
                "type": "object",
                "properties": {
                    "horizon_days": {"type": "integer", "default": 3},
                    "snapshot_date": {"type": "string"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_network_summary",
            "description": "Synthèse réseau globale : snapshots, score qualité, KPI dashboard pour les filtres actifs.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_site_status",
            "description": "État détaillé d'un site (historique snapshots, équipements, technologies, SW).",
            "parameters": {
                "type": "object",
                "properties": {
                    "site_id": {"type": "string", "description": "Identifiant site RAN"},
                    "object_type": {"type": "string", "description": "Filtre optionnel type équipement (RMOD, BBMOD…)"},
                },
                "required": ["site_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_quality_overview",
            "description": "Score qualité réseau, groupes critiques et lignes de complétude.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_anomaly_alerts",
            "description": "Anomalies détectées par moteur de règles (SW, sites disparus, remplacements, qualité).",
            "parameters": {
                "type": "object",
                "properties": {
                    "replacement_threshold": {"type": "integer", "description": "Seuil remplacements estimés", "default": 3},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_delta_analysis",
            "description": "Comparaison delta entre les deux derniers snapshots sélectionnés.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_replacements_top",
            "description": "Top sites/types avec le plus de remplacements de cartes estimés.",
            "parameters": {
                "type": "object",
                "properties": {"limit": {"type": "integer", "default": 10}},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_risk_cards",
            "description": "Cartes à risque — types équipement avec taux faulty élevé.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_prediction_forecast",
            "description": "Prévisions spares / churn équipements sur l'horizon filtré.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_blocked_sites",
            "description": "Liste des sites en état bloqué sur la période filtrée.",
            "parameters": {
                "type": "object",
                "properties": {"region_hint": {"type": "string", "description": "Mot-clé région optionnel (ex: Nord)"}},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_site_rca",
            "description": "RCA structurée pour un site : cause probable, confiance, impact, actions recommandées.",
            "parameters": {
                "type": "object",
                "properties": {"site_id": {"type": "string"}},
                "required": ["site_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_noc_report",
            "description": "Rapport NOC quotidien : disponibilité, anomalies, top dégradés, recommandations.",
            "parameters": {
                "type": "object",
                "properties": {"region_hint": {"type": "string"}},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "evaluate_ran_thresholds",
            "description": "Évalue les seuils KPI RAN (qualité, remplacements, sites bloqués) via moteur de règles.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_kpi_trend",
            "description": "Séries temporelles KPI PM (CSSR, DCR, PRB, disponibilité) pour un site via TimescaleDB.",
            "parameters": {
                "type": "object",
                "properties": {
                    "site_id": {"type": "string"},
                    "days": {"type": "integer", "default": 30},
                    "metrics": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["site_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_vendor_procedures",
            "description": "Recherche RAG dans procédures Nokia/Huawei et guides NOC (pgvector).",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "vendor": {"type": "string", "description": "nokia, huawei ou generic"},
                    "top_k": {"type": "integer", "default": 5},
                },
                "required": ["query"],
            },
        },
    },
]


def _trim_rows(rows: list[dict[str, Any]] | Any, limit: int = 25) -> list[dict[str, Any]]:
    if not isinstance(rows, list):
        return []
    return rows[:limit]


def _context_meta(ctx: FilterContext) -> dict[str, Any]:
    dates = sorted(ctx.effective_dates or ctx.selected_dates or [])
    return {
        "vendor": ctx.vendor or "nokia",
        "language": ctx.language or "Français",
        "snapshots": dates,
        "snapshot_count": len(dates),
        "sites_filtered": len(ctx.selected_sites or []),
        "files_filtered": len(ctx.selected_files or []),
    }


def execute_ran_tool(ctx: FilterContext, tool_name: str, arguments: dict[str, Any] | str | None) -> dict[str, Any]:
    if isinstance(arguments, str):
        try:
            arguments = json.loads(arguments) if arguments.strip() else {}
        except json.JSONDecodeError:
            arguments = {}
    args = arguments or {}

    if tool_name == "get_snapshot_health":
        snapshot_date = str(args.get("snapshot_date") or "").strip()
        dates = sorted(ctx.effective_dates or ctx.selected_dates or [])
        if not snapshot_date and dates:
            snapshot_date = dates[-1]
        if not snapshot_date:
            return {"tool": tool_name, "error": "snapshot_date requis"}
        return {"tool": tool_name, **integrity_service.get_snapshot_health(snapshot_date, vendor=ctx.vendor or "nokia")}

    if tool_name == "verify_snapshot_integrity":
        snapshot_date = str(args.get("snapshot_date") or "").strip()
        dates = sorted(ctx.effective_dates or ctx.selected_dates or [])
        if not snapshot_date and dates:
            snapshot_date = dates[-1]
        if not snapshot_date:
            return {"tool": tool_name, "error": "snapshot_date requis"}
        return {"tool": tool_name, **integrity_service.verify_snapshot_integrity(snapshot_date, vendor=ctx.vendor or "nokia")}

    if tool_name == "compare_snapshots":
        dates = sorted(ctx.effective_dates or ctx.selected_dates or [])
        date_from = str(args.get("date_from") or (dates[-2] if len(dates) >= 2 else "")).strip()
        date_to = str(args.get("date_to") or (dates[-1] if dates else "")).strip()
        if not date_from or not date_to:
            return {"tool": tool_name, "error": "date_from et date_to requis"}
        _guardian_gate(ctx)
        return {"tool": tool_name, **change_intelligence_service.compare_snapshots(date_from, date_to, vendor=ctx.vendor or "nokia")}

    if tool_name == "get_guardian_anomalies":
        _guardian_gate(ctx)
        target = str(args.get("snapshot_date") or "").strip() or None
        rows = anomaly_intelligence_service.detect_anomalies(ctx, snapshot_date=target, persist=True)
        return {"tool": tool_name, "count": len(rows), "rows": _trim_rows(rows, 30)}

    if tool_name == "get_risk_predictions":
        _guardian_gate(ctx)
        horizon = int(args.get("horizon_days") or 3)
        target = str(args.get("snapshot_date") or "").strip() or None
        rows = predictive_risk_service.compute_risk_predictions(ctx, snapshot_date=target, horizons=[horizon], persist=True)
        return {"tool": tool_name, "horizon_days": horizon, "rows": _trim_rows(rows, 25)}

    if tool_name in {
        "get_network_summary",
        "get_site_status",
        "get_quality_overview",
        "get_anomaly_alerts",
        "get_delta_analysis",
        "get_replacements_top",
        "get_risk_cards",
        "get_prediction_forecast",
        "get_blocked_sites",
        "generate_site_rca",
        "generate_noc_report",
        "evaluate_ran_thresholds",
        "get_kpi_trend",
        "search_vendor_procedures",
    }:
        try:
            _guardian_gate(ctx)
        except ValueError as exc:
            return {"tool": tool_name, "error": str(exc), "blocked_by": "Data Integrity Engine"}

    if tool_name == "get_network_summary":
        dash = data_service.get_dashboard(ctx)
        ops = data_service.get_operational_summary(ctx)
        return {"tool": tool_name, "context": _context_meta(ctx), "dashboard": dash, "operational": ops}

    if tool_name == "get_site_status":
        site_id = str(args.get("site_id") or "").strip()
        if not site_id:
            return {"tool": tool_name, "error": "site_id requis"}
        data = data_service.get_site_investigation(ctx, site_id, str(args.get("object_type") or ""))
        history = data.get("site_history") or []
        equipment = data.get("equipment") or []
        latest = history[0] if history else {}
        return {
            "tool": tool_name,
            "site_id": site_id,
            "latest_snapshot": latest,
            "history_rows": _trim_rows(history, 8),
            "equipment_count": len(equipment),
            "equipment_sample": _trim_rows(equipment, 15),
        }

    if tool_name == "get_quality_overview":
        quality = data_service.get_quality_page(ctx)
        return {
            "tool": tool_name,
            "summary": quality.get("summary") or {},
            "rows": _trim_rows(quality.get("rows") or [], 20),
        }

    if tool_name == "get_anomaly_alerts":
        threshold = int(args.get("replacement_threshold") or 3)
        alerts = data_service.get_anomaly_alerts(ctx, replacement_threshold=threshold)
        return {
            "tool": tool_name,
            "summary": alerts.get("summary") or {},
            "rows": _trim_rows(alerts.get("rows") or [], 30),
            "site_summary": _trim_rows(alerts.get("site_summary") or [], 15),
        }

    if tool_name == "get_delta_analysis":
        dates = sorted(ctx.effective_dates or ctx.selected_dates or [])
        if len(dates) < 2:
            return {"tool": tool_name, "error": "Sélectionnez au moins 2 snapshots pour le delta."}
        delta = data_service.get_delta_comparison(ctx, dates[-2], dates[-1])
        changes = change_intelligence_service.get_change_events(snapshot_date=dates[-1], vendor=ctx.vendor or "nokia", limit=30)
        return {
            "tool": tool_name,
            "date_from": dates[-2],
            "date_to": dates[-1],
            "comparison": _trim_rows(delta.get("comparison") or [], 25),
            "details": _trim_rows(delta.get("details") or [], 15),
            "equipment_changes": _trim_rows(delta.get("equipment_changes") or [], 20),
            "change_events": _trim_rows(changes, 20),
        }

    if tool_name == "get_replacements_top":
        limit = max(1, min(50, int(args.get("limit") or 10)))
        data = replacement_analytics_service.get_page(ctx)
        rows = data.get("top_changes") or data.get("by_type_between_periods") or []
        return {"tool": tool_name, "limit": limit, "summary": data.get("summary") or {}, "rows": _trim_rows(rows, limit)}

    if tool_name == "get_risk_cards":
        cards = risk_cards_service.get_page(ctx)
        return {"tool": tool_name, "summary": cards.get("summary") or {}, "rows": _trim_rows(cards.get("rows") or [], 20)}

    if tool_name == "get_prediction_forecast":
        rows = data_service.get_prediction_page(ctx)
        return {"tool": tool_name, "rows": _trim_rows(rows, 15)}

    if tool_name == "get_blocked_sites":
        insight = data_service.get_assistant_insight(ctx, "sites bloqués")
        rows = insight.get("rows") or []
        region = str(args.get("region_hint") or "").strip().lower()
        if region:
            rows = [
                r
                for r in rows
                if region in str(r.get("site_name", "")).lower() or region in str(r.get("site_id", "")).lower()
            ]
        return {"tool": tool_name, "region_hint": region or None, "rows": _trim_rows(rows, 40)}

    if tool_name == "generate_site_rca":
        site_id = str(args.get("site_id") or "").strip()
        if not site_id:
            return {"tool": tool_name, "error": "site_id requis"}
        return {"tool": tool_name, **build_site_rca(ctx, site_id)}

    if tool_name == "generate_noc_report":
        region = str(args.get("region_hint") or "").strip()
        dates = sorted(ctx.effective_dates or ctx.selected_dates or [])
        latest = dates[-1] if dates else None
        rules = evaluate_ran_rules(ctx)
        quality = data_service.get_quality_page(ctx)
        anomalies = data_service.get_anomaly_alerts(ctx)
        guardian_rows = anomaly_intelligence_service.get_anomalies(snapshot_date=latest, vendor=ctx.vendor or "nokia", limit=10) if latest else []
        risks = predictive_risk_service.get_risk_predictions(snapshot_date=latest, horizon_days=3, vendor=ctx.vendor or "nokia", limit=10) if latest else []
        integrity = integrity_service.get_snapshot_health(latest, vendor=ctx.vendor or "nokia") if latest else {}
        replacements = [e for e in change_intelligence_service.get_change_events(snapshot_date=latest, change_type="REPLACED", vendor=ctx.vendor or "nokia", limit=10)] if latest else []
        dash = data_service.get_dashboard(ctx)
        kpis = dash.get("kpis") if isinstance(dash, dict) else {}
        return {
            "tool": tool_name,
            "brand": BRAND,
            "region_hint": region or None,
            "snapshot_integrity": integrity,
            "quality_summary": quality.get("summary") or {},
            "anomaly_summary": anomalies.get("summary") or {},
            "top_anomalies": _trim_rows(anomalies.get("rows") or [], 10),
            "guardian_anomalies": _trim_rows(guardian_rows, 10),
            "top_risks_j3": _trim_rows(risks, 10),
            "replacements_detected": _trim_rows(replacements, 10),
            "dashboard_kpis": kpis if isinstance(kpis, dict) else {},
            "rule_evaluation": rules,
            "recommendations": rules.get("recommendations") or [],
            "human_in_the_loop": "Toute action opérationnelle reste validée par l'ingénieur NOC.",
        }

    if tool_name == "evaluate_ran_thresholds":
        return {"tool": tool_name, **evaluate_ran_rules(ctx)}

    if tool_name == "get_kpi_trend":
        site_id = str(args.get("site_id") or "").strip()
        if not site_id:
            return {"tool": tool_name, "error": "site_id requis"}
        days = int(args.get("days") or 30)
        metrics = args.get("metrics") if isinstance(args.get("metrics"), list) else None
        return {"tool": tool_name, **timeseries_kpi_service.get_site_series(site_id, ctx.vendor or "nokia", metrics, days)}

    if tool_name == "search_vendor_procedures":
        q = str(args.get("query") or "").strip()
        if not q:
            return {"tool": tool_name, "error": "query requis"}
        vendor = str(args.get("vendor") or ctx.vendor or "nokia").strip().lower()
        top_k = int(args.get("top_k") or 5)
        return {"tool": tool_name, **rag_service.search(q, vendor=vendor, top_k=top_k)}

    return {"tool": tool_name, "error": f"Outil inconnu: {tool_name}"}


def extract_site_id_from_question(question: str) -> str | None:
    match = re.search(r"\b([A-Z]{2,4}[-_][A-Z0-9][\w-]{2,})\b", question or "", re.I)
    return match.group(1).upper() if match else None
