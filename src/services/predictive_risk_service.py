"""Predictive Risk Engine — operational risk J+1 / J+3."""

from __future__ import annotations

import json
import uuid
from typing import Any

import pandas as pd

from src.services.data_service import FilterContext, query
from src.services.guardian_database import guardian_connect, init_guardian_schema, utc_now
from src.services.vendor_lake import normalize_snapshot_date, resolve_lake_paths

MODEL_NAME = "guardian_risk_classifier"
MODEL_VERSION = "v1-logistic-baseline"


def _risk_level(score: float) -> str:
    if score >= 0.75:
        return "CRITICAL"
    if score >= 0.55:
        return "HIGH"
    if score >= 0.35:
        return "MEDIUM"
    return "LOW"


class PredictiveRiskService:
    def __init__(self) -> None:
        init_guardian_schema()

    def compute_risk_predictions(
        self,
        ctx: FilterContext,
        *,
        snapshot_date: str | None = None,
        horizons: list[int] | None = None,
        persist: bool = True,
    ) -> list[dict[str, Any]]:
        dates = sorted(ctx.effective_dates or ctx.selected_dates or [])
        if not dates:
            return []

        target = normalize_snapshot_date(snapshot_date or dates[-1])
        vendor = ctx.vendor or "nokia"
        horizons = horizons or [1, 3]
        predictions: list[dict[str, Any]] = []

        site_features = self._build_site_features(target, vendor, dates)
        for row in site_features:
            base_score = self._heuristic_risk_score(row)
            for horizon in horizons:
                horizon_boost = 0.05 * (horizon - 1)
                score = min(0.99, base_score + horizon_boost)
                risk_type = self._infer_risk_type(row)
                predictions.append(
                    {
                        "prediction_id": str(uuid.uuid4()),
                        "snapshot_date": target,
                        "horizon_days": horizon,
                        "vendor": vendor,
                        "entity_type": "SITE",
                        "entity_id": row["site_id"],
                        "risk_type": risk_type,
                        "risk_score": round(score, 3),
                        "risk_level": _risk_level(score),
                        "top_features_json": json.dumps(
                            {
                                "number_of_changes_1d": row.get("changes_1d", 0),
                                "critical_anomalies_1d": row.get("critical_anomalies", 0),
                                "completeness_rate": row.get("completeness_rate", 0),
                                "completeness_delta": row.get("completeness_delta", 0),
                                "replacement_detected": row.get("replacement_detected", 0),
                                "missing_counter_count": row.get("missing_serials", 0),
                                "counter_drift_score": row.get("counter_drift", 0),
                                "historical_instability_score": row.get("instability", 0),
                            },
                            ensure_ascii=False,
                        ),
                        "model_name": MODEL_NAME,
                        "model_version": MODEL_VERSION,
                        "created_at": utc_now(),
                    }
                )

        network_preds = self._network_level_risks(target, vendor, dates, horizons)
        predictions.extend(network_preds)

        if persist:
            self._persist_predictions(predictions, target, vendor)
        predictions.sort(key=lambda item: item["risk_score"], reverse=True)
        return predictions

    def _build_site_features(self, target_date: str, vendor: str, dates: list[str]) -> list[dict[str, Any]]:
        lake = resolve_lake_paths(vendor)
        norm_dates = [normalize_snapshot_date(d) for d in dates]
        prev_date = None
        for d in reversed(norm_dates):
            if d < target_date:
                prev_date = d
                break

        try:
            sites_df = query(
                f"""
                SELECT
                    CAST(site_id AS VARCHAR) AS site_id,
                    LOWER(CAST(site_state AS VARCHAR)) AS site_state,
                    COALESCE(nb_cells, 0) AS nb_cells
                FROM read_parquet('{lake.sites}')
                WHERE CAST(snapshot_date AS VARCHAR) = ?
                """,
                [target_date],
            )
        except Exception:
            return []

        if sites_df.empty:
            return []

        from src.services.change_intelligence_service import change_intelligence_service
        from src.services.anomaly_intelligence_service import anomaly_intelligence_service

        changes = []
        if prev_date:
            changes = change_intelligence_service.detect_changes(prev_date, target_date, vendor=vendor, persist=False)

        anomalies = anomaly_intelligence_service.get_anomalies(snapshot_date=target_date, vendor=vendor)

        completeness = 100.0
        try:
            comp_df = query(
                f"""
                SELECT AVG(completeness_percent) AS rate
                FROM read_parquet('{lake.completeness}')
                WHERE CAST(snapshot_date AS VARCHAR) = ?
                """,
                [target_date],
            )
            if not comp_df.empty and comp_df.iloc[0]["rate"] is not None:
                completeness = float(comp_df.iloc[0]["rate"])
        except Exception:
            pass

        prev_completeness = completeness
        if prev_date:
            try:
                comp_prev = query(
                    f"""
                    SELECT AVG(completeness_percent) AS rate
                    FROM read_parquet('{lake.completeness}')
                    WHERE CAST(snapshot_date AS VARCHAR) = ?
                    """,
                    [prev_date],
                )
                if not comp_prev.empty and comp_prev.iloc[0]["rate"] is not None:
                    prev_completeness = float(comp_prev.iloc[0]["rate"])
            except Exception:
                pass

        features: list[dict[str, Any]] = []
        for site_id in sites_df["site_id"].astype(str).unique():
            site_changes = [c for c in changes if str(c.get("parent_site_id") or "") == site_id]
            site_anomalies = [a for a in anomalies if str(a.get("parent_site_id") or "") == site_id]
            critical = [a for a in site_anomalies if a.get("severity") in {"high", "critical"}]
            replaced = any(c.get("change_type") == "REPLACED" for c in site_changes)
            state = sites_df[sites_df["site_id"].astype(str) == site_id]["site_state"].iloc[0]
            features.append(
                {
                    "site_id": site_id,
                    "site_state": state,
                    "changes_1d": len(site_changes),
                    "critical_anomalies": len(critical),
                    "completeness_rate": completeness,
                    "completeness_delta": round(completeness - prev_completeness, 2),
                    "replacement_detected": 1 if replaced else 0,
                    "missing_serials": sum(
                        1 for a in site_anomalies if "serial" in str(a.get("anomaly_type", "")).lower()
                    ),
                    "counter_drift": sum(
                        1 for c in site_changes if c.get("entity_type") == "CELL" and c.get("change_type") == "DELETED"
                    ),
                    "instability": 1 if state == "blocked" else 0,
                }
            )
        return features

    def _heuristic_risk_score(self, row: dict[str, Any]) -> float:
        score = 0.1
        score += min(0.25, row.get("changes_1d", 0) * 0.04)
        score += min(0.25, row.get("critical_anomalies", 0) * 0.08)
        if row.get("replacement_detected"):
            score += 0.22
        if row.get("completeness_rate", 100) < 85:
            score += 0.15
        if row.get("completeness_delta", 0) < -10:
            score += 0.12
        score += min(0.15, row.get("counter_drift", 0) * 0.05)
        if row.get("site_state") == "blocked":
            score += 0.18
        return min(0.95, score)

    def _infer_risk_type(self, row: dict[str, Any]) -> str:
        if row.get("replacement_detected"):
            return "post_replacement_risk"
        if row.get("completeness_delta", 0) < -10:
            return "completeness_drop_risk"
        if row.get("counter_drift", 0) > 0:
            return "cell_disappearance_risk"
        if row.get("site_state") == "blocked":
            return "site_instability_risk"
        if row.get("changes_1d", 0) > 5:
            return "mass_change_risk"
        return "operational_drift_risk"

    def _network_level_risks(self, target_date: str, vendor: str, dates: list[str], horizons: list[int]) -> list[dict[str, Any]]:
        from src.services.integrity_service import integrity_service

        health = integrity_service.get_snapshot_health(target_date, vendor=vendor)
        preds = []
        parse_rate = health.get("parse_success_rate", 100)
        if parse_rate < 95:
            for horizon in horizons:
                score = min(0.9, 0.5 + (95 - parse_rate) / 100)
                preds.append(
                    {
                        "prediction_id": str(uuid.uuid4()),
                        "snapshot_date": target_date,
                        "horizon_days": horizon,
                        "vendor": vendor,
                        "entity_type": "NETWORK",
                        "entity_id": "snapshot_integrity",
                        "risk_type": "incomplete_snapshot_risk",
                        "risk_score": round(score, 3),
                        "risk_level": _risk_level(score),
                        "top_features_json": json.dumps(
                            {
                                "parse_success_rate": parse_rate,
                                "completeness_rate": health.get("completeness_rate"),
                                "status": health.get("status"),
                            },
                            ensure_ascii=False,
                        ),
                        "model_name": MODEL_NAME,
                        "model_version": MODEL_VERSION,
                        "created_at": utc_now(),
                    }
                )
        return preds

    def _persist_predictions(self, predictions: list[dict[str, Any]], snapshot_date: str, vendor: str) -> None:
        with guardian_connect() as conn:
            conn.execute(
                "DELETE FROM risk_predictions WHERE snapshot_date = ? AND vendor = ?",
                [snapshot_date, vendor],
            )
            for row in predictions:
                conn.execute(
                    """
                    INSERT INTO risk_predictions (
                        prediction_id, snapshot_date, horizon_days, vendor, entity_type, entity_id,
                        risk_type, risk_score, risk_level, top_features_json, model_name, model_version, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        row["prediction_id"],
                        row["snapshot_date"],
                        row["horizon_days"],
                        row["vendor"],
                        row["entity_type"],
                        row["entity_id"],
                        row["risk_type"],
                        row["risk_score"],
                        row["risk_level"],
                        row["top_features_json"],
                        row["model_name"],
                        row["model_version"],
                        row["created_at"],
                    ],
                )
            conn.commit()

    def get_risk_predictions(
        self,
        snapshot_date: str | None = None,
        *,
        horizon_days: int = 3,
        site_id: str | None = None,
        vendor: str = "nokia",
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        clauses = ["vendor = ?", "horizon_days = ?"]
        params: list[Any] = [vendor, horizon_days]
        if snapshot_date:
            clauses.append("snapshot_date = ?")
            params.append(normalize_snapshot_date(snapshot_date))
        if site_id:
            clauses.append("entity_id = ?")
            params.append(site_id)

        with guardian_connect() as conn:
            rows = conn.execute(
                f"""
                SELECT * FROM risk_predictions
                WHERE {' AND '.join(clauses)}
                ORDER BY risk_score DESC
                LIMIT ?
                """,
                [*params, limit],
            ).fetchall()

        result = []
        for row in rows:
            item = dict(row)
            try:
                item["top_features"] = json.loads(item.pop("top_features_json") or "{}")
            except json.JSONDecodeError:
                item["top_features"] = {}
            result.append(item)
        return result


predictive_risk_service = PredictiveRiskService()
