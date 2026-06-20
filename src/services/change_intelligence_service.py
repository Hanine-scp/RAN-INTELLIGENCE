"""Change Intelligence Engine — J-1 vs J change_events with replacement scoring."""

from __future__ import annotations

import json
import uuid
from typing import Any

import pandas as pd

from src.parsers.nokia_parser import FINAL_EQUIPMENT_TYPES
from src.services.data_service import FilterContext, _append_in_filter, query
from src.services.guardian_database import guardian_connect, init_guardian_schema, utc_now
from src.services.vendor_lake import normalize_snapshot_date, resolve_lake_paths

_FINAL_TYPES_SQL = ", ".join(f"'{t}'" for t in sorted(FINAL_EQUIPMENT_TYPES))
CELL_METRICS = [
    ("old_2g", "new_2g", "2G", "cells_2g"),
    ("old_3g", "new_3g", "3G", "cells_3g"),
    ("old_4g", "new_4g", "4G", "cells_lte_4g"),
    ("old_5g", "new_5g", "5G", "cells_5g"),
]


def _new_event_id() -> str:
    return str(uuid.uuid4())


def _replacement_score(
    *,
    same_site: bool,
    same_parent: bool,
    same_object_type: bool,
    temporal_proximity: bool,
    similar_config: bool,
    old_missing_new_created: bool,
) -> float:
    score = 0.0
    if same_site:
        score += 0.30
    if same_parent:
        score += 0.20
    if temporal_proximity:
        score += 0.20
    if similar_config:
        score += 0.15
    if old_missing_new_created:
        score += 0.15
    if same_object_type:
        score += 0.10
    return round(min(1.0, score), 3)


