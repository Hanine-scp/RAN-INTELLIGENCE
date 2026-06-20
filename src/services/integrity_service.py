"""Data Integrity Engine — snapshot_audit + validation gate."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd

from config.settings import RAW_DATA_PATH
from src.services.data_service import query
from src.services.guardian_database import guardian_connect, init_guardian_schema, utc_now
from src.services.trust_service import trust_service
from src.services.vendor_lake import normalize_snapshot_date, resolve_lake_paths


class IntegrityService:
    VALID_STATUSES = {"VALIDATED", "PARTIAL", "FAILED", "PENDING"}

    def __init__(self) -> None:
        init_guardian_schema()

    def _xml_root(self, vendor: str) -> Path:
        return resolve_lake_paths(vendor).xml_root

    def _count_xml_files(self, folder: Path) -> int:
        if not folder.is_dir():
            return 0
        return len([p for p in folder.glob("*.xml") if p.is_file()])

    def _completeness_rate(self, snapshot_date: str, vendor: str) -> float:
        lake = resolve_lake_paths(vendor)
        try:
            df = query(
                f"""
                SELECT AVG(completeness_percent) AS avg_rate
                FROM read_parquet('{lake.completeness}')
                WHERE CAST(snapshot_date AS VARCHAR) = ?
                """,
                [snapshot_date],
            )
        except Exception:
            return 0.0
        if df.empty or pd.isna(df.iloc[0]["avg_rate"]):
            return 0.0
        return round(float(df.iloc[0]["avg_rate"]), 2)

    def _parsed_file_count(self, snapshot_date: str, vendor: str) -> int:
        lake = resolve_lake_paths(vendor)
        try:
            df = query(
                f"""
                SELECT COUNT(DISTINCT CAST(source_file AS VARCHAR)) AS parsed_count
                FROM read_parquet('{lake.sites}')
                WHERE CAST(snapshot_date AS VARCHAR) = ?
                """,
                [snapshot_date],
            )
        except Exception:
            return 0
        if df.empty:
            return 0
        return int(df.iloc[0]["parsed_count"] or 0)

    def record_snapshot_audit(
        self,
        snapshot_date: str,
        *,
        vendor: str = "nokia",
        file_count: int | None = None,
        parsed_file_count: int | None = None,
        auto_anchor: bool = True,
    ) -> dict[str, Any]:
        norm_date = normalize_snapshot_date(snapshot_date)
        xml_root = self._xml_root(vendor)
        folder = None
        for child in xml_root.iterdir():
            if child.is_dir() and normalize_snapshot_date(child.name) == norm_date:
                folder = child
                break

        if file_count is None:
            file_count = self._count_xml_files(folder) if folder else 0
        if parsed_file_count is None:
            parsed_file_count = self._parsed_file_count(norm_date, vendor)

        failed_file_count = max(0, int(file_count) - int(parsed_file_count))
        parse_rate = (parsed_file_count / file_count * 100) if file_count else 0.0
        completeness_rate = self._completeness_rate(norm_date, vendor)

        snapshot_hash = None
        previous_snapshot_hash = None
        chained_hash = None
        if auto_anchor and folder:
            anchor = trust_service.anchor_snapshot(norm_date, str(folder))
            if anchor.get("anchored"):
                snapshot_hash = anchor.get("batch_hash")
                previous_snapshot_hash = anchor.get("previous_chain_hash")
                chained_hash = anchor.get("chain_hash")

        if file_count == 0:
            status = "FAILED"
        elif parse_rate >= 95 and completeness_rate >= 70:
            status = "VALIDATED"
        elif parse_rate >= 50:
            status = "PARTIAL"
        else:
            status = "FAILED"

        row = {
            "snapshot_date": norm_date,
            "vendor": vendor,
            "file_count": int(file_count),
            "parsed_file_count": int(parsed_file_count),
            "failed_file_count": failed_file_count,
            "completeness_rate": completeness_rate,
            "snapshot_hash": snapshot_hash,
            "previous_snapshot_hash": previous_snapshot_hash,
            "chained_hash": chained_hash,
            "status": status,
            "created_at": utc_now(),
        }

        with guardian_connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO snapshot_audit (
                    snapshot_date, vendor, file_count, parsed_file_count, failed_file_count,
                    completeness_rate, snapshot_hash, previous_snapshot_hash, chained_hash,
                    status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    row["snapshot_date"],
                    row["vendor"],
                    row["file_count"],
                    row["parsed_file_count"],
                    row["failed_file_count"],
                    row["completeness_rate"],
                    row["snapshot_hash"],
                    row["previous_snapshot_hash"],
                    row["chained_hash"],
                    row["status"],
                    row["created_at"],
                ],
            )
            conn.commit()
        return row

    def get_snapshot_health(self, snapshot_date: str, vendor: str = "nokia") -> dict[str, Any]:
        norm_date = normalize_snapshot_date(snapshot_date)
        with guardian_connect() as conn:
            row = conn.execute(
                """
                SELECT * FROM snapshot_audit
                WHERE snapshot_date = ? AND vendor = ?
                """,
                [norm_date, vendor],
            ).fetchone()

        verify = trust_service.verify_snapshot(norm_date)
        if row:
            data = dict(row)
            data["trust_verified"] = bool(verify.get("verified"))
            data["parse_success_rate"] = round(
                (data["parsed_file_count"] / data["file_count"] * 100) if data["file_count"] else 0,
                2,
            )
            data["ai_allowed"] = data["status"] == "VALIDATED" and data.get("trust_verified", False)
            return data

        return {
            "snapshot_date": norm_date,
            "vendor": vendor,
            "status": "PENDING",
            "trust_verified": bool(verify.get("verified")),
            "ai_allowed": False,
            "message": "Snapshot not yet audited. Run ingestion pipeline.",
        }

    def list_audits(self, vendor: str = "nokia", limit: int = 30) -> list[dict[str, Any]]:
        with guardian_connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM snapshot_audit
                WHERE vendor = ?
                ORDER BY snapshot_date DESC
                LIMIT ?
                """,
                [vendor, limit],
            ).fetchall()
        return [dict(row) for row in rows]

    def assert_ai_allowed(self, snapshot_dates: list[str], vendor: str = "nokia") -> None:
        blocked = []
        for raw_date in snapshot_dates:
            health = self.get_snapshot_health(raw_date, vendor=vendor)
            if not health.get("ai_allowed"):
                blocked.append(f"{health.get('snapshot_date')} ({health.get('status', 'UNKNOWN')})")
        if blocked:
            raise ValueError(
                "IA bloquée : snapshots non validés — " + ", ".join(blocked)
                + ". Avant toute intelligence artificielle, le système vérifie l'intégrité."
            )

    def verify_snapshot_integrity(self, snapshot_date: str, vendor: str = "nokia") -> dict[str, Any]:
        norm_date = normalize_snapshot_date(snapshot_date)
        health = self.get_snapshot_health(norm_date, vendor=vendor)
        verify = trust_service.verify_snapshot(norm_date)
        return {
            "snapshot_date": norm_date,
            "audit": health,
            "trust": verify,
            "integrity_ok": bool(health.get("ai_allowed")) and bool(verify.get("verified")),
        }


integrity_service = IntegrityService()
