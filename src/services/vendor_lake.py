"""Multi-vendor RAN data lake paths (Nokia live, Huawei scaffold)."""

from __future__ import annotations

import contextvars
import os
import re
from dataclasses import dataclass
from pathlib import Path

DATE_FOLDER_PATTERN = re.compile(r"^\d{4}[.\-_]\d{2}[.\-_]\d{2}$")

_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_DATA_ROOT = _REPO_ROOT / "data" / "lake"
DATA_ROOT = Path(os.getenv("DATA_ROOT", str(_DEFAULT_DATA_ROOT)))

SUPPORTED_VENDORS = ("nokia", "huawei")
DEFAULT_VENDOR = "nokia"

_CURRENT_VENDOR: contextvars.ContextVar[str] = contextvars.ContextVar("ran_vendor", default=DEFAULT_VENDOR)


@dataclass(frozen=True)
class LakePaths:
    vendor: str
    root: Path
    sites: str
    equipment: str
    counters: str
    completeness: str
    delta: str
    site_changes: str
    xml_root: Path
    has_sites_data: bool
    snapshot_dates: list[str]


def normalize_snapshot_date(folder_name: str) -> str:
    """2025.09.11 / 2025_09_11 / 2025-09-11 -> 2025-09-11"""
    return folder_name.strip().replace(".", "-").replace("_", "-")


def normalize_vendor(vendor: str | None) -> str:
    value = (vendor or DEFAULT_VENDOR).strip().lower()
    return value if value in SUPPORTED_VENDORS else DEFAULT_VENDOR


def set_active_vendor(vendor: str | None) -> None:
    _CURRENT_VENDOR.set(normalize_vendor(vendor))


def active_vendor() -> str:
    return _CURRENT_VENDOR.get()


def _vendor_root(vendor: str) -> Path:
    normalized = normalize_vendor(vendor)
    if normalized == "nokia":
        vendor_root = DATA_ROOT / "nokia"
        legacy_sites = DATA_ROOT / "sites"
        if vendor_root.exists() and any((vendor_root / "sites").glob("*.parquet")):
            return vendor_root
        if legacy_sites.exists() and any(legacy_sites.glob("*.parquet")):
            return DATA_ROOT
        return vendor_root if vendor_root.exists() else DATA_ROOT
    return DATA_ROOT / normalized


def _xml_root(vendor: str) -> Path:
    from config.settings import RAW_DATA_PATH

    base = Path(os.getenv("DATA_XML_ROOT", str(RAW_DATA_PATH)))
    vendor_dir = base / normalize_vendor(vendor)
    if vendor_dir.exists():
        return vendor_dir
    if normalize_vendor(vendor) == "nokia" and base.exists():
        return base
    return vendor_dir


def resolve_lake_paths(vendor: str | None = None) -> LakePaths:
    normalized = normalize_vendor(vendor or active_vendor())
    root = _vendor_root(normalized)
    sites_dir = root / "sites"
    has_sites = sites_dir.exists() and any(sites_dir.glob("*.parquet"))

    snapshot_dates: list[str] = []
    if has_sites:
        try:
            import duckdb

            sites_glob = (sites_dir / "*.parquet").as_posix()
            df = duckdb.connect(database=":memory:").execute(
                f"""
                SELECT DISTINCT CAST(snapshot_date AS VARCHAR) AS snapshot_date
                FROM read_parquet('{sites_glob}')
                ORDER BY snapshot_date DESC
                """
            ).fetchdf()
            snapshot_dates = df["snapshot_date"].tolist()
        except Exception:
            snapshot_dates = []

    return LakePaths(
        vendor=normalized,
        root=root,
        sites=(sites_dir / "*.parquet").as_posix(),
        equipment=(root / "equipment" / "*.parquet").as_posix(),
        counters=(root / "counters" / "*.parquet").as_posix(),
        completeness=(root / "completeness" / "*.parquet").as_posix(),
        delta=(root / "delta" / "delta_metrics.parquet").as_posix(),
        site_changes=(root / "site_changes" / "site_changes.parquet").as_posix(),
        xml_root=_xml_root(normalized),
        has_sites_data=has_sites,
        snapshot_dates=snapshot_dates,
    )


