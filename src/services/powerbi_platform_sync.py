"""Export Power BI datasets aligned with platform UI (/delta/compare)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

from src.services.data_service import FilterContext, data_service

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
)


def _atomic_csv_write(df: pd.DataFrame, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    tmp = destination.with_suffix(destination.suffix + ".tmp")
    df.to_csv(tmp, index=False, encoding="utf-8-sig")
    tmp.replace(destination)


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


def _remove_legacy_exports(export_dir: Path) -> list[str]:
    removed: list[str] = []
    for name in LEGACY_DATASETS:
        path = export_dir / name
        if path.exists():
            path.unlink()
            removed.append(name)
    return removed


def sync_platform_exports(processed_dir: Path, export_dir: Path) -> dict[str, Any]:
    export_dir.mkdir(parents=True, exist_ok=True)
    removed_legacy = _remove_legacy_exports(export_dir)

    dates = _load_snapshot_dates(processed_dir)
    ctx = FilterContext.from_inputs()

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

    frames = {
        "platform_snapshot_dates.csv": pd.DataFrame(period_rows),
        "platform_delta_comparison.csv": pd.DataFrame(comparison_rows),
        "platform_delta_site_details.csv": pd.DataFrame(detail_rows),
        "platform_delta_equipment_changes.csv": pd.DataFrame(equipment_rows),
    }

    written: list[str] = []
    for name, frame in frames.items():
        _atomic_csv_write(frame, export_dir / name)
        written.append(name)

    manifest = {
        "synced_at": datetime.now(timezone.utc).isoformat(),
        "source": "platform_api:/delta/compare",
        "snapshot_dates": dates,
        "comparison_periods": len(period_rows),
        "comparison_rows": len(comparison_rows),
        "site_detail_rows": len(detail_rows),
        "equipment_change_rows": len(equipment_rows),
        "files": written,
        "removed_legacy_files": removed_legacy,
    }
    (export_dir / "platform_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest
