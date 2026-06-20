"""Export processed RAN datasets for Power BI refresh."""

from __future__ import annotations

import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_PROCESSED = _REPO_ROOT / "data" / "processed"
_DEFAULT_EXPORT = _REPO_ROOT / "data" / "exports" / "powerbi"

POWERBI_DATASETS = (
    "site_status.csv",
    "equipment_inventory.csv",
    "snapshot_summary.csv",
    "delta_metrics.csv",
    "delta_site_details.csv",
    "site_change_report.csv",
    "equipment_completeness_report.csv",
    "equipment_class_counter.csv",
)


class PowerBiExportService:
    def __init__(self) -> None:
        self.processed_dir = Path(os.getenv("POWERBI_SOURCE_DIR", str(_DEFAULT_PROCESSED)))
        self.export_dir = Path(os.getenv("POWERBI_EXPORT_DIR", str(_DEFAULT_EXPORT)))

    def sync_export(self) -> dict[str, Any]:
        self.export_dir.mkdir(parents=True, exist_ok=True)
        copied: list[str] = []
        missing: list[str] = []

        for name in POWERBI_DATASETS:
            source = self.processed_dir / name
            if not source.exists():
                missing.append(name)
                continue
            destination = self.export_dir / name
            shutil.copy2(source, destination)
            copied.append(name)

        manifest = {
            "synced_at": datetime.now(timezone.utc).isoformat(),
            "source_dir": str(self.processed_dir.resolve()),
            "export_dir": str(self.export_dir.resolve()),
            "files": self._file_entries(copied),
            "missing": missing,
        }
        (self.export_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        return manifest

    def _file_entries(self, names: list[str]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for name in names:
            path = self.export_dir / name
            stat = path.stat()
            rows.append(
                {
                    "name": name,
                    "size_bytes": stat.st_size,
                    "updated_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                }
            )
        return rows

    def status(self) -> dict[str, Any]:
        manifest_path = self.export_dir / "manifest.json"
        manifest: dict[str, Any] = {}
        if manifest_path.exists():
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                manifest = {}

        export_files = self._file_entries([name for name in POWERBI_DATASETS if (self.export_dir / name).exists()])
        processed_files = self._file_entries(
            [name for name in POWERBI_DATASETS if (self.processed_dir / name).exists()]
        )

        return {
            "export_dir": str(self.export_dir.resolve()),
            "processed_dir": str(self.processed_dir.resolve()),
            "export_ready": bool(export_files),
            "last_synced_at": manifest.get("synced_at"),
            "export_files": export_files,
            "processed_files": processed_files,
            "datasets": list(POWERBI_DATASETS),
            "powerbi_report_url": os.getenv("POWERBI_REPORT_URL", "").strip(),
            "powerbi_embed_url": os.getenv("POWERBI_EMBED_URL", "").strip(),
        }


powerbi_export_service = PowerBiExportService()
