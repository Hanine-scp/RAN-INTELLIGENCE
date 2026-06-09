"""High faulty-rate cards — agrège spares + anomalies."""

from __future__ import annotations

from typing import Any

from src.services.data_service import FilterContext, data_service


class RiskCardsService:
    def get_page(self, ctx: FilterContext) -> dict[str, Any]:
        spares = data_service.get_spares_dimensioning(ctx, horizon_days=90, service_level=0.95)
        anomalies = data_service.get_anomaly_alerts(ctx, replacement_threshold=3)

        rows: list[dict[str, Any]] = []
        for item in spares.get("rows", []):
            criticality = str(item.get("criticality") or "")
            annual_rate = float(item.get("annual_failure_rate_pct") or 0)
            replacements = int(item.get("replacements_period") or 0)
            if criticality != "High" and annual_rate < 10 and replacements < 10:
                continue
            rows.append(
                {
                    "source": "spares",
                    "product_code": item.get("product_code"),
                    "object_type": item.get("object_type"),
                    "site_id": "",
                    "annual_failure_rate_pct": annual_rate,
                    "replacements": replacements,
                    "criticality": criticality,
                    "recommended_spares": item.get("recommended_spares"),
                    "signal": "High faulty rate" if criticality == "High" else "Elevated churn",
                }
            )

        for alert in anomalies.get("rows", []):
            if str(alert.get("anomaly_type")) != "High replacement rate":
                continue
            rows.append(
                {
                    "source": "anomaly",
                    "product_code": "",
                    "object_type": alert.get("object_type"),
                    "site_id": alert.get("site_id"),
                    "annual_failure_rate_pct": 0,
                    "replacements": alert.get("metric_value", alert.get("estimated_replacements")),
                    "criticality": str(alert.get("level") or "High"),
                    "recommended_spares": 0,
                    "signal": alert.get("anomaly_type"),
                }
            )

        rows.sort(key=lambda r: (float(r.get("annual_failure_rate_pct") or 0), int(r.get("replacements") or 0)), reverse=True)

        return {
            "vendor": ctx.vendor,
            "summary": {
                "high_risk_cards": len([r for r in rows if str(r.get("criticality")).lower() == "high"]),
                "total_flagged": len(rows),
                "from_spares": len([r for r in rows if r.get("source") == "spares"]),
                "from_anomalies": len([r for r in rows if r.get("source") == "anomaly"]),
            },
            "rows": rows[:100],
        }


risk_cards_service = RiskCardsService()
