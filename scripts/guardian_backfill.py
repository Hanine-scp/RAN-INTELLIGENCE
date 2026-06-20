"""Backfill RAN Guardian engines for existing lake snapshots."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.services.guardian_orchestrator import guardian_orchestrator
from src.services.vendor_lake import resolve_lake_paths


def main() -> None:
    lake = resolve_lake_paths("nokia")
    dates = sorted(lake.snapshot_dates)
    if not dates:
        print("No snapshots in lake.")
        return
    for snapshot_date in dates:
        print(f"Running Guardian engines for {snapshot_date}...")
        result = guardian_orchestrator.run_after_ingest(snapshot_date, vendor="nokia")
        print(
            f"  status={result['integrity'].get('status')} "
            f"changes={result['change_engine'].get('summary', {}).get('total_events', 0)} "
            f"anomalies={result['anomaly_count']} risks={result['risk_prediction_count']}"
        )


if __name__ == "__main__":
    main()
