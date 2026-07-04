"""Export processed RAN datasets for Power BI refresh."""

from __future__ import annotations

import json
import os
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from src.services.powerbi_decision_builder import build_decision_exports
from src.services.powerbi_layout import RAW_DATASETS, RAW_DIR, ensure_folders, list_export_files

_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_PROCESSED = _REPO_ROOT / "data" / "processed"
_DEFAULT_EXPORT = _REPO_ROOT / "data" / "exports" / "powerbi"

_COPY_RETRIES = 3
_COPY_RETRY_DELAY_S = 0.4


def _atomic_copy(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    tmp = destination.with_suffix(destination.suffix + ".tmp")
    shutil.copy2(source, tmp)
    tmp.replace(destination)


class PowerBiExportService:
    def __init__(self) -> None:
        self.processed_dir = Path(os.getenv("POWERBI_SOURCE_DIR", str(_DEFAULT_PROCESSED)))
        self.export_dir = Path(os.getenv("POWERBI_EXPORT_DIR", str(_DEFAULT_EXPORT)))

    def _copy_dataset(self, name: str) -> tuple[str, str | None]:
        source = self.processed_dir / name
        if not source.exists():
            return "missing", None

        destination = self.export_dir / RAW_DIR / name
        last_error: PermissionError | None = None

        for attempt in range(_COPY_RETRIES):
            try:
                _atomic_copy(source, destination)
                return "copied", None
            except PermissionError as exc:
                last_error = exc
                if attempt < _COPY_RETRIES - 1:
                    time.sleep(_COPY_RETRY_DELAY_S)

        if destination.exists():
            return "locked", (
                f"{name}: fichier verrouillé (Power BI Desktop ouvert ?) — version export conservée."
            )

        return "locked", (
            f"{name}: impossible de copier ({last_error}). Fermez Power BI Desktop puis relancez l'export."
        )

    def sync_export(self) -> dict[str, Any]:
        ensure_folders(self.export_dir)

        copied: list[str] = []
        missing: list[str] = []
        locked: list[str] = []
        warnings: list[str] = []

        for name in RAW_DATASETS:
            status, message = self._copy_dataset(name)
            if status == "copied":
                copied.append(f"{RAW_DIR}/{name}")
                # Remove legacy flat copy at export root
                legacy = self.export_dir / name
                if legacy.exists():
                    legacy.unlink()
            elif status == "missing":
                missing.append(name)
            else:
                locked.append(name)
                if message:
                    warnings.append(message)

        platform: dict[str, Any] = {}
        try:
            from src.services.powerbi_platform_sync import sync_platform_exports

            platform = sync_platform_exports(self.processed_dir, self.export_dir)
        except Exception as exc:
            platform = {"error": str(exc)}

        decision: dict[str, Any] = {}
        try:
            decision = build_decision_exports(self.export_dir, self.processed_dir)
        except Exception as exc:
            decision = {"error": str(exc)}

        manifest = {
            "synced_at": datetime.now(timezone.utc).isoformat(),
            "layout_version": "2.1",
            "source_dir": str(self.processed_dir.resolve()),
            "export_dir": str(self.export_dir.resolve()),
            "folders": {
                "raw": "Copies pipeline (audit)",
                "dimensions": "Dimensions star-schema",
                "facts": "Faits KPI, qualité, anomalies, risques",
                "bridge": "Périodes de comparaison",
                "model": "Modèle Power BI (relations + pages)",
            },
            "files": list_export_files(self.export_dir),
            "copied": copied,
            "missing": missing,
            "locked": locked,
            "warnings": warnings,
            "platform_sync": platform,
            "decision_build": decision,
        }
        (self.export_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        return manifest

    def status(self) -> dict[str, Any]:
        manifest_path = self.export_dir / "manifest.json"
        manifest: dict[str, Any] = {}
        if manifest_path.exists():
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                manifest = {}

        export_files = list_export_files(self.export_dir)
        processed_files: list[dict[str, Any]] = []
        for name in RAW_DATASETS:
            path = self.processed_dir / name
            if not path.exists():
                continue
            stat = path.stat()
            processed_files.append(
                {
                    "name": name,
                    "folder": "",
                    "size_bytes": stat.st_size,
                    "updated_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                }
            )

        return {
            "export_dir": str(self.export_dir.resolve()),
            "processed_dir": str(self.processed_dir.resolve()),
            "export_ready": bool(export_files),
            "layout_version": manifest.get("layout_version", "2.0"),
            "last_synced_at": manifest.get("synced_at"),
            "export_files": export_files,
            "processed_files": processed_files,
            "folders": manifest.get("folders", {}),
            "datasets": list(RAW_DATASETS),
            "locked_files": manifest.get("locked", []),
            "export_warnings": manifest.get("warnings", []),
            "decision_build": manifest.get("decision_build", {}),
            "powerbi_report_url": os.getenv("POWERBI_REPORT_URL", "").strip(),
            "powerbi_embed_url": os.getenv("POWERBI_EMBED_URL", "").strip(),
        }


powerbi_export_service = PowerBiExportService()
