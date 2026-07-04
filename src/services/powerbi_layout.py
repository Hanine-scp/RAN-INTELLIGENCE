"""Power BI export folder layout and I/O helpers."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

RAW_DIR = "raw"
DIMENSIONS_DIR = "dimensions"
FACTS_DIR = "facts"
BRIDGE_DIR = "bridge"
MODEL_DIR = "model"

# Pipeline copies (audit / analyst layer)
RAW_DATASETS = (
    "site_status.csv",
    "equipment_inventory.csv",
    "snapshot_summary.csv",
    "delta_metrics.csv",
    "delta_site_details.csv",
    "site_change_report.csv",
    "equipment_completeness_report.csv",
    "equipment_class_counter.csv",
)

# Star-schema dimensions
DIMENSION_DATASETS = (
    "dim_date.csv",
    "dim_period.csv",
    "dim_metric.csv",
    "dim_site.csv",
    "dim_object_type.csv",
    "dim_technology.csv",
    "dim_severity.csv",
    "dim_anomaly_type.csv",
)

# Decision facts — 2 tables max for Power BI
FACT_DATASETS = (
    "fact_kpi.csv",
    "fact_signals.csv",
)

STAGING_DIR = "_staging"

# Deprecated fact files removed on each sync
LEGACY_FACT_FILES = (
    "fact_snapshot_kpi.csv",
    "fact_delta_kpi.csv",
    "fact_technology.csv",
    "fact_equipment_by_type.csv",
    "fact_delta_site_details.csv",
    "fact_equipment_change.csv",
    "fact_delta_comparison.csv",
    "fact_quality_site.csv",
    "fact_anomaly.csv",
    "fact_anomaly_site_summary.csv",
    "fact_risk_prediction.csv",
    "fact_prediction_spares.csv",
    "fact_guardian_change.csv",
    "fact_executive_kpi.csv",
)

BRIDGE_DATASETS = ("bridge_snapshot_period.csv",)

MODEL_FILES = ("powerbi_model.json",)

ALL_STRUCTURED_DATASETS = (
    *DIMENSION_DATASETS,
    *FACT_DATASETS,
    *BRIDGE_DATASETS,
    *MODEL_FILES,
)


def subpath(folder: str, name: str) -> str:
    return f"{folder}/{name}"


def resolve(export_dir: Path, folder: str, name: str) -> Path:
    return export_dir / folder / name


def ensure_folders(export_dir: Path) -> None:
    for folder in (RAW_DIR, DIMENSIONS_DIR, FACTS_DIR, BRIDGE_DIR, MODEL_DIR, STAGING_DIR):
        (export_dir / folder).mkdir(parents=True, exist_ok=True)


def remove_legacy_fact_files(export_dir: Path) -> list[str]:
    removed: list[str] = []
    for name in LEGACY_FACT_FILES:
        path = export_dir / FACTS_DIR / name
        if path.exists():
            path.unlink()
            removed.append(f"{FACTS_DIR}/{name}")
    return removed


def atomic_csv_write(df: pd.DataFrame, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    tmp = destination.with_suffix(destination.suffix + ".tmp")
    df.to_csv(tmp, index=False, encoding="utf-8-sig")
    tmp.replace(destination)


def write_csv(export_dir: Path, folder: str, name: str, df: pd.DataFrame) -> str:
    rel = subpath(folder, name)
    atomic_csv_write(df, export_dir / folder / name)
    return rel


def write_json(export_dir: Path, folder: str, name: str, payload: dict[str, Any]) -> str:
    rel = subpath(folder, name)
    path = export_dir / folder / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return rel


def flatten_value(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return value


def records_to_frame(records: list[dict[str, Any]]) -> pd.DataFrame:
    if not records:
        return pd.DataFrame()
    rows = [{key: flatten_value(val) for key, val in row.items()} for row in records]
    return pd.DataFrame(rows)


def list_export_files(export_dir: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not export_dir.exists():
        return rows

    for path in sorted(export_dir.rglob("*")):
        if not path.is_file():
            continue
        if path.name.endswith(".tmp"):
            continue
        rel = path.relative_to(export_dir).as_posix()
        stat = path.stat()
        rows.append(
            {
                "name": rel,
                "folder": path.parent.relative_to(export_dir).as_posix() if path.parent != export_dir else "",
                "size_bytes": stat.st_size,
                "updated_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            }
        )
    return rows