class ChangeIntelligenceService:
    def __init__(self) -> None:
        init_guardian_schema()

    def _site_scope(self, ctx: FilterContext, date: str) -> tuple[str, list[Any]]:
        clauses = ["CAST(snapshot_date AS VARCHAR) = ?"]
        params: list[Any] = [date]
        _append_in_filter(clauses, params, "CAST(source_file AS VARCHAR)", ctx.selected_files)
        _append_in_filter(clauses, params, "CAST(site_id AS VARCHAR)", ctx.selected_sites)
        return " AND ".join(clauses), params

    def detect_changes(
        self,
        date_from: str,
        date_to: str,
        *,
        vendor: str = "nokia",
        ctx: FilterContext | None = None,
        persist: bool = True,
    ) -> list[dict[str, Any]]:
        d1 = normalize_snapshot_date(date_from)
        d2 = normalize_snapshot_date(date_to)
        if d1 == d2:
            return []

        empty_ctx = FilterContext(
            selected_dates=[],
            selected_files=[],
            selected_sites=[],
            selected_file_dates=[],
            effective_dates=[d1, d2],
            vendor=vendor,
        )
        ctx = ctx or empty_ctx
        lake = resolve_lake_paths(vendor)
        events: list[dict[str, Any]] = []

        site_where_1, site_params_1 = self._site_scope(ctx, d1)
        site_where_2, site_params_2 = self._site_scope(ctx, d2)

        site_diff = query(
            f"""
            WITH s1 AS (
                SELECT DISTINCT CAST(site_id AS VARCHAR) AS site_id
                FROM read_parquet('{lake.sites}')
                WHERE {site_where_1}
            ),
            s2 AS (
                SELECT DISTINCT CAST(site_id AS VARCHAR) AS site_id
                FROM read_parquet('{lake.sites}')
                WHERE {site_where_2}
            )
            SELECT 'CREATED' AS change_type, s2.site_id, NULL AS old_value, s2.site_id AS new_value
            FROM s2 LEFT JOIN s1 ON s1.site_id = s2.site_id WHERE s1.site_id IS NULL
            UNION ALL
            SELECT 'DELETED', s1.site_id, s1.site_id, NULL
            FROM s1 LEFT JOIN s2 ON s1.site_id = s2.site_id WHERE s2.site_id IS NULL
            """,
            [*site_params_1, *site_params_2],
        )

        for row in site_diff.to_dict(orient="records"):
            events.append(
                self._build_event(
                    snapshot_date=d2,
                    compare_date=d1,
                    vendor=vendor,
                    entity_type="SITE",
                    entity_id=str(row["site_id"]),
                    parent_site_id=str(row["site_id"]),
                    change_type=str(row["change_type"]),
                    old_value=row.get("old_value"),
                    new_value=row.get("new_value"),
                    severity="high" if row["change_type"] == "DELETED" else "medium",
                    confidence=0.95,
                    evidence={
                        "date_from": d1,
                        "date_to": d2,
                        "detector": "site_set_diff",
                    },
                )
            )

        site_cells = query(
            f"""
            WITH dedup AS (
                SELECT
                    CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                    CAST(site_id AS VARCHAR) AS site_id,
                    MAX(COALESCE(nb_cells_2g, 0)) AS cells_2g,
                    MAX(COALESCE(nb_cells_3g, 0)) AS cells_3g,
                    MAX(COALESCE(nb_cells_lte_4g, 0)) AS cells_lte_4g,
                    MAX(COALESCE(nb_cells_5g, 0)) AS cells_5g
                FROM read_parquet('{lake.sites}')
                WHERE CAST(snapshot_date AS VARCHAR) IN (?, ?)
                GROUP BY 1, 2
            ),
            s1 AS (SELECT * FROM dedup WHERE snapshot_date = ?),
            s2 AS (SELECT * FROM dedup WHERE snapshot_date = ?)
            SELECT
                COALESCE(s2.site_id, s1.site_id) AS site_id,
                s1.cells_2g AS old_2g, s2.cells_2g AS new_2g,
                s1.cells_3g AS old_3g, s2.cells_3g AS new_3g,
                s1.cells_lte_4g AS old_4g, s2.cells_lte_4g AS new_4g,
                s1.cells_5g AS old_5g, s2.cells_5g AS new_5g
            FROM s1
            FULL OUTER JOIN s2 ON s1.site_id = s2.site_id
            """,
            [d1, d2, d1, d2],
        )

        for row in site_cells.to_dict(orient="records"):
            site_id = str(row.get("site_id") or "")
            if not site_id:
                continue
            for old_key, new_key, techno, metric_col in CELL_METRICS:
                old_val = int(row.get(old_key) or 0)
                new_val = int(row.get(new_key) or 0)
                if old_val == new_val:
                    continue
                if new_val > old_val:
                    ctype = "CREATED"
                elif new_val < old_val:
                    ctype = "DELETED"
                else:
                    ctype = "MODIFIED"
                events.append(
                    self._build_event(
                        snapshot_date=d2,
                        compare_date=d1,
                        vendor=vendor,
                        entity_type="CELL",
                        entity_id=f"{site_id}:{techno}",
                        parent_site_id=site_id,
                        change_type=ctype,
                        old_value=str(old_val),
                        new_value=str(new_val),
                        severity="high" if ctype == "DELETED" else "medium",
                        confidence=0.88,
                        evidence={
                            "technology": techno,
                            "metric": metric_col,
                            "date_from": d1,
                            "date_to": d2,
                            "cell_classes": {
                                "2G": "com.nokia.srbts.gsm:GNCEL",
                                "3G": "com.nokia.srbts.wcdma:WNCEL",
                                "4G": "NOKLTE:LNCEL/LNCEL_FDD/LNCEL_TDD",
                                "5G": "com.nokia.srbts.nrbts:NRCELL",
                            }.get(techno),
                        },
                    )
                )

        eq_clauses = ["CAST(snapshot_date AS VARCHAR) IN (?, ?)"]
        eq_params: list[Any] = [d1, d2]
        _append_in_filter(eq_clauses, eq_params, "CAST(site_id AS VARCHAR)", ctx.selected_sites)
        eq_where = " AND ".join(eq_clauses)

        eq_diff = query(
            f"""
            WITH scoped AS (
                SELECT
                    CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                    CAST(site_id AS VARCHAR) AS site_id,
                    CAST(object_type AS VARCHAR) AS object_type,
                    CAST(id AS VARCHAR) AS id,
                    TRIM(CAST(serial_number AS VARCHAR)) AS serial_number,
                    TRIM(CAST(product_code AS VARCHAR)) AS product_code,
                    TRIM(CAST(product_name AS VARCHAR)) AS product_name,
                    COALESCE(nb_equipment, 1) AS nb_equipment
                FROM read_parquet('{lake.equipment}')
                WHERE {eq_where}
                  AND UPPER(CAST(object_type AS VARCHAR)) IN ({_FINAL_TYPES_SQL})
            ),
            e1 AS (SELECT * FROM scoped WHERE snapshot_date = ?),
            e2 AS (SELECT * FROM scoped WHERE snapshot_date = ?)
            SELECT 'CREATED' AS change_type, e2.*
            FROM e2 LEFT JOIN e1 ON e1.site_id=e2.site_id AND e1.object_type=e2.object_type AND e1.id=e2.id
            WHERE e1.id IS NULL
            UNION ALL
            SELECT 'DELETED', e1.*
            FROM e1 LEFT JOIN e2 ON e1.site_id=e2.site_id AND e1.object_type=e2.object_type AND e1.id=e2.id
            WHERE e2.id IS NULL
            """,
            [*eq_params, d1, d2],
        )

        created_by_site: dict[str, list[dict]] = {}
        deleted_by_site: dict[str, list[dict]] = {}
        for row in eq_diff.to_dict(orient="records"):
            site_id = str(row.get("site_id") or "")
            ctype = str(row.get("change_type"))
            bucket = created_by_site if ctype == "CREATED" else deleted_by_site
            bucket.setdefault(site_id, []).append(row)

            events.append(
                self._build_event(
                    snapshot_date=d2,
                    compare_date=d1,
                    vendor=vendor,
                    entity_type="EQUIPMENT",
                    entity_id=str(row.get("id") or ""),
                    parent_site_id=site_id,
                    change_type=ctype,
                    old_value=str(row.get("serial_number") or "") if ctype == "DELETED" else None,
                    new_value=str(row.get("serial_number") or "") if ctype == "CREATED" else None,
                    severity="medium",
                    confidence=0.92,
                    evidence={
                        "object_type": row.get("object_type"),
                        "serial_number": row.get("serial_number"),
                        "product_code": row.get("product_code"),
                        "product_name": row.get("product_name"),
                        "nb_equipment": row.get("nb_equipment"),
                        "date_from": d1,
                        "date_to": d2,
                    },
                )
            )

        for site_id, removed_rows in deleted_by_site.items():
            added_rows = created_by_site.get(site_id, [])
            for old_row in removed_rows:
                best_score = 0.0
                best_new = None
                for new_row in added_rows:
                    score = _replacement_score(
                        same_site=True,
                        same_parent=True,
                        same_object_type=str(old_row.get("object_type")) == str(new_row.get("object_type")),
                        temporal_proximity=True,
                        similar_config=str(old_row.get("product_code") or "") == str(new_row.get("product_code") or ""),
                        old_missing_new_created=True,
                    )
                    if score > best_score:
                        best_score = score
                        best_new = new_row
                if best_score >= 0.65 and best_new:
                    events.append(
                        self._build_event(
                            snapshot_date=d2,
                            compare_date=d1,
                            vendor=vendor,
                            entity_type="EQUIPMENT",
                            entity_id=f"{old_row.get('id')}->{best_new.get('id')}",
                            parent_site_id=site_id,
                            change_type="REPLACED",
                            old_value=str(old_row.get("id")),
                            new_value=str(best_new.get("id")),
                            severity="high" if best_score >= 0.8 else "medium",
                            confidence=best_score,
                            replacement_score=best_score,
                            evidence={
                                "old_module": {
                                    "id": old_row.get("id"),
                                    "object_type": old_row.get("object_type"),
                                    "serial_number": old_row.get("serial_number"),
                                    "product_code": old_row.get("product_code"),
                                },
                                "new_module": {
                                    "id": best_new.get("id"),
                                    "object_type": best_new.get("object_type"),
                                    "serial_number": best_new.get("serial_number"),
                                    "product_code": best_new.get("product_code"),
                                },
                                "replacement_score": best_score,
                                "impact": "Vérifier cellules liées et compteurs post-remplacement.",
                                "date_from": d1,
                                "date_to": d2,
                            },
                        )
                    )

        if persist:
            self._persist_events(events, d2, d1, vendor)
        return events

    def _build_event(
        self,
        *,
        snapshot_date: str,
        compare_date: str,
        vendor: str,
        entity_type: str,
        entity_id: str,
        parent_site_id: str | None,
        change_type: str,
        old_value: Any,
        new_value: Any,
        severity: str,
        confidence: float,
        evidence: dict,
        replacement_score: float | None = None,
    ) -> dict[str, Any]:
        return {
            "event_id": _new_event_id(),
            "snapshot_date": snapshot_date,
            "compare_date": compare_date,
            "vendor": vendor,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "parent_site_id": parent_site_id,
            "change_type": change_type,
            "old_value": old_value,
            "new_value": new_value,
            "severity": severity,
            "confidence": confidence,
            "replacement_score": replacement_score,
            "evidence_json": json.dumps(evidence, ensure_ascii=False),
            "created_at": utc_now(),
        }

    def _persist_events(self, events: list[dict[str, Any]], snapshot_date: str, compare_date: str, vendor: str) -> None:
        with guardian_connect() as conn:
            conn.execute(
                "DELETE FROM change_events WHERE snapshot_date = ? AND compare_date = ? AND vendor = ?",
                [snapshot_date, compare_date, vendor],
            )
            for event in events:
                conn.execute(
                    """
                    INSERT INTO change_events (
                        event_id, snapshot_date, compare_date, vendor, entity_type, entity_id,
                        parent_site_id, change_type, old_value, new_value, severity, confidence,
                        replacement_score, evidence_json, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        event["event_id"],
                        event["snapshot_date"],
                        event["compare_date"],
                        event["vendor"],
                        event["entity_type"],
                        event["entity_id"],
                        event["parent_site_id"],
                        event["change_type"],
                        event["old_value"],
                        event["new_value"],
                        event["severity"],
                        event["confidence"],
                        event.get("replacement_score"),
                        event["evidence_json"],
                        event["created_at"],
                    ],
                )
            conn.commit()

    def get_change_events(
        self,
        snapshot_date: str | None = None,
        *,
        site_id: str | None = None,
        entity_type: str | None = None,
        change_type: str | None = None,
        vendor: str = "nokia",
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        clauses = ["vendor = ?"]
        params: list[Any] = [vendor]
        if snapshot_date:
            clauses.append("snapshot_date = ?")
            params.append(normalize_snapshot_date(snapshot_date))
        if site_id:
            clauses.append("parent_site_id = ?")
            params.append(site_id)
        if entity_type:
            clauses.append("entity_type = ?")
            params.append(entity_type.upper())
        if change_type:
            clauses.append("change_type = ?")
            params.append(change_type.upper())

        with guardian_connect() as conn:
            rows = conn.execute(
                f"""
                SELECT * FROM change_events
                WHERE {' AND '.join(clauses)}
                ORDER BY
                    CASE severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                    change_type, parent_site_id
                LIMIT ?
                """,
                [*params, limit],
            ).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            try:
                item["evidence"] = json.loads(item.pop("evidence_json") or "{}")
            except json.JSONDecodeError:
                item["evidence"] = {}
            result.append(item)
        return result

    def compare_snapshots(self, date_a: str, date_b: str, vendor: str = "nokia") -> dict[str, Any]:
        events = self.detect_changes(date_a, date_b, vendor=vendor, persist=True)
        summary = {
            "sites_created": sum(1 for e in events if e["entity_type"] == "SITE" and e["change_type"] == "CREATED"),
            "sites_deleted": sum(1 for e in events if e["entity_type"] == "SITE" and e["change_type"] == "DELETED"),
            "cells_changed": sum(1 for e in events if e["entity_type"] == "CELL"),
            "equipment_created": sum(1 for e in events if e["entity_type"] == "EQUIPMENT" and e["change_type"] == "CREATED"),
            "equipment_deleted": sum(1 for e in events if e["entity_type"] == "EQUIPMENT" and e["change_type"] == "DELETED"),
            "equipment_replaced": sum(1 for e in events if e["change_type"] == "REPLACED"),
            "total_events": len(events),
        }
        return {
            "date_from": normalize_snapshot_date(date_a),
            "date_to": normalize_snapshot_date(date_b),
            "vendor": vendor,
            "summary": summary,
            "events": events[:200],
        }


change_intelligence_service = ChangeIntelligenceService()
