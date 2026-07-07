"""Export Power BI datasets aligned with platform UI (/delta/compare)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

from src.services.data_service import FilterContext, data_service
from src.services.powerbi_layout import BRIDGE_DIR, RAW_DATASETS, STAGING_DIR, atomic_csv_write, ensure_folders, write_csv

METRIC_LABELS: dict[str, str] = {
    "total_sites": "Total sites",
    "added_sites": "Sites ajoutés",
    "removed_sites": "Sites supprimés",
    "active_sites": "Sites actifs",
    "blocked_sites": "Sites bloqués",
    "total_equipment": "Total équipements",
    "serial_rows": "Serial numbers (Total)",
    "unique_serials": "Serials uniques",
    "missing_serials": "Serials manquants",
    "cells_2g": "Cellules 2G",
    "cells_3g": "Cellules 3G",
    "cells_4g": "Cellules 4G",
    "cells_4g_fdd": "Cellules 4G FDD",
    "cells_4g_tdd": "Cellules 4G TDD",
    "cells_5g": "Cellules 5G",
}

CHANGE_TYPE_LABELS: dict[str, str] = {
    "ADDED": "Ajouté",
    "REMOVED": "Supprimé",
}

# Backward-compatible flat names (deprecated — use bridge/ and facts/)
PLATFORM_DATASETS = (
    "platform_snapshot_dates.csv",
    "platform_delta_comparison.csv",
    "platform_delta_site_details.csv",
    "platform_delta_equipment_changes.csv",
)

LEGACY_DATASETS = (
    "dim_date.csv",
    "dim_site.csv",
    "dim_metric.csv",
    "dim_object_type.csv",
    "dim_change_type.csv",
    "dim_delta_period.csv",
    "fact_site_status.csv",
    "fact_snapshot_summary.csv",
    "fact_equipment_count.csv",
    "fact_delta_metric.csv",
    "fact_delta_site_detail.csv",
    "powerbi_dimensions_manifest.json",
    "pbi_dim_date.csv",
    "pbi_dim_period.csv",
    "pbi_dim_metric.csv",
    "pbi_fact_snapshot_kpi.csv",
    "pbi_fact_delta_kpi.csv",
    "pbi_fact_technology.csv",
    "pbi_fact_equipment_by_type.csv",
    "powerbi_model.json",
)


def _load_snapshot_dates(processed_dir: Path) -> list[str]:
    summary = processed_dir / "snapshot_summary.csv"
    if summary.exists():
        frame = pd.read_csv(summary, usecols=lambda c: c == "date", dtype=str)
        if not frame.empty:
            return sorted(frame["date"].dropna().astype(str).unique().tolist())

    site_status = processed_dir / "site_status.csv"
    if site_status.exists():
        frame = pd.read_csv(site_status, usecols=lambda c: c == "snapshot_date", dtype=str)
        if not frame.empty:
            return sorted(frame["snapshot_date"].dropna().astype(str).unique().tolist())

    return []


def _build_snapshot_date_counts(processed_dir: Path) -> pd.DataFrame:
    summary = processed_dir / "snapshot_summary.csv"
    if summary.exists():
        frame = pd.read_csv(summary, usecols=lambda c: c in {"date", "nb_sites"}, dtype=str)
        if "date" in frame.columns and "nb_sites" in frame.columns and not frame.empty:
            frame = frame.rename(columns={"date": "snapshot_date", "nb_sites": "site_count"})[["snapshot_date", "site_count"]]
            return frame.sort_values("snapshot_date", ascending=False)

    site_status = processed_dir / "site_status.csv"
    if site_status.exists():
        frame = pd.read_csv(site_status, usecols=lambda c: c == "snapshot_date", dtype=str)
        if not frame.empty:
            counts = frame.groupby("snapshot_date", sort=False).size().reset_index(name="site_count")
            return counts.sort_values("snapshot_date", ascending=False)

    return pd.DataFrame(columns=["snapshot_date", "site_count"])


def _remove_legacy_exports(export_dir: Path) -> list[str]:
    removed: list[str] = []
    for name in LEGACY_DATASETS + PLATFORM_DATASETS:
        path = export_dir / name
        if path.exists():
            path.unlink()
            removed.append(name)
    return removed


def sync_platform_exports(processed_dir: Path, export_dir: Path) -> dict[str, Any]:
    export_dir.mkdir(parents=True, exist_ok=True)
    ensure_folders(export_dir)
    removed_legacy = _remove_legacy_exports(export_dir)

    for name in RAW_DATASETS:
        stale = export_dir / name
        if stale.exists():
            stale.unlink()
            removed_legacy.append(name)

    dates = _load_snapshot_dates(processed_dir)
    ctx = FilterContext.from_inputs(effective_dates=dates)

    period_rows: list[dict[str, str]] = []
    comparison_rows: list[dict[str, Any]] = []
    detail_rows: list[dict[str, Any]] = []
    equipment_rows: list[dict[str, Any]] = []

    for index in range(len(dates) - 1):
        date_1 = dates[index]
        date_2 = dates[index + 1]
        period_rows.append(
            {
                "date_ref": date_1,
                "date_cmp": date_2,
                "period_key": f"{date_1}|{date_2}",
            }
        )

        payload = data_service.get_delta_comparison(ctx, date_1, date_2)
        for row in payload.get("comparison", []):
            metric = str(row.get("metric", ""))
            delta = int(row.get("delta", 0) or 0)
            comparison_rows.append(
                {
                    "date_ref": date_1,
                    "date_cmp": date_2,
                    "period_key": f"{date_1}|{date_2}",
                    "metric": metric,
                    "metric_label": METRIC_LABELS.get(metric, metric),
                    "metric_group": row.get("group", ""),
                    "value_ref": row.get("value_1", 0),
                    "value_cmp": row.get("value_2", 0),
                    "delta": delta,
                    "impact_abs": abs(delta),
                    "status": row.get("status", ""),
                }
            )

        for row in payload.get("details", []):
            change_type = str(row.get("change_type", "")).upper()
            detail_rows.append(
                {
                    "date_ref": date_1,
                    "date_cmp": date_2,
                    "period_key": f"{date_1}|{date_2}",
                    "change_type": change_type,
                    "change_type_label": CHANGE_TYPE_LABELS.get(change_type, change_type),
                    "site_id": row.get("site_id", ""),
                }
            )

        for row in payload.get("equipment_changes", []):
            change_type = str(row.get("change_type", "")).upper()
            equipment_rows.append(
                {
                    "date_ref": row.get("date_1", date_1),
                    "date_cmp": row.get("date_2", date_2),
                    "period_key": f"{date_1}|{date_2}",
                    "change_type": change_type,
                    "change_type_label": CHANGE_TYPE_LABELS.get(change_type, change_type),
                    "site_id": row.get("site_id", ""),
                    "object_type": row.get("object_type", ""),
                    "equipment_id": row.get("id", ""),
                    "serial_number": row.get("serial_number", ""),
                    "product_code": row.get("product_code", ""),
                    "product_name": row.get("product_name", ""),
                    "nb_equipment": row.get("nb_equipment", ""),
                }
            )

    structured = {
        "bridge_snapshot_period.csv": pd.DataFrame(period_rows),
        "delta_comparison.csv": pd.DataFrame(comparison_rows),
        "delta_site_details.csv": pd.DataFrame(detail_rows),
        "equipment_change.csv": pd.DataFrame(equipment_rows),
    }

    snapshot_rows = _build_snapshot_date_counts(processed_dir)
    dates = snapshot_rows["snapshot_date"].tolist() or _load_snapshot_dates(processed_dir)

    written: list[str] = []
    folder_map = {
        "bridge_snapshot_period.csv": BRIDGE_DIR,
        "delta_comparison.csv": STAGING_DIR,
        "delta_site_details.csv": STAGING_DIR,
        "equipment_change.csv": STAGING_DIR,
    }
    for name, frame in structured.items():
        rel = write_csv(export_dir, folder_map[name], name, frame)
        written.append(rel)

    # Legacy flat copies for tools still expecting root-level names
    legacy_frames = {
        "platform_snapshot_dates.csv": snapshot_rows,
        "platform_delta_comparison.csv": structured["delta_comparison.csv"],
        "platform_delta_site_details.csv": structured["delta_site_details.csv"],
        "platform_delta_equipment_changes.csv": structured["equipment_change.csv"],
    }
    for name, frame in legacy_frames.items():
        atomic_csv_write(frame, export_dir / name)

    manifest = {
        "synced_at": datetime.now(timezone.utc).isoformat(),
        "source": "platform_api:/delta/compare",
        "layout_version": "2.0",
        "snapshot_dates": dates,
        "comparison_periods": len(period_rows),
        "comparison_rows": len(comparison_rows),
        "site_detail_rows": len(detail_rows),
        "equipment_change_rows": len(equipment_rows),
        "files": written,
        "legacy_flat_files": list(legacy_frames.keys()),
        "removed_legacy_files": removed_legacy,
    }
    (export_dir / "platform_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest
