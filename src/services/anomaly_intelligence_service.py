"""Anomaly Intelligence Engine — rules + robust stats + Isolation Forest."""

from __future__ import annotations

import json
import uuid
from typing import Any

import numpy as np
import pandas as pd

from src.services.data_service import FilterContext, data_service, query
from src.services.guardian_database import guardian_connect, init_guardian_schema, utc_now
from src.services.vendor_lake import normalize_snapshot_date, resolve_lake_paths

MODEL_VERSION = "guardian-anomaly-v1"
ROBUST_Z_THRESHOLD = 3.5


def _mad(values: pd.Series) -> float:
    med = float(values.median())
    return float((values - med).abs().median()) or 1.0


class AnomalyIntelligenceService:
    def __init__(self) -> None:
        init_guardian_schema()

    def detect_anomalies(
        self,
        ctx: FilterContext,
        *,
        snapshot_date: str | None = None,
        persist: bool = True,
    ) -> list[dict[str, Any]]:
        dates = sorted(ctx.effective_dates or ctx.selected_dates or [])
        if not dates:
            return []
        target_date = normalize_snapshot_date(snapshot_date or dates[-1])
        vendor = ctx.vendor or "nokia"
        anomalies: list[dict[str, Any]] = []

        rule_ctx = FilterContext(
            selected_dates=ctx.selected_dates,
            selected_files=ctx.selected_files,
            selected_sites=ctx.selected_sites,
            selected_file_dates=ctx.selected_file_dates,
            effective_dates=dates,
            vendor=vendor,
            language=ctx.language,
        )
        rule_alerts = data_service.get_anomaly_alerts(rule_ctx, replacement_threshold=3)
        for row in rule_alerts.get("rows") or []:
            anomalies.append(
                self._build_anomaly(
                    snapshot_date=target_date,
                    vendor=vendor,
                    entity_type=str(row.get("entity_type") or "SITE"),
                    entity_id=str(row.get("site_id") or row.get("object_type") or "network"),
                    parent_site_id=str(row.get("site_id") or "") or None,
                    anomaly_type=str(row.get("alert_type") or "business_rule"),
                    severity=str(row.get("level") or "medium").lower(),
                    anomaly_score=float(row.get("severity_score") or 50),
                    confidence=0.85,
                    detector_name="business_rules",
                    evidence={
                        "rule": row.get("alert_type"),
                        "evidence_text": row.get("evidence"),
                        "metric": row.get("metric"),
                        "value": row.get("value"),
                        "source": "get_anomaly_alerts",
                    },
                )
            )

        anomalies.extend(self._robust_counter_anomalies(target_date, vendor, dates))
        anomalies.extend(self._isolation_forest_anomalies(target_date, vendor, dates))

        if persist:
            self._persist_anomalies(anomalies, target_date, vendor)
        return anomalies

    def _robust_counter_anomalies(self, target_date: str, vendor: str, dates: list[str]) -> list[dict[str, Any]]:
        lake = resolve_lake_paths(vendor)
        history = [normalize_snapshot_date(d) for d in dates if normalize_snapshot_date(d) <= target_date]
        if len(history) < 2:
            return []

        try:
            df = query(
                f"""
                SELECT
                    CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                    AVG(COALESCE(nb_cells, 0)) AS avg_cells,
                    AVG(COALESCE(nb_cells_2g, 0)) AS avg_2g,
                    AVG(COALESCE(nb_cells_3g, 0)) AS avg_3g,
                    AVG(COALESCE(nb_cells_lte_4g, 0)) AS avg_4g,
                    AVG(COALESCE(nb_cells_5g, 0)) AS avg_5g,
                    COUNT(DISTINCT CAST(site_id AS VARCHAR)) AS site_count
                FROM read_parquet('{lake.sites}')
                WHERE CAST(snapshot_date AS VARCHAR) IN ({','.join(['?'] * len(history))})
                GROUP BY snapshot_date
                ORDER BY snapshot_date
                """,
                history,
            )
        except Exception:
            return []

        if df.empty or target_date not in set(df["snapshot_date"].astype(str)):
            return []

        metrics = ["avg_cells", "avg_2g", "avg_3g", "avg_4g", "avg_5g", "site_count"]
        current = df[df["snapshot_date"].astype(str) == target_date].iloc[0]
        hist = df[df["snapshot_date"].astype(str) != target_date]
        results: list[dict[str, Any]] = []

        for metric in metrics:
            series = pd.to_numeric(hist[metric], errors="coerce").dropna()
            if len(series) < 2:
                continue
            median = float(series.median())
            mad = _mad(series)
            value = float(current[metric])
            robust_z = abs(value - median) / mad
            if robust_z < ROBUST_Z_THRESHOLD:
                continue
            results.append(
                self._build_anomaly(
                    snapshot_date=target_date,
                    vendor=vendor,
                    entity_type="NETWORK",
                    entity_id=f"network:{metric}",
                    parent_site_id=None,
                    anomaly_type="counter_drift",
                    severity="high" if robust_z >= 5 else "medium",
                    anomaly_score=round(robust_z * 10, 2),
                    confidence=min(0.99, round(robust_z / 10, 2)),
                    detector_name="robust_z_score",
                    evidence={
                        "counter": metric,
                        "current_value": value,
                        "median_14d": median,
                        "mad": mad,
                        "robust_z": round(robust_z, 2),
                        "threshold": ROBUST_Z_THRESHOLD,
                        "history_points": len(series),
                    },
                )
            )
        return results

    def _isolation_forest_anomalies(self, target_date: str, vendor: str, dates: list[str]) -> list[dict[str, Any]]:
        try:
            from sklearn.ensemble import IsolationForest
            from sklearn.preprocessing import StandardScaler
        except ImportError:
            return []

        lake = resolve_lake_paths(vendor)
        history = [normalize_snapshot_date(d) for d in dates]
        try:
            df = query(
                f"""
                SELECT
                    CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                    COUNT(DISTINCT CAST(site_id AS VARCHAR)) AS site_count,
                    SUM(COALESCE(nb_cells, 0)) AS total_cells,
                    SUM(COALESCE(nb_cells_2g, 0)) AS cells_2g,
                    SUM(COALESCE(nb_cells_3g, 0)) AS cells_3g,
                    SUM(COALESCE(nb_cells_lte_4g, 0)) AS cells_4g,
                    SUM(COALESCE(nb_cells_5g, 0)) AS cells_5g
                FROM read_parquet('{lake.sites}')
                WHERE CAST(snapshot_date AS VARCHAR) IN ({','.join(['?'] * len(history))})
                GROUP BY snapshot_date
                ORDER BY snapshot_date
                """,
                history,
            )
        except Exception:
            return []

        if len(df) < 4 or target_date not in set(df["snapshot_date"].astype(str)):
            return []

        feature_cols = ["site_count", "total_cells", "cells_2g", "cells_3g", "cells_4g", "cells_5g"]
        matrix = df[feature_cols].astype(float).values
        scaler = StandardScaler()
        scaled = scaler.fit_transform(matrix)
        model = IsolationForest(n_estimators=100, contamination=0.15, random_state=42)
        scores = model.fit_predict(scaled)
        df = df.copy()
        df["ml_flag"] = scores
        df["ml_score"] = model.decision_function(scaled)

        row = df[df["snapshot_date"].astype(str) == target_date].iloc[0]
        if int(row["ml_flag"]) != -1:
            return []

        return [
            self._build_anomaly(
                snapshot_date=target_date,
                vendor=vendor,
                entity_type="NETWORK",
                entity_id="network:multivariate",
                parent_site_id=None,
                anomaly_type="multivariate_outlier",
                severity="medium",
                anomaly_score=round(abs(float(row["ml_score"])) * 100, 2),
                confidence=0.75,
                detector_name="isolation_forest",
                evidence={
                    "features": {col: float(row[col]) for col in feature_cols},
                    "ml_score": float(row["ml_score"]),
                    "model": "IsolationForest",
                },
            )
        ]

    def _build_anomaly(
        self,
        *,
        snapshot_date: str,
        vendor: str,
        entity_type: str,
        entity_id: str,
        parent_site_id: str | None,
        anomaly_type: str,
        severity: str,
        anomaly_score: float,
        confidence: float,
        detector_name: str,
        evidence: dict,
    ) -> dict[str, Any]:
        return {
            "anomaly_id": str(uuid.uuid4()),
            "snapshot_date": snapshot_date,
            "vendor": vendor,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "parent_site_id": parent_site_id,
            "anomaly_type": anomaly_type,
            "severity": severity,
            "anomaly_score": anomaly_score,
            "confidence": confidence,
            "detector_name": detector_name,
            "evidence_json": json.dumps(evidence, ensure_ascii=False),
            "created_at": utc_now(),
        }

    def _persist_anomalies(self, anomalies: list[dict[str, Any]], snapshot_date: str, vendor: str) -> None:
        with guardian_connect() as conn:
            conn.execute(
                "DELETE FROM anomalies WHERE snapshot_date = ? AND vendor = ?",
                [snapshot_date, vendor],
            )
            for row in anomalies:
                conn.execute(
                    """
                    INSERT INTO anomalies (
                        anomaly_id, snapshot_date, vendor, entity_type, entity_id, parent_site_id,
                        anomaly_type, severity, anomaly_score, confidence, detector_name,
                        evidence_json, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        row["anomaly_id"],
                        row["snapshot_date"],
                        row["vendor"],
                        row["entity_type"],
                        row["entity_id"],
                        row["parent_site_id"],
                        row["anomaly_type"],
                        row["severity"],
                        row["anomaly_score"],
                        row["confidence"],
                        row["detector_name"],
                        row["evidence_json"],
                        row["created_at"],
                    ],
                )
            conn.commit()

    def get_anomalies(
        self,
        snapshot_date: str | None = None,
        *,
        site_id: str | None = None,
        severity: str | None = None,
        vendor: str = "nokia",
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        clauses = ["vendor = ?"]
        params: list[Any] = [vendor]
        if snapshot_date:
            clauses.append("snapshot_date = ?")
            params.append(normalize_snapshot_date(snapshot_date))
        if site_id:
            clauses.append("parent_site_id = ?")
            params.append(site_id)
        if severity:
            clauses.append("severity = ?")
            params.append(severity.lower())

        with guardian_connect() as conn:
            rows = conn.execute(
                f"""
                SELECT * FROM anomalies
                WHERE {' AND '.join(clauses)}
                ORDER BY
                    CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
                    anomaly_score DESC
                LIMIT ?
                """,
                [*params, limit],
            ).fetchall()

        result = []
        for row in rows:
            item = dict(row)
            try:
                item["evidence"] = json.loads(item.pop("evidence_json") or "{}")
            except json.JSONDecodeError:
                item["evidence"] = {}
            result.append(item)
        return result


anomaly_intelligence_service = AnomalyIntelligenceService()
