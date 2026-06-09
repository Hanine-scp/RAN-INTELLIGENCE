from __future__ import annotations

import hashlib
import os
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from config.settings import RAW_DATA_PATH

_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_XML_ROOT = RAW_DATA_PATH
XML_ROOT = Path(os.getenv("DATA_XML_ROOT", str(_DEFAULT_XML_ROOT)))
TRUST_DIR = _REPO_ROOT / "data" / "trust"
TRUST_DB = TRUST_DIR / "trust_audit.db"


def _sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _snapshot_file_hashes(snapshot_path: Path) -> list[tuple[str, str]]:
    if not snapshot_path.exists():
        return []
    files = sorted(snapshot_path.glob("*.xml"))
    return [(file_path.name, _hash_file(file_path)) for file_path in files]


def _batch_hash(file_hashes: list[tuple[str, str]]) -> str:
    payload = "\n".join(f"{name}:{value}" for name, value in file_hashes).encode("utf-8")
    return _sha256_bytes(payload)


def _utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


class TrustService:
    def __init__(self) -> None:
        TRUST_DIR.mkdir(parents=True, exist_ok=True)
        self.db_path = TRUST_DB
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS trust_anchor (
                    snapshot_date TEXT PRIMARY KEY,
                    source_path TEXT NOT NULL,
                    file_count INTEGER NOT NULL,
                    batch_hash TEXT NOT NULL,
                    previous_chain_hash TEXT NOT NULL,
                    chain_hash TEXT NOT NULL,
                    anchored_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS trust_file_hash (
                    snapshot_date TEXT NOT NULL,
                    file_name TEXT NOT NULL,
                    file_hash TEXT NOT NULL,
                    PRIMARY KEY (snapshot_date, file_name)
                )
                """
            )
            conn.commit()

    def _last_anchor(self) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT snapshot_date, chain_hash
                FROM trust_anchor
                WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM trust_anchor)
                """
            ).fetchone()
            return dict(row) if row else None

    def list_anchors(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT snapshot_date, source_path, file_count, batch_hash, previous_chain_hash, chain_hash, anchored_at
                FROM trust_anchor
                ORDER BY snapshot_date DESC
                """,
            ).fetchall()
            return [dict(row) for row in rows]

    def anchor_snapshot(self, snapshot_date: str, snapshot_path: str | None = None) -> dict[str, Any]:
        path = Path(snapshot_path) if snapshot_path else XML_ROOT / snapshot_date
        file_hashes = _snapshot_file_hashes(path)
        if not file_hashes:
            return {
                "snapshot_date": snapshot_date,
                "source_path": str(path),
                "anchored": False,
                "reason": "No XML files found for snapshot.",
            }

        batch_hash = _batch_hash(file_hashes)
        previous = self._last_anchor()
        previous_chain_hash = previous["chain_hash"] if previous else "GENESIS"
        chain_hash_payload = f"{snapshot_date}|{batch_hash}|{len(file_hashes)}|{previous_chain_hash}".encode("utf-8")
        chain_hash = _sha256_bytes(chain_hash_payload)

        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO trust_anchor (
                    snapshot_date, source_path, file_count, batch_hash, previous_chain_hash, chain_hash, anchored_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                [snapshot_date, str(path), len(file_hashes), batch_hash, previous_chain_hash, chain_hash, _utc_now()],
            )
            conn.execute("DELETE FROM trust_file_hash WHERE snapshot_date = ?", [snapshot_date])
            conn.executemany(
                """
                INSERT INTO trust_file_hash (snapshot_date, file_name, file_hash)
                VALUES (?, ?, ?)
                """,
                [(snapshot_date, name, value) for name, value in file_hashes],
            )
            conn.commit()

        return {
            "snapshot_date": snapshot_date,
            "source_path": str(path),
            "file_count": len(file_hashes),
            "batch_hash": batch_hash,
            "previous_chain_hash": previous_chain_hash,
            "chain_hash": chain_hash,
            "anchored": True,
        }

    def verify_snapshot(self, snapshot_date: str, snapshot_path: str | None = None) -> dict[str, Any]:
        path = Path(snapshot_path) if snapshot_path else XML_ROOT / snapshot_date
        file_hashes = _snapshot_file_hashes(path)
        if not file_hashes:
            return {
                "snapshot_date": snapshot_date,
                "verified": False,
                "reason": "No XML files found for snapshot.",
            }

        current_batch_hash = _batch_hash(file_hashes)
        with self._connect() as conn:
            anchor = conn.execute(
                """
                SELECT snapshot_date, source_path, file_count, batch_hash, previous_chain_hash, chain_hash, anchored_at
                FROM trust_anchor
                WHERE snapshot_date = ?
                """,
                [snapshot_date],
            ).fetchone()
            if not anchor:
                return {
                    "snapshot_date": snapshot_date,
                    "verified": False,
                    "reason": "No anchor found for snapshot.",
                }
            anchor_map = dict(anchor)

            previous = conn.execute(
                """
                SELECT chain_hash
                FROM trust_anchor
                WHERE snapshot_date = (
                    SELECT MAX(snapshot_date)
                    FROM trust_anchor
                    WHERE snapshot_date < ?
                )
                """,
                [snapshot_date],
            ).fetchone()
            expected_previous = previous["chain_hash"] if previous else "GENESIS"

        chain_hash_payload = (
            f"{snapshot_date}|{anchor_map['batch_hash']}|{anchor_map['file_count']}|{expected_previous}".encode("utf-8")
        )
        expected_chain_hash = _sha256_bytes(chain_hash_payload)
        batch_match = current_batch_hash == anchor_map["batch_hash"]
        chain_match = expected_chain_hash == anchor_map["chain_hash"]

        return {
            "snapshot_date": snapshot_date,
            "source_path": str(path),
            "verified": bool(batch_match and chain_match),
            "batch_hash_match": batch_match,
            "chain_hash_match": chain_match,
            "expected_batch_hash": anchor_map["batch_hash"],
            "current_batch_hash": current_batch_hash,
            "expected_chain_hash": anchor_map["chain_hash"],
            "recomputed_chain_hash": expected_chain_hash,
            "anchored_at": anchor_map["anchored_at"],
        }

    def anchor_latest_snapshot(self) -> dict[str, Any]:
        if not XML_ROOT.exists():
            return {"anchored": False, "reason": f"XML root not found: {XML_ROOT}"}
        dates = sorted([d.name for d in XML_ROOT.iterdir() if d.is_dir()], reverse=True)
        if not dates:
            return {"anchored": False, "reason": "No snapshot directory found in XML root."}
        return self.anchor_snapshot(dates[0], str(XML_ROOT / dates[0]))


trust_service = TrustService()
