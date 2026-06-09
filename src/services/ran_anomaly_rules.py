"""Moteur de règles RAN — détection avant explication IA."""

from __future__ import annotations

from typing import Any

from src.services.data_service import FilterContext, data_service


def evaluate_ran_rules(ctx: FilterContext) -> dict[str, Any]:
    quality = data_service.get_quality_page(ctx)
    summary = quality.get("summary") or {}
    score = float(summary.get("network_quality_score") or 0)
    critical = int(summary.get("critical_groups") or 0)

    anomalies = data_service.get_anomaly_alerts(ctx)
    anom_summary = anomalies.get("summary") or {}

    rules: list[dict[str, Any]] = []

    if score < 75:
        rules.append(
            {
                "rule": "network_quality_critical",
                "label": "Qualité réseau critique",
                "value": score,
                "threshold": 75,
                "severity": "critical",
                "triggered": True,
            }
        )
    elif score < 90:
        rules.append(
            {
                "rule": "network_quality_warning",
                "label": "Qualité réseau en surveillance",
                "value": score,
                "threshold": 90,
                "severity": "high",
                "triggered": True,
            }
        )

    if critical > 0:
        rules.append(
            {
                "rule": "critical_quality_groups",
                "label": "Groupes qualité critiques",
                "value": critical,
                "threshold": 0,
                "severity": "high",
                "triggered": True,
            }
        )

    crit_anom = int(anom_summary.get("critical") or 0)
    if crit_anom > 0:
        rules.append(
            {
                "rule": "critical_anomalies",
                "label": "Anomalies critiques actives",
                "value": crit_anom,
                "threshold": 0,
                "severity": "critical",
                "triggered": True,
            }
        )

    high_anom = int(anom_summary.get("high") or 0)
    if high_anom >= 5:
        rules.append(
            {
                "rule": "high_anomaly_volume",
                "label": "Volume élevé d'anomalies high",
                "value": high_anom,
                "threshold": 5,
                "severity": "high",
                "triggered": True,
            }
        )

    recommendations: list[str] = []
    if score < 90:
        recommendations.append("Auditer la complétude des inventaires sur les sites à score faible.")
    if crit_anom:
        recommendations.append("Traiter en priorité les anomalies classées Critical.")
    if high_anom >= 5:
        recommendations.append("Lancer une revue NOC régionale sur les sites à anomalies high.")
    if not recommendations:
        recommendations.append("Réseau stable sur les filtres actifs — poursuivre la surveillance standard.")

    return {
        "quality_score": score,
        "critical_groups": critical,
        "anomaly_summary": anom_summary,
        "triggered_rules": [r for r in rules if r.get("triggered")],
        "rule_count": len(rules),
        "recommendations": recommendations,
    }


def build_site_rca(ctx: FilterContext, site_id: str) -> dict[str, Any]:
    investigation = data_service.get_site_investigation(ctx, site_id)
    history = investigation.get("site_history") or []
    equipment = investigation.get("equipment") or []
    latest = history[0] if history else {}

    site_state = str(latest.get("site_state") or latest.get("blocking_state") or "").lower()
    vendor = (ctx.vendor or "nokia").capitalize()
    anomalies = data_service.get_anomaly_alerts(ctx)
    site_anomalies = [
        a for a in (anomalies.get("rows") or []) if str(a.get("site_id", "")) == site_id
    ]

    causes: list[dict[str, Any]] = []
    confidence = 45.0

    if site_state in {"blocked", "bloqué"}:
        causes.append({"cause": "Site bloqué / indisponible", "weight": 0.9})
        confidence = 88.0
    if site_anomalies:
        top = site_anomalies[0]
        causes.append(
            {
                "cause": str(top.get("anomaly_type") or "Anomalie détectée"),
                "detail": str(top.get("detail") or ""),
                "weight": 0.75,
            }
        )
        confidence = max(confidence, float(top.get("severity_score") or 70))

    sw_versions = {str(h.get("sw_version") or "") for h in history if h.get("sw_version")}
    if len(sw_versions) > 1:
        causes.append({"cause": "Changement version SW détecté", "detail": ", ".join(sorted(sw_versions)), "weight": 0.6})
        confidence = max(confidence, 72.0)

    empty_serials = sum(1 for e in equipment if not str(e.get("serial_number") or "").strip())
    if empty_serials > 3:
        causes.append({"cause": "Qualité données — serials manquants", "value": empty_serials, "weight": 0.5})
        confidence = max(confidence, 65.0)

    if not causes:
        causes.append({"cause": "Aucune dégradation majeure détectée sur les données lake", "weight": 0.3})
        confidence = 55.0

    primary = max(causes, key=lambda c: c.get("weight", 0))
    impact = "Haut" if confidence >= 80 else "Moyen" if confidence >= 65 else "Faible"

    actions = []
    if site_state in {"blocked", "bloqué"}:
        actions.extend(
            [
                "Vérifier état OSS / alarmes actives sur le site",
                "Contrôler connectivité et alimentation terrain",
                "Escalader NOC si indisponibilité > 30 min",
            ]
        )
    if site_anomalies:
        actions.append(f"Investiguer : {primary.get('cause')}")
    actions.extend(
        [
            "Comparer avec historique interventions / tickets",
            "Valider équipements RF (RRU, feeder, antenne) si dégradation radio suspectée",
        ]
    )

    return {
        "site_id": site_id,
        "vendor": vendor,
        "site_name": latest.get("site_name") or "—",
        "problem": primary.get("cause"),
        "probable_cause": primary.get("cause"),
        "cause_detail": primary.get("detail") or "",
        "confidence_pct": round(min(95.0, confidence), 1),
        "impact": impact,
        "priority": "Haute" if impact == "Haut" else "Moyenne",
        "recommended_actions": actions[:5],
        "anomalies": site_anomalies[:5],
        "latest_snapshot": latest,
        "equipment_count": len(equipment),
    }
