#!/usr/bin/env python3
"""Reprocess all Nokia XML snapshot folders with classify_cell-based site metrics."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from pipeline.main_pipeline import ProjectPaths, discover_date_batches, process_uploaded_snapshot


def main() -> int:
    parser = argparse.ArgumentParser(description="Reprocess XML snapshots into data lake with cell breakdown.")
    parser.add_argument("--date", help="Single snapshot folder name (e.g. 2026.05.14). Default: all folders.")
    parser.add_argument("--max-workers", type=int, default=None)
    args = parser.parse_args()

    paths = ProjectPaths.from_root(PROJECT_ROOT)
    batches = discover_date_batches(paths.source_root)
    if args.date:
        batches = [b for b in batches if b.folder_name == args.date or b.folder_date == args.date.replace(".", "-")]
        if not batches:
            print(f"No snapshot folder found for: {args.date}")
            return 1

    print(f"Reprocessing {len(batches)} snapshot folder(s) from {paths.source_root}")
    for batch in batches:
        print(f"\n=== {batch.folder_name} ({batch.xml_count} XML) ===")
        result = process_uploaded_snapshot(
            batch.folder_name,
            project_root=PROJECT_ROOT,
            source_root=paths.source_root,
            max_workers=args.max_workers,
        )
        print(
            f"Done {batch.folder_name}: sites={result.get('sites_rows', '?')} "
            f"equipment={result.get('equipment_rows', '?')} "
            f"seconds={result.get('processing_seconds', '?')}"
        )
    print("\nReprocess complete. Restart API (uvicorn :8010) then refresh the dashboard.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
