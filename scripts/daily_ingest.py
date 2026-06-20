"""Pipeline J-1 : registre snapshots → parse → ancrage trust."""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from config.settings import RAW_DATA_PATH
from pipeline.main_pipeline import find_snapshot_folder, normalize_folder_date, process_uploaded_snapshot
from scripts.build_snapshot_registry import build_snapshot_registry
from src.services.trust_service import trust_service


def _default_snapshot_date() -> str:
    return (datetime.now() - timedelta(days=1)).strftime("%Y.%m.%d")


def _resolve_source_root(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit).resolve()
    env_root = os.getenv("DATA_XML_ROOT", "").strip()
    if env_root:
        return Path(env_root).resolve()
    return RAW_DATA_PATH.resolve()


def run_daily_ingest(
    *,
    snapshot_date: str | None = None,
    source_root: Path | None = None,
    skip_trust: bool = False,
) -> dict:
    date_label = snapshot_date or _default_snapshot_date()
    normalized = normalize_folder_date(date_label)
    source = source_root or _resolve_source_root(None)

    print(f"[daily_ingest] Source XML : {source}")
    print(f"[daily_ingest] Snapshot cible : {date_label} (normalisé {normalized})")

    print("[daily_ingest] Étape 1/3 — Registre bronze")
    build_snapshot_registry()

    folder = find_snapshot_folder(source, normalized)
    if folder is None:
        raise FileNotFoundError(
            f"Aucun dossier snapshot pour {normalized} sous {source}. "
            "Vérifiez que les XML J-1 sont déposés."
        )

    print(f"[daily_ingest] Étape 2/3 — Pipeline snapshot : {folder.name}")
    processing = process_uploaded_snapshot(
        folder.name,
        source_root=source,
        max_workers=0,
    )
    print(f"[daily_ingest] Traité : {processing.get('xml_count', 0)} XML en {processing.get('processing_seconds', 0)}s")

    trust_result = None
    if not skip_trust:
        print("[daily_ingest] Étape 3/3 — Ancrage Data Trust")
        trust_result = trust_service.anchor_latest_snapshot()
        print(f"[daily_ingest] Trust : {trust_result}")

    return {
        "snapshot_date": normalized,
        "snapshot_folder": folder.name,
        "processing": processing,
        "trust": trust_result,
        "status": "ok",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingestion quotidienne J-1 RAN Intelligence")
    parser.add_argument(
        "--date",
        help="Date snapshot YYYY.MM.DD (défaut : hier)",
    )
    parser.add_argument(
        "--source-root",
        help="Racine DATA.XML (défaut : DATA_XML_ROOT ou config.settings)",
    )
    parser.add_argument(
        "--skip-trust",
        action="store_true",
        help="Ne pas lancer l'ancrage trust après le pipeline",
    )
    args = parser.parse_args()

    try:
        result = run_daily_ingest(
            snapshot_date=args.date,
            source_root=_resolve_source_root(args.source_root) if args.source_root else None,
            skip_trust=args.skip_trust,
        )
        print(f"[daily_ingest] Terminé : {result['status']}")
        return 0
    except Exception as exc:
        print(f"[daily_ingest] ERREUR : {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
