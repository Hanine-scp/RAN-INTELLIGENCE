"""Build reorganized Power BI decision datasets (star schema + intelligence layer)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pandas as pd

from src.services.anomaly_intelligence_service import anomaly_intelligence_service
from src.services.change_intelligence_service import change_intelligence_service
from src.services.data_service import FilterContext, data_service
from src.services.predictive_risk_service import predictive_risk_service
from src.services.powerbi_layout import (
    DIMENSIONS_DIR,
    FACTS_DIR,
    MODEL_DIR,
    STAGING_DIR,
    ensure_folders,
    records_to_frame,
    remove_legacy_fact_files,
    write_csv,
    write_json,
)
from src.services.powerbi_premium_builder import (
    METRIC_CATALOG,
    MIN_SITES_PER_SNAPSHOT,
    STATUS_COLORS,
    _build_dim_date,
    _build_dim_period,
    _build_fact_delta_kpi,
    _build_fact_equipment_by_type,
    _build_fact_snapshot_kpi,
    _build_fact_technology,
    _load_csv,
    _valid_snapshot_dates,
)

SEVERITY_DIM = [
    {"severity": "critical", "severity_label": "Critique", "sort_order": 1, "color": "#DC2626"},
    {"severity": "high", "severity_label": "Élevée", "sort_order": 2, "color": "#EA580C"},
    {"severity": "medium", "severity_label": "Moyenne", "sort_order": 3, "color": "#D97706"},
    {"severity": "low", "severity_label": "Faible", "sort_order": 4, "color": "#059669"},
]

TECHNOLOGY_DIM = [
    {"technology": "2G", "technology_group": "legacy", "sort_order": 10},
    {"technology": "3G", "technology_group": "legacy", "sort_order": 20},
    {"technology": "4G", "technology_group": "lte", "sort_order": 30},
    {"technology": "4G FDD", "technology_group": "lte", "sort_order": 40},
    {"technology": "4G TDD", "technology_group": "lte", "sort_order": 50},
    {"technology": "5G", "technology_group": "nr", "sort_order": 60},
]

OBJECT_TYPE_ORDER = {
    "CABINET": 10,
    "BBMOD": 20,
    "RMOD": 30,
    "SMOD": 40,
    "RETU": 90,
    "ALD": 91,
    "ANTL": 92,
}

KPI_COLUMNS = [
    "kpi_scope",
    "snapshot_date",
    "period_key",
    "date_ref",
    "date_cmp",
    "metric_group",
    "metric_name",
    "metric_label",
    "value",
    "value_ref",
    "value_cmp",
    "delta",
    "impact_abs",
    "status",
    "status_color",
]

SIGNAL_COLUMNS = [
    "signal_type",
    "snapshot_date",
    "period_key",
    "site_id",
    "site_name",
    "object_type",
    "entity_id",
    "severity",
    "signal_label",
    "detail",
    "score",
    "metric_value",
    "source_engine",
    "evidence",
    # Intelligence fields
    "qualite",
    "anomalie",
    "risque",
    "prediction",
]


def _empty_kpi() -> pd.DataFrame:
    return pd.DataFrame(columns=KPI_COLUMNS)


def _empty_signals() -> pd.DataFrame:
    return pd.DataFrame(columns=SIGNAL_COLUMNS)


def _align_kpi(rows: list[dict[str, Any]]) -> pd.DataFrame:
    if not rows:
        return _empty_kpi()
    frame = pd.DataFrame(rows)
    for col in KPI_COLUMNS:
        if col not in frame.columns:
            frame[col] = ""
    return frame[KPI_COLUMNS]


def _align_signals(rows: list[dict[str, Any]]) -> pd.DataFrame:
    if not rows:
        return _empty_signals()
    frame = pd.DataFrame(rows)
    for col in SIGNAL_COLUMNS:
        if col not in frame.columns:
            frame[col] = ""
    return frame[SIGNAL_COLUMNS]


def _build_dim_site(export_dir, latest_date: str) -> pd.DataFrame:
    site_status = _load_csv(export_dir / "raw", "site_status.csv")
    if site_status.empty:
        return pd.DataFrame()
    frame = site_status[site_status["snapshot_date"].astype(str) == latest_date].copy()
    if frame.empty:
        frame = site_status.sort_values("snapshot_date").groupby("site_id", as_index=False).last()
    keep = [
        "site_id",
        "site_name",
        "site_state",
        "blocking_state",
        "ip_address",
        "sw_version",
        "nb_cells",
        "technologies",
    ]
    cols = [c for c in keep if c in frame.columns]
    out = frame[cols].drop_duplicates(subset=["site_id"])
    out["snapshot_date"] = latest_date
    out["is_active"] = out.get("site_state", "").astype(str).str.lower().eq("active")
    return out.sort_values("site_id")


def _build_dim_object_type(export_dir, valid_dates: list[str]) -> pd.DataFrame:
    counter = _load_csv(export_dir / "raw", "equipment_class_counter.csv")
    if counter.empty:
        return pd.DataFrame()
    frame = counter[counter["snapshot_date"].astype(str).isin(valid_dates)].copy()
    types = sorted(frame["object_type"].dropna().astype(str).unique().tolist())
    return pd.DataFrame(
        [
            {"object_type": obj, "object_type_label": obj, "sort_order": OBJECT_TYPE_ORDER.get(obj, 50)}
            for obj in types
        ]
    )


def _build_dim_anomaly_type(anomaly_rows: list[dict[str, Any]]) -> pd.DataFrame:
    types = sorted({str(row.get("anomaly_type", "") or row.get("signal_label", "")) for row in anomaly_rows if row.get("anomaly_type") or row.get("signal_label")})
    return pd.DataFrame(
        [{"anomaly_type": value, "anomaly_type_label": value, "sort_order": index + 1} for index, value in enumerate(types)]
    )


def _snapshot_to_kpi_rows(snapshot_kpi: pd.DataFrame) -> list[dict[str, Any]]:
    """Extract all KPI metrics from snapshot data, mapping to METRIC_CATALOG."""
    if snapshot_kpi.empty:
        return []
    
    # Map METRIC_CATALOG metrics to available columns in snapshot_kpi
    metric_mappings = {
        "total_sites": ("nb_sites", "Total sites", "sites"),
        "active_sites": ("nb_active_sites", "Sites actifs", "sites"),
        "blocked_sites": ("nb_blocked_sites", "Sites bloqués", "sites"),
        "total_equipment": ("nb_equipment", "Total équipements", "equipment"),
        "cells_2g": ("nb_cells_2g", "Cellules 2G", "cells"),
        "cells_3g": ("nb_cells_3g", "Cellules 3G", "cells"),
        "cells_4g": ("nb_cells_4g", "Cellules 4G", "cells"),
        "cells_4g_fdd": ("nb_cells_4g_fdd", "Cellules 4G FDD", "cells"),
        "cells_4g_tdd": ("nb_cells_4g_tdd", "Cellules 4G TDD", "cells"),
        "cells_5g": ("nb_cells_5g", "Cellules 5G", "cells"),
        "unique_serials": ("nb_unique_serials", "Serials uniques", "equipment"),
        "missing_serials": ("nb_missing_serials", "Serials manquants", "equipment"),
    }
    
    rows: list[dict[str, Any]] = []
    for _, record in snapshot_kpi.iterrows():
        snapshot_date = str(record.get("snapshot_date", ""))
        
        # Add all defined metrics where data exists
        for metric_name, (col_name, label, group) in metric_mappings.items():
            if col_name in record.index:
                value = record.get(col_name, "")
                if pd.notna(value) and value != "":
                    rows.append({
                        "kpi_scope": "snapshot",
                        "snapshot_date": snapshot_date,
                        "metric_group": group,
                        "metric_name": metric_name,
                        "metric_label": label,
                        "value": value,
                    })
        
        # Add calculated metrics (if base metrics exist)
        if "nb_sites" in record.index and "nb_active_sites" in record.index:
            nb_sites = record.get("nb_sites", 0)
            if nb_sites and pd.notna(nb_sites):
                nb_sites = int(nb_sites)
                rows.append({
                    "kpi_scope": "snapshot",
                    "snapshot_date": snapshot_date,
                    "metric_group": "kpi",
                    "metric_name": "availability_pct",
                    "metric_label": "Disponibilité %",
                    "value": round(100 * int(record.get("nb_active_sites", 0)) / nb_sites, 2) if nb_sites else 0,
                })
                
                if "nb_equipment" in record.index:
                    nb_equipment = record.get("nb_equipment", 0)
                    if pd.notna(nb_equipment):
                        rows.append({
                            "kpi_scope": "snapshot",
                            "snapshot_date": snapshot_date,
                            "metric_group": "kpi",
                            "metric_name": "equipment_per_site",
                            "metric_label": "Équipements / site",
                            "value": round(int(nb_equipment) / nb_sites, 1) if nb_sites else 0,
                        })
    
    return rows


def _delta_to_kpi_rows(delta_kpi: pd.DataFrame) -> list[dict[str, Any]]:
    if delta_kpi.empty:
        return []
    rows: list[dict[str, Any]] = []
    for _, record in delta_kpi.iterrows():
        rows.append(
            {
                "kpi_scope": "delta",
                "period_key": record.get("period_key", ""),
                "date_ref": record.get("date_ref", ""),
                "date_cmp": record.get("date_cmp", ""),
                "metric_group": record.get("metric_group", ""),
                "metric_name": record.get("metric", ""),
                "metric_label": record.get("metric_label", ""),
                "value": record.get("value_cmp", ""),
                "value_ref": record.get("value_ref", ""),
                "value_cmp": record.get("value_cmp", ""),
                "delta": record.get("delta", ""),
                "impact_abs": record.get("impact_abs", ""),
                "status": record.get("status", ""),
                "status_color": record.get("status_color", ""),
            }
        )
    return rows


def _technology_to_kpi_rows(technology: pd.DataFrame) -> list[dict[str, Any]]:
    if technology.empty:
        return []
    rows: list[dict[str, Any]] = []
    for _, record in technology.iterrows():
        rows.append(
            {
                "kpi_scope": "technology",
                "snapshot_date": record.get("snapshot_date", ""),
                "metric_group": "cells",
                "metric_name": record.get("technology", ""),
                "metric_label": record.get("technology", ""),
                "value": record.get("cell_count", ""),
            }
        )
    return rows


def _equipment_to_kpi_rows(equipment: pd.DataFrame) -> list[dict[str, Any]]:
    if equipment.empty:
        return []
    rows: list[dict[str, Any]] = []
    for _, record in equipment.iterrows():
        rows.append(
            {
                "kpi_scope": "equipment",
                "snapshot_date": record.get("snapshot_date", ""),
                "metric_group": "equipment",
                "metric_name": record.get("object_type", ""),
                "metric_label": record.get("object_type", ""),
                "value": record.get("equipment_count", ""),
            }
        )
    return rows


def _executive_to_kpi_rows(ctx: FilterContext) -> list[dict[str, Any]]:
    dashboard = data_service.get_dashboard(ctx)
    kpis = dashboard.get("kpis", {})
    period = dashboard.get("period", {})
    if not kpis:
        return []
    rows: list[dict[str, Any]] = []
    snapshot_date = str(period.get("latest_date", ""))
    for name, value in kpis.items():
        rows.append(
            {
                "kpi_scope": "executive",
                "snapshot_date": snapshot_date,
                "metric_group": "executive",
                "metric_name": name,
                "metric_label": name.replace("_", " ").title(),
                "value": value,
            }
        )
    rows.append(
        {
            "kpi_scope": "executive",
            "snapshot_date": snapshot_date,
            "metric_group": "executive",
            "metric_name": "snapshot_count",
            "metric_label": "Nombre de snapshots",
            "value": period.get("snapshot_count", 0),
        }
    )
    return rows


def _spares_to_kpi_rows(predictions: pd.DataFrame) -> list[dict[str, Any]]:
    if predictions.empty:
        return []
    rows: list[dict[str, Any]] = []
    for _, record in predictions.iterrows():
        snapshot_date = str(record.get("snapshot_date", ""))
        object_type = str(record.get("object_type", ""))
        for name, label in (
            ("forecast_changes_30d", "Changements prévus 30j"),
            ("forecast_changes_90d", "Changements prévus 90j"),
            ("estimated_spares_30d", "Spares estimés 30j"),
            ("daily_churn_rate", "Taux churn journalier"),
            ("risk_score", "Score risque"),
        ):
            if name not in record.index:
                continue
            rows.append(
                {
                    "kpi_scope": "spares",
                    "snapshot_date": snapshot_date,
                    "metric_group": "prediction",
                    "metric_name": f"{object_type}_{name}" if object_type else name,
                    "metric_label": f"{object_type} — {label}" if object_type else label,
                    "value": record.get(name, ""),
                }
            )
    return rows


def _prediction_to_signal_rows(prediction_frame: pd.DataFrame) -> list[dict[str, Any]]:
    """Convert prediction/forecast data to signal rows for BI consumption."""
    if prediction_frame.empty:
        return []
    rows: list[dict[str, Any]] = []
    for _, record in prediction_frame.iterrows():
        rows.append(
            {
                "signal_type": "prediction",
                "snapshot_date": record.get("snapshot_date", ""),
                "site_id": record.get("site_id", ""),
                "entity_id": record.get("entity_id", ""),
                "object_type": record.get("object_type", ""),
                "severity": "",
                "signal_label": record.get("forecast_type", "") or record.get("prediction_type", "") or "forecast",
                "detail": record.get("forecast_summary", "") or record.get("prediction_summary", ""),
                "score": record.get("confidence_score", record.get("forecast_confidence", "")),
                "metric_value": record.get("predicted_value", ""),
                "source_engine": "predictive_service",
                "evidence": record.get("evidence", ""),
                "qualite": "",
                "anomalie": "",
                "risque": "",
                "prediction": record.get("confidence_score", record.get("forecast_confidence", "")),  # Prediction confidence
            }
        )
    return rows


def _quality_to_signal_rows(quality_frame: pd.DataFrame) -> list[dict[str, Any]]:
    if quality_frame.empty:
        return []
    rows: list[dict[str, Any]] = []
    for _, record in quality_frame.iterrows():
        rows.append(
            {
                "signal_type": "quality",
                "snapshot_date": record.get("snapshot_date", ""),
                "site_id": record.get("site_id", ""),
                "object_type": record.get("object_type", ""),
                "severity": record.get("severity", ""),
                "signal_label": "data_quality",
                "detail": f"completeness={record.get('completeness_percent', '')}%",
                "score": record.get("risk_score", record.get("completeness_percent", "")),
                "metric_value": record.get("records", ""),
                "qualite": record.get("completeness_percent", ""),  # Quality score
                "anomalie": "",
                "risque": record.get("risk_score", ""),
                "prediction": "",
            }
        )
    return rows


def _anomaly_to_signal_rows(anomaly_frame: pd.DataFrame) -> list[dict[str, Any]]:
    if anomaly_frame.empty:
        return []
    rows: list[dict[str, Any]] = []
    for _, record in anomaly_frame.iterrows():
        rows.append(
            {
                "signal_type": "anomaly",
                "snapshot_date": record.get("snapshot_date", ""),
                "site_id": record.get("site_id", "") or record.get("parent_site_id", ""),
                "site_name": record.get("site_name", ""),
                "severity": record.get("severity", record.get("level", "")),
                "signal_label": record.get("anomaly_type", ""),
                "detail": record.get("detail", record.get("description", "")),
                "score": record.get("severity_score", record.get("anomaly_score", "")),
                "metric_value": record.get("metric_value", ""),
                "source_engine": record.get("source_engine", ""),
                "evidence": record.get("evidence", ""),
                "qualite": "",
                "anomalie": record.get("anomaly_score", record.get("severity_score", "")),  # Anomaly detection score
                "risque": "",
                "prediction": "",
            }
        )
    return rows


def _risk_to_signal_rows(risk_frame: pd.DataFrame) -> list[dict[str, Any]]:
    if risk_frame.empty:
        return []
    rows: list[dict[str, Any]] = []
    for _, record in risk_frame.iterrows():
        rows.append(
            {
                "signal_type": "risk",
                "snapshot_date": record.get("snapshot_date", ""),
                "site_id": record.get("entity_id", ""),
                "entity_id": record.get("entity_id", ""),
                "severity": record.get("severity", ""),
                "signal_label": record.get("risk_type", ""),
                "detail": record.get("summary", record.get("description", "")),
                "score": record.get("risk_score", ""),
                "source_engine": "guardian",
                "qualite": "",
                "anomalie": "",
                "risque": record.get("risk_score", ""),  # Risk prediction score
                "prediction": "",
            }
        )
    return rows


def _change_to_signal_rows(change_frame: pd.DataFrame, signal_type: str) -> list[dict[str, Any]]:
    if change_frame.empty:
        return []
    rows: list[dict[str, Any]] = []
    for _, record in change_frame.iterrows():
        rows.append(
            {
                "signal_type": signal_type,
                "snapshot_date": record.get("snapshot_date", record.get("date_cmp", "")),
                "period_key": record.get("period_key", ""),
                "site_id": record.get("site_id", "") or record.get("parent_site_id", ""),
                "site_name": record.get("site_name", ""),
                "object_type": record.get("object_type", "") or record.get("entity_type", ""),
                "entity_id": record.get("equipment_id", "") or record.get("entity_id", ""),
                "severity": record.get("severity", ""),
                "signal_label": record.get("change_type", "") or record.get("change_type_label", ""),
                "detail": record.get("product_name", "") or record.get("detail", ""),
                "score": record.get("replacement_score", ""),
                "metric_value": record.get("nb_equipment", ""),
                "source_engine": record.get("source_engine", "guardian" if signal_type == "guardian_change" else "platform"),
                "evidence": record.get("evidence", ""),
                "qualite": "",
                "anomalie": "",
                "risque": "",
                "prediction": record.get("replacement_score", "") if "replacement" in signal_type.lower() else "",
            }
        )
    return rows


def _collect_intelligence(ctx: FilterContext, latest_date: str) -> dict[str, pd.DataFrame]:
    quality = data_service.get_quality_page(ctx)
    anomalies = data_service.get_anomaly_alerts(ctx)
    predictions = data_service.get_prediction_page(ctx)

    guardian_anomalies = anomaly_intelligence_service.get_anomalies(snapshot_date=latest_date, vendor=ctx.vendor, limit=500)
    guardian_risks = predictive_risk_service.get_risk_predictions(
        snapshot_date=latest_date, horizon_days=3, vendor=ctx.vendor, limit=500
    )
    guardian_changes = change_intelligence_service.get_change_events(
        snapshot_date=latest_date, vendor=ctx.vendor, limit=1000
    )

    quality_frame = records_to_frame(quality.get("rows", []))
    if not quality_frame.empty:
        quality_frame["snapshot_date"] = latest_date

    anomaly_frame = records_to_frame(anomalies.get("rows", []))
    if not anomaly_frame.empty:
        anomaly_frame["snapshot_date"] = latest_date
        if "level" in anomaly_frame.columns:
            anomaly_frame["severity"] = anomaly_frame["level"].astype(str).str.lower()

    if guardian_anomalies:
        guardian_df = records_to_frame(guardian_anomalies)
        guardian_df["source_engine"] = "guardian"
        if not anomaly_frame.empty:
            anomaly_frame["source_engine"] = "platform_rules"
            anomaly_frame = pd.concat([anomaly_frame, guardian_df], ignore_index=True, sort=False)
        else:
            anomaly_frame = guardian_df

    prediction_frame = records_to_frame(predictions)
    if not prediction_frame.empty:
        prediction_frame["snapshot_date"] = latest_date

    risk_frame = records_to_frame(guardian_risks)
    if not risk_frame.empty:
        risk_frame["snapshot_date"] = latest_date
        if "severity" in risk_frame.columns:
            risk_frame["severity"] = risk_frame["severity"].astype(str).str.lower()

    change_frame = records_to_frame(guardian_changes)
    if not change_frame.empty:
        change_frame["snapshot_date"] = latest_date

    return {
        "quality": quality_frame,
        "anomaly": anomaly_frame,
        "prediction": prediction_frame,
        "risk": risk_frame,
        "guardian_change": change_frame,
    }


def _build_fact_kpi(
    *,
    summary: pd.DataFrame,
    valid_dates: list[str],
    export_dir,
    ctx: FilterContext,
    comparison: pd.DataFrame,
) -> pd.DataFrame:
    snapshot_kpi = _build_fact_snapshot_kpi(summary, valid_dates)
    delta_kpi = _build_fact_delta_kpi(comparison, valid_dates)
    technology = _build_fact_technology(summary, valid_dates)
    equipment = _build_fact_equipment_by_type(export_dir, valid_dates, subfolder="raw")
    predictions = _collect_intelligence(ctx, valid_dates[-1] if valid_dates else "")["prediction"]

    rows: list[dict[str, Any]] = []
    rows.extend(_snapshot_to_kpi_rows(snapshot_kpi))
    rows.extend(_delta_to_kpi_rows(delta_kpi))
    rows.extend(_technology_to_kpi_rows(technology))
    rows.extend(_equipment_to_kpi_rows(equipment))
    rows.extend(_executive_to_kpi_rows(ctx))
    rows.extend(_spares_to_kpi_rows(predictions))
    return _align_kpi(rows)


def _build_fact_signals(
    *,
    ctx: FilterContext,
    latest_date: str,
    site_details: pd.DataFrame,
    equipment_changes: pd.DataFrame,
    intelligence: dict[str, pd.DataFrame],
) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    rows.extend(_quality_to_signal_rows(intelligence["quality"]))
    rows.extend(_anomaly_to_signal_rows(intelligence["anomaly"]))
    rows.extend(_risk_to_signal_rows(intelligence["risk"]))
    rows.extend(_prediction_to_signal_rows(intelligence["prediction"]))
    rows.extend(_change_to_signal_rows(intelligence["guardian_change"], "guardian_change"))
    rows.extend(_change_to_signal_rows(site_details, "site_delta"))
    rows.extend(_change_to_signal_rows(equipment_changes, "equipment_change"))
    return _align_signals(rows)


def _build_model(
    *,
    valid_dates: list[str],
    excluded_snapshots: list[str],
    row_counts: dict[str, int],
    written: list[str],
) -> dict[str, Any]:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "layout_version": "2.1",
        "fact_tables": 2,
        "theme_file": "docs/powerbi/ooredoo-ran-theme.json",
        "min_sites_per_snapshot": MIN_SITES_PER_SNAPSHOT,
        "valid_snapshot_dates": valid_dates,
        "excluded_snapshots": excluded_snapshots,
        "folders": {
            "raw": "Pipeline copies for analysts",
            "dimensions": "Star-schema dimensions",
            "facts": "2 fact tables only: fact_kpi + fact_signals",
            "bridge": "Snapshot comparison periods",
            "model": "Relationships and dashboard spec",
        },
        "tables": {
            path.replace("/", ".").replace(".csv", ""): {"rows": row_counts.get(path, 0)}
            for path in written
            if path.endswith(".csv")
        },
        "relationships": [
            {"from": "facts.fact_kpi.snapshot_date", "to": "dimensions.dim_date.date_key", "cardinality": "N:1"},
            {"from": "facts.fact_kpi.period_key", "to": "dimensions.dim_period.period_key", "cardinality": "N:1"},
            {"from": "facts.fact_kpi.metric_name", "to": "dimensions.dim_metric.metric", "cardinality": "N:1"},
            {"from": "facts.fact_signals.snapshot_date", "to": "dimensions.dim_date.date_key", "cardinality": "N:1"},
            {"from": "facts.fact_signals.period_key", "to": "dimensions.dim_period.period_key", "cardinality": "N:1"},
            {"from": "facts.fact_signals.site_id", "to": "dimensions.dim_site.site_id", "cardinality": "N:1"},
            {"from": "facts.fact_signals.object_type", "to": "dimensions.dim_object_type.object_type", "cardinality": "N:1"},
            {"from": "facts.fact_signals.severity", "to": "dimensions.dim_severity.severity", "cardinality": "N:1"},
            {"from": "facts.fact_signals.signal_label", "to": "dimensions.dim_anomaly_type.anomaly_type", "cardinality": "N:1"},
        ],
        "recommended_pages": [
            {
                "name": "Executive",
                "visuals": [
                    "Cartes : fact_kpi WHERE kpi_scope = executive",
                    "Courbe : fact_kpi WHERE kpi_scope = snapshot AND metric_name = availability_pct",
                    "Donut techno : fact_kpi WHERE kpi_scope = technology",
                ],
            },
            {
                "name": "Delta",
                "visuals": [
                    "Slicer dim_period",
                    "Barres : fact_kpi WHERE kpi_scope = delta",
                    "Table : fact_signals WHERE signal_type = site_delta",
                ],
            },
            {
                "name": "Qualité",
                "visuals": [
                    "Heatmap : fact_signals WHERE signal_type = quality",
                    "Top risk : fact_signals score DESC",
                ],
            },
            {
                "name": "Anomalies & Risques",
                "visuals": [
                    "fact_signals WHERE signal_type IN (anomaly, risk)",
                    "Matrice severity × signal_label",
                ],
            },
            {
                "name": "Prédictions",
                "visuals": [
                    "fact_kpi WHERE kpi_scope = spares",
                    "fact_signals WHERE signal_type = equipment_change",
                ],
            },
        ],
        "dax_measures": [
            "Valeur KPI = SUM(fact_kpi[value])",
            "Delta net = CALCULATE(SUM(fact_kpi[delta]), fact_kpi[kpi_scope] = \"delta\")",
            "Anomalies critiques = CALCULATE(COUNTROWS(fact_signals), fact_signals[signal_type] = \"anomaly\", fact_signals[severity] = \"critical\")",
            "Score qualité moyen = CALCULATE(AVERAGE(fact_signals[score]), fact_signals[signal_type] = \"quality\")",
        ],
        "files": written,
    }


def build_decision_exports(export_dir, processed_dir) -> dict[str, Any]:
    """Build star-schema dimensions + 2 unified fact tables."""
    from pathlib import Path

    export_dir = Path(export_dir)
    ensure_folders(export_dir)
    removed_facts = remove_legacy_fact_files(export_dir)

    summary_raw = _load_csv(export_dir / "raw", "snapshot_summary.csv")
    if summary_raw.empty:
        summary_raw = _load_csv(export_dir, "snapshot_summary.csv")

    if not summary_raw.empty and "date" in summary_raw.columns:
        summary = summary_raw.copy()
        for col in summary.columns:
            if col == "date":
                continue
            converted = pd.to_numeric(summary[col], errors="coerce")
            if converted.notna().any():
                summary[col] = converted
    else:
        summary = pd.DataFrame()

    valid_dates = _valid_snapshot_dates(summary_raw if not summary_raw.empty else pd.DataFrame())
    latest_date = valid_dates[-1] if valid_dates else ""
    ctx = FilterContext.from_inputs(effective_dates=valid_dates)

    comparison = _load_csv(export_dir / STAGING_DIR, "delta_comparison.csv")
    if comparison.empty:
        comparison = _load_csv(export_dir, "platform_delta_comparison.csv")

    site_details = _load_csv(export_dir / STAGING_DIR, "delta_site_details.csv")
    if site_details.empty:
        site_details = _load_csv(export_dir, "platform_delta_site_details.csv")

    equipment_changes = _load_csv(export_dir / STAGING_DIR, "equipment_change.csv")
    if equipment_changes.empty:
        equipment_changes = _load_csv(export_dir, "platform_delta_equipment_changes.csv")

    intelligence = _collect_intelligence(ctx, latest_date)
    anomaly_records = intelligence["anomaly"].to_dict(orient="records") if not intelligence["anomaly"].empty else []

    fact_kpi = _build_fact_kpi(
        summary=summary,
        valid_dates=valid_dates,
        export_dir=export_dir,
        ctx=ctx,
        comparison=comparison,
    )
    fact_signals = _build_fact_signals(
        ctx=ctx,
        latest_date=latest_date,
        site_details=site_details,
        equipment_changes=equipment_changes,
        intelligence=intelligence,
    )

    datasets: dict[str, tuple[str, pd.DataFrame]] = {
        "dim_date.csv": (DIMENSIONS_DIR, _build_dim_date(valid_dates)),
        "dim_period.csv": (DIMENSIONS_DIR, _build_dim_period(valid_dates)),
        "dim_metric.csv": (DIMENSIONS_DIR, pd.DataFrame(METRIC_CATALOG)),
        "dim_site.csv": (DIMENSIONS_DIR, _build_dim_site(export_dir, latest_date)),
        "dim_object_type.csv": (DIMENSIONS_DIR, _build_dim_object_type(export_dir, valid_dates)),
        "dim_technology.csv": (DIMENSIONS_DIR, pd.DataFrame(TECHNOLOGY_DIM)),
        "dim_severity.csv": (DIMENSIONS_DIR, pd.DataFrame(SEVERITY_DIM)),
        "dim_anomaly_type.csv": (DIMENSIONS_DIR, _build_dim_anomaly_type(anomaly_records)),
        "fact_kpi.csv": (FACTS_DIR, fact_kpi),
        "fact_signals.csv": (FACTS_DIR, fact_signals),
    }

    written: list[str] = []
    row_counts: dict[str, int] = {}

    for name, (folder, frame) in datasets.items():
        rel = write_csv(export_dir, folder, name, frame)
        written.append(rel)
        row_counts[rel] = len(frame)

    excluded = sorted(set(summary_raw["date"].astype(str).unique()) - set(valid_dates) if not summary_raw.empty else [])
    model = _build_model(
        valid_dates=valid_dates,
        excluded_snapshots=excluded,
        row_counts=row_counts,
        written=written,
    )
    model_path = write_json(export_dir, MODEL_DIR, "powerbi_model.json", model)
    written.append(model_path)

    return {
        "layout_version": "2.1",
        "fact_tables": 2,
        "removed_legacy_facts": removed_facts,
        "valid_snapshot_dates": valid_dates,
        "latest_snapshot_date": latest_date,
        "excluded_snapshots": excluded,
        "files": written,
        "row_counts": row_counts,
    }