def _is_date_folder(path: Path) -> bool:
    return path.is_dir() and bool(DATE_FOLDER_PATTERN.match(path.name.strip()))


def _list_xml_files(folder: Path) -> list[str]:
    return sorted(
        {
            p.name
            for p in folder.iterdir()
            if p.is_file() and p.suffix.lower() == ".xml"
        }
    )


def find_xml_snapshot_folder(xml_root: Path, snapshot_date: str) -> Path | None:
    target = normalize_snapshot_date(snapshot_date)
    if not xml_root.exists():
        return None
    for folder in xml_root.iterdir():
        if _is_date_folder(folder) and normalize_snapshot_date(folder.name) == target:
            return folder
    return None


def discover_xml_snapshots(vendor: str | None = None) -> list[dict[str, object]]:
    """Liste les dossiers snapshots directement depuis DATA.XML (source de vérité filtres)."""
    paths = resolve_lake_paths(vendor)
    xml_root = paths.xml_root
    if not xml_root.exists():
        return []

    lake_dates = {normalize_snapshot_date(d) for d in paths.snapshot_dates}
    snapshots: list[dict[str, object]] = []

    for folder in sorted(xml_root.iterdir(), key=lambda p: normalize_snapshot_date(p.name), reverse=True):
        if not _is_date_folder(folder):
            continue
        snapshot_date = normalize_snapshot_date(folder.name)
        xml_files = _list_xml_files(folder)
        snapshots.append(
            {
                "snapshot_date": snapshot_date,
                "folder_name": folder.name,
                "folder_path": str(folder),
                "xml_count": len(xml_files),
                "xml_files": xml_files,
                "processed_in_lake": snapshot_date in lake_dates,
            }
        )
    return snapshots


def list_xml_file_options(vendor: str | None, dates: list[str]) -> list[dict[str, str]]:
    paths = resolve_lake_paths(vendor)
    rows: list[dict[str, str]] = []
    for snapshot_date in dates:
        folder = find_xml_snapshot_folder(paths.xml_root, snapshot_date)
        if folder is None:
            continue
        norm_date = normalize_snapshot_date(folder.name)
        for filename in _list_xml_files(folder):
            rows.append({"snapshot_date": norm_date, "source_file": filename})
    return rows


def count_xml_files(vendor: str | None = None, dates: list[str] | None = None) -> int:
    snapshots = discover_xml_snapshots(vendor)
    if not dates:
        return sum(int(s["xml_count"]) for s in snapshots)
    allowed = {normalize_snapshot_date(d) for d in dates}
    return sum(int(s["xml_count"]) for s in snapshots if s["snapshot_date"] in allowed)


def vendor_status(vendor: str | None = None) -> dict:
    paths = resolve_lake_paths(vendor)
    xml_snapshots = discover_xml_snapshots(vendor)
    xml_dates = [str(s["snapshot_date"]) for s in xml_snapshots]
    return {
        "vendor": paths.vendor,
        "lake_ready": paths.has_sites_data,
        "snapshot_count": len(xml_dates) or len(paths.snapshot_dates),
        "latest_snapshot": xml_dates[0] if xml_dates else (paths.snapshot_dates[0] if paths.snapshot_dates else ""),
        "data_root": str(paths.root),
        "xml_root": str(paths.xml_root),
        "xml_snapshots": xml_snapshots,
        "phase": "live" if paths.vendor == "nokia" and paths.has_sites_data else "scaffold",
    }


def ensure_vendor_scaffold(vendor: str) -> None:
    normalized = normalize_vendor(vendor)
    root = DATA_ROOT / normalized if normalized != "nokia" else _vendor_root("nokia")
    for folder in ("sites", "equipment", "counters", "completeness", "delta", "site_changes"):
        (root / folder).mkdir(parents=True, exist_ok=True)
    if normalized == "huawei":
        for folder in ("sites", "equipment"):
            keep = root / folder / ".gitkeep"
            if not any((root / folder).glob("*.parquet")):
                keep.touch(exist_ok=True)
