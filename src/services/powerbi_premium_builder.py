"""Build Power BI–ready premium datasets (star-style, KPI-enriched)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

MIN_SITES_PER_SNAPSHOT = int(__import__("os").getenv("POWERBI_MIN_SITES", "50"))

METRIC_CATALOG: list[dict[str, Any]] = [
    {"metric": "total_sites", "metric_label": "Total sites", "metric_group": "sites", "sort_order": 10, "format": "#,0"},
    {"metric": "added_sites", "metric_label": "Sites ajoutés", "metric_group": "sites", "sort_order": 20, "format": "#,0"},
    {"metric": "removed_sites", "metric_label": "Sites supprimés", "metric_group": "sites", "sort_order": 30, "format": "#,0"},
    {"metric": "active_sites", "metric_label": "Sites actifs", "metric_group": "sites", "sort_order": 40, "format": "#,0"},
    {"metric": "blocked_sites", "metric_label": "Sites bloqués", "metric_group": "sites", "sort_order": 50, "format": "#,0"},
    {"metric": "total_equipment", "metric_label": "Total équipements", "metric_group": "equipment", "sort_order": 60, "format": "#,0"},
    {"metric": "unique_serials", "metric_label": "Serials uniques", "metric_group": "equipment", "sort_order": 70, "format": "#,0"},
    {"metric": "missing_serials", "metric_label": "Serials manquants", "metric_group": "equipment", "sort_order": 80, "format": "#,0"},
    {"metric": "cells_2g", "metric_label": "Cellules 2G", "metric_group": "cells", "sort_order": 90, "format": "#,0"},
    {"metric": "cells_3g", "metric_label": "Cellules 3G", "metric_group": "cells", "sort_order": 100, "format": "#,0"},
    {"metric": "cells_4g", "metric_label": "Cellules 4G", "metric_group": "cells", "sort_order": 110, "format": "#,0"},
    {"metric": "cells_4g_fdd", "metric_label": "Cellules 4G FDD", "metric_group": "cells", "sort_order": 120, "format": "#,0"},
    {"metric": "cells_4g_tdd", "metric_label": "Cellules 4G TDD", "metric_group": "cells", "sort_order": 130, "format": "#,0"},
    {"metric": "cells_5g", "metric_label": "Cellules 5G", "metric_group": "cells", "sort_order": 140, "format": "#,0"},
]

STATUS_COLORS = {
    "up": "#059669",
    "down": "#DC2626",
    "stable": "#64748B",
    "warning": "#D97706",
}

PREMIUM_DATASETS = (
    "pbi_dim_date.csv",
    "pbi_dim_period.csv",
    "pbi_dim_metric.csv",
    "pbi_fact_snapshot_kpi.csv",
    "pbi_fact_delta_kpi.csv",
    "pbi_fact_technology.csv",
    "pbi_fact_equipment_by_type.csv",
    "powerbi_model.json",
)


def _atomic_csv_write(df: pd.DataFrame, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    tmp = destination.with_suffix(destination.suffix + ".tmp")
    df.to_csv(tmp, index=False, encoding="utf-8-sig")
    tmp.replace(destination)


def _load_csv(export_dir: Path, name: str) -> pd.DataFrame:
    path = export_dir / name
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path, dtype=str, keep_default_na=False)


def _valid_snapshot_dates(summary: pd.DataFrame) -> list[str]:
    if summary.empty or "date" not in summary.columns:
        return []
    frame = summary.copy()
    frame["nb_sites"] = pd.to_numeric(frame.get("nb_sites", 0), errors="coerce").fillna(0)
    frame = frame[frame["nb_sites"] >= MIN_SITES_PER_SNAPSHOT]
    return sorted(frame["date"].astype(str).unique().tolist())


def _build_dim_date(valid_dates: list[str]) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for index, date_str in enumerate(valid_dates):
        dt = pd.to_datetime(date_str, errors="coerce")
        rows.append(
            {
                "date_key": date_str,
                "snapshot_date": date_str,
                "year": int(dt.year) if pd.notna(dt) else "",
                "month": int(dt.month) if pd.notna(dt) else "",
                "quarter": f"Q{((int(dt.month) - 1) // 3) + 1}" if pd.notna(dt) else "",
                "year_month": dt.strftime("%Y-%m") if pd.notna(dt) else "",
                "sort_order": index + 1,
                "is_latest": index == len(valid_dates) - 1,
            }
        )
    return pd.DataFrame(rows)


def _build_dim_period(valid_dates: list[str]) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for index in range(len(valid_dates) - 1):
        date_ref = valid_dates[index]
        date_cmp = valid_dates[index + 1]
        period_key = f"{date_ref}|{date_cmp}"
        rows.append(
            {
                "period_key": period_key,
                "date_ref": date_ref,
                "date_cmp": date_cmp,
                "period_label": f"{date_ref} → {date_cmp}",
                "period_label_short": f"{date_ref} → {date_cmp}",
                "sort_order": index + 1,
                "is_demo_period": period_key == "2025-09-11|2026-05-14",
            }
        )
    return pd.DataFrame(rows)


def _build_fact_snapshot_kpi(summary: pd.DataFrame, valid_dates: list[str]) -> pd.DataFrame:
    if summary.empty:
        return pd.DataFrame()
    frame = summary[summary["date"].astype(str).isin(valid_dates)].copy()
    for col in ("nb_sites", "nb_active_sites", "nb_blocked_sites", "nb_equipment", "nb_cells_total"):
        if col in frame.columns:
            frame[col] = pd.to_numeric(frame[col], errors="coerce").fillna(0).astype(int)
    frame["availability_pct"] = frame.apply(
        lambda row: round(100 * row["nb_active_sites"] / row["nb_sites"], 2) if row["nb_sites"] else 0,
        axis=1,
    )
    frame["equipment_per_site"] = frame.apply(
        lambda row: round(row["nb_equipment"] / row["nb_sites"], 1) if row["nb_sites"] else 0,
        axis=1,
    )
    frame = frame.rename(columns={"date": "snapshot_date"})
    return frame


def _build_fact_delta_kpi(comparison: pd.DataFrame, valid_dates: list[str]) -> pd.DataFrame:
    if comparison.empty:
        return pd.DataFrame()
    valid_periods = {f"{valid_dates[i]}|{valid_dates[i + 1]}" for i in range(len(valid_dates) - 1)}
    frame = comparison[comparison["period_key"].isin(valid_periods)].copy()
    metric_map = {row["metric"]: row for row in METRIC_CATALOG}
    frame["sort_order"] = frame["metric"].map(lambda m: metric_map.get(m, {}).get("sort_order", 999))
    frame["status_color"] = frame["status"].astype(str).str.lower().map(STATUS_COLORS).fillna("#64748B")
    for col in ("value_ref", "value_cmp", "delta", "impact_abs"):
        if col in frame.columns:
            frame[col] = pd.to_numeric(frame[col], errors="coerce").fillna(0)
    return frame.sort_values(["period_key", "sort_order"])


def _build_fact_technology(summary: pd.DataFrame, valid_dates: list[str]) -> pd.DataFrame:
    if summary.empty:
        return pd.DataFrame()
    frame = summary[summary["date"].astype(str).isin(valid_dates)].copy()
    tech_cols = [
        ("2G", "nb_cells_2g"),
        ("3G", "nb_cells_3g"),
        ("4G", "nb_cells_4g"),
        ("4G FDD", "nb_cells_lte_fdd"),
        ("4G TDD", "nb_cells_lte_tdd"),
        ("5G", "nb_cells_5g"),
    ]
    rows: list[dict[str, Any]] = []
    for _, row in frame.iterrows():
        snapshot_date = str(row["date"])
        for technology, col in tech_cols:
            if col not in frame.columns:
                continue
            rows.append(
                {
                    "snapshot_date": snapshot_date,
                    "technology": technology,
                    "cell_count": int(pd.to_numeric(row[col], errors="coerce") or 0),
                }
            )
    return pd.DataFrame(rows)


def _build_fact_equipment_by_type(export_dir: Path, valid_dates: list[str]) -> pd.DataFrame:
    counter = _load_csv(export_dir, "equipment_class_counter.csv")
    if counter.empty:
        return pd.DataFrame()
    frame = counter[counter["snapshot_date"].astype(str).isin(valid_dates)].copy()
    frame["equipment_count"] = pd.to_numeric(frame["equipment_count"], errors="coerce").fillna(0).astype(int)
    grouped = (
        frame.groupby(["snapshot_date", "object_type"], as_index=False)["equipment_count"]
        .sum()
        .sort_values(["snapshot_date", "object_type"])
    )
    return grouped


def build_premium_exports(export_dir: Path) -> dict[str, Any]:
    export_dir.mkdir(parents=True, exist_ok=True)

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
    comparison = _load_csv(export_dir, "platform_delta_comparison.csv")

    datasets = {
        "pbi_dim_date.csv": _build_dim_date(valid_dates),
        "pbi_dim_period.csv": _build_dim_period(valid_dates),
        "pbi_dim_metric.csv": pd.DataFrame(METRIC_CATALOG),
        "pbi_fact_snapshot_kpi.csv": _build_fact_snapshot_kpi(summary, valid_dates),
        "pbi_fact_delta_kpi.csv": _build_fact_delta_kpi(comparison, valid_dates),
        "pbi_fact_technology.csv": _build_fact_technology(summary, valid_dates),
        "pbi_fact_equipment_by_type.csv": _build_fact_equipment_by_type(export_dir, valid_dates),
    }

    written: list[str] = []
    row_counts: dict[str, int] = {}
    for name, frame in datasets.items():
        _atomic_csv_write(frame, export_dir / name)
        written.append(name)
        row_counts[name] = len(frame)

    model = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "theme_file": "docs/powerbi/ooredoo-ran-theme.json",
        "min_sites_per_snapshot": MIN_SITES_PER_SNAPSHOT,
        "valid_snapshot_dates": valid_dates,
        "excluded_snapshots": sorted(
            set(summary_raw["date"].astype(str).unique()) - set(valid_dates) if not summary_raw.empty else []
        ),
        "tables": {
            "pbi_dim_date": {"role": "dimension", "key": "date_key", "rows": row_counts.get("pbi_dim_date.csv", 0)},
            "pbi_dim_period": {"role": "dimension", "key": "period_key", "rows": row_counts.get("pbi_dim_period.csv", 0)},
            "pbi_dim_metric": {"role": "dimension", "key": "metric", "rows": row_counts.get("pbi_dim_metric.csv", 0)},
            "pbi_fact_snapshot_kpi": {
                "role": "fact",
                "key": "snapshot_date",
                "rows": row_counts.get("pbi_fact_snapshot_kpi.csv", 0),
            },
            "pbi_fact_delta_kpi": {
                "role": "fact",
                "key": "period_key + metric",
                "rows": row_counts.get("pbi_fact_delta_kpi.csv", 0),
            },
            "pbi_fact_technology": {
                "role": "fact",
                "key": "snapshot_date + technology",
                "rows": row_counts.get("pbi_fact_technology.csv", 0),
            },
            "pbi_fact_equipment_by_type": {
                "role": "fact",
                "key": "snapshot_date + object_type",
                "rows": row_counts.get("pbi_fact_equipment_by_type.csv", 0),
            },
        },
        "relationships": [
            {"from": "pbi_fact_snapshot_kpi.snapshot_date", "to": "pbi_dim_date.date_key", "cardinality": "N:1"},
            {"from": "pbi_fact_delta_kpi.period_key", "to": "pbi_dim_period.period_key", "cardinality": "N:1"},
            {"from": "pbi_fact_delta_kpi.metric", "to": "pbi_dim_metric.metric", "cardinality": "N:1"},
            {"from": "pbi_fact_technology.snapshot_date", "to": "pbi_dim_date.date_key", "cardinality": "N:1"},
            {"from": "pbi_fact_equipment_by_type.snapshot_date", "to": "pbi_dim_date.date_key", "cardinality": "N:1"},
        ],
        "recommended_pages": [
            {
                "name": "Executive",
                "visuals": [
                    "Slicer: pbi_dim_period.period_label",
                    "Cards: total_sites, active_sites, total_equipment, cells_4g from pbi_fact_delta_kpi",
                    "Line: pbi_fact_snapshot_kpi over snapshot_date",
                    "Stacked bar: pbi_fact_technology by technology",
                ],
            },
            {
                "name": "Delta",
                "visuals": [
                    "Bar: pbi_fact_delta_kpi metric_label vs delta",
                    "Table: platform_delta_site_details (raw layer)",
                ],
            },
        ],
        "files": written,
    }
    (export_dir / "powerbi_model.json").write_text(json.dumps(model, indent=2, ensure_ascii=False), encoding="utf-8")
    written.append("powerbi_model.json")

    return {
        "valid_snapshot_dates": valid_dates,
        "excluded_snapshots": model["excluded_snapshots"],
        "files": written,
        "row_counts": row_counts,
    }
