"""RAN Guardian Copilot — orchestrates all intelligence engines after ingest."""

from __future__ import annotations

from typing import Any

from src.services.anomaly_intelligence_service import anomaly_intelligence_service
from src.services.change_intelligence_service import change_intelligence_service
from src.services.data_service import FilterContext
from src.services.integrity_service import integrity_service
from src.services.predictive_risk_service import predictive_risk_service
from src.services.vendor_lake import normalize_snapshot_date, resolve_lake_paths


class GuardianOrchestrator:
    def run_after_ingest(
        self,
        snapshot_date: str,
        *,
        vendor: str = "nokia",
        file_count: int | None = None,
        parsed_file_count: int | None = None,
    ) -> dict[str, Any]:
        norm_date = normalize_snapshot_date(snapshot_date)
        audit = integrity_service.record_snapshot_audit(
            norm_date,
            vendor=vendor,
            file_count=file_count,
            parsed_file_count=parsed_file_count,
            auto_anchor=True,
        )

        lake = resolve_lake_paths(vendor)
        dates = [normalize_snapshot_date(d) for d in lake.snapshot_dates]
        prev_date = None
        for d in reversed(sorted(dates)):
            if d < norm_date:
                prev_date = d
                break

        change_summary: dict[str, Any] = {}
        if prev_date:
            change_summary = change_intelligence_service.compare_snapshots(prev_date, norm_date, vendor=vendor)

        ctx = FilterContext(
            selected_dates=dates,
            selected_files=[],
            selected_sites=[],
            selected_file_dates=[],
            effective_dates=dates,
            vendor=vendor,
        )
        anomalies = anomaly_intelligence_service.detect_anomalies(ctx, snapshot_date=norm_date, persist=True)
        risks = predictive_risk_service.compute_risk_predictions(ctx, snapshot_date=norm_date, persist=True)

        return {
            "snapshot_date": norm_date,
            "vendor": vendor,
            "integrity": audit,
            "change_engine": change_summary,
            "anomaly_count": len(anomalies),
            "risk_prediction_count": len(risks),
            "top_risks": risks[:10],
            "engines_run": [
                "Data Integrity Engine",
                "Change Intelligence Engine",
                "Anomaly Intelligence Engine",
                "Predictive Risk Engine",
            ],
        }

    def get_guardian_overview(self, ctx: FilterContext) -> dict[str, Any]:
        dates = sorted(ctx.effective_dates or ctx.selected_dates or [])
        vendor = ctx.vendor or "nokia"
        latest = normalize_snapshot_date(dates[-1]) if dates else None

        audits = integrity_service.list_audits(vendor=vendor, limit=10)
        health = integrity_service.get_snapshot_health(latest, vendor=vendor) if latest else {}
        changes = change_intelligence_service.get_change_events(snapshot_date=latest, vendor=vendor, limit=100) if latest else []
        anomalies = anomaly_intelligence_service.get_anomalies(snapshot_date=latest, vendor=vendor, limit=50) if latest else []
        risks = predictive_risk_service.get_risk_predictions(snapshot_date=latest, horizon_days=3, vendor=vendor, limit=20) if latest else []

        return {
            "brand": "Guardian Copilot",
            "suite": "Guardian Nexus AI",
            "tagline": "Ask. Analyze. Decide. Trust.",
            "positioning": (
                "Plateforme de décision NOC où l'IA est placée après la validation, "
                "l'analyse, l'anomalie et la prédiction."
            ),
            "latest_snapshot": latest,
            "integrity": health,
            "recent_audits": audits,
            "change_events_count": len(changes),
            "change_events_sample": changes[:15],
            "anomaly_count": len(anomalies),
            "top_anomalies": anomalies[:10],
            "risk_count": len(risks),
            "top_risks": risks[:10],
            "human_in_the_loop": True,
        }


guardian_orchestrator = GuardianOrchestrator()
