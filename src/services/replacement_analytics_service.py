"""Replacement analytics — modules remplacés par type, timeline, top changements."""

from __future__ import annotations

from typing import Any

import pandas as pd

from src.services.data_service import FilterContext, _append_in_filter, _in_clause, query
from src.services.vendor_lake import resolve_lake_paths


def _equipment_scope(ctx: FilterContext) -> tuple[str, list[Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    dates = sorted(ctx.effective_dates or ctx.selected_dates)
    _append_in_filter(clauses, params, "CAST(snapshot_date AS VARCHAR)", dates)
    _append_in_filter(clauses, params, "CAST(source_file AS VARCHAR)", ctx.selected_files)
    _append_in_filter(clauses, params, "CAST(site_id AS VARCHAR)", ctx.selected_sites)
    if not clauses:
        return "", []
    return " AND ".join(clauses), params


def _replacements_between_dates(ctx: FilterContext, date_from: str, date_to: str) -> pd.DataFrame:
    paths = resolve_lake_paths(ctx.vendor)
    scope_sql, scope_params = _equipment_scope(ctx)
    if not scope_sql:
        return pd.DataFrame()

    sql = f"""
    WITH from_rows AS (
        SELECT
            CAST(object_type AS VARCHAR) AS object_type,
            CAST(site_id AS VARCHAR) AS site_id,
            TRIM(CAST(serial_number AS VARCHAR)) AS serial_number,
            COALESCE(SUM(nb_equipment), 0) AS qty
        FROM read_parquet('{paths.equipment}')
        WHERE CAST(snapshot_date AS VARCHAR) = ? AND {scope_sql}
          AND serial_number IS NOT NULL AND TRIM(CAST(serial_number AS VARCHAR)) <> ''
        GROUP BY 1, 2, 3
    ),
    to_rows AS (
        SELECT
            CAST(object_type AS VARCHAR) AS object_type,
            CAST(site_id AS VARCHAR) AS site_id,
            TRIM(CAST(serial_number AS VARCHAR)) AS serial_number,
            COALESCE(SUM(nb_equipment), 0) AS qty
        FROM read_parquet('{paths.equipment}')
        WHERE CAST(snapshot_date AS VARCHAR) = ? AND {scope_sql}
          AND serial_number IS NOT NULL AND TRIM(CAST(serial_number AS VARCHAR)) <> ''
        GROUP BY 1, 2, 3
    ),
    removed AS (
        SELECT f.object_type, f.site_id, f.serial_number
        FROM from_rows f
        LEFT JOIN to_rows t
          ON f.object_type = t.object_type AND f.site_id = t.site_id AND f.serial_number = t.serial_number
        WHERE t.serial_number IS NULL
    ),
    added AS (
        SELECT t.object_type, t.site_id, t.serial_number
        FROM to_rows t
        LEFT JOIN from_rows f
          ON t.object_type = f.object_type AND t.site_id = f.site_id AND t.serial_number = f.serial_number
        WHERE f.serial_number IS NULL
    )
    SELECT object_type, 'removed' AS change_kind, COUNT(*) AS change_count
    FROM removed GROUP BY 1
    UNION ALL
    SELECT object_type, 'added' AS change_kind, COUNT(*) AS change_count
    FROM added GROUP BY 1
    ORDER BY object_type, change_kind
    """
    params = [date_from, *scope_params, date_to, *scope_params]
    return query(sql, params)


class ReplacementAnalyticsService:
    def get_page(self, ctx: FilterContext, compare_date_1: str = "", compare_date_2: str = "") -> dict[str, Any]:
        paths = resolve_lake_paths(ctx.vendor)
        if not paths.has_sites_data:
            return self._empty(ctx, reason="vendor_lake_empty")

        dates = sorted(ctx.effective_dates or ctx.selected_dates)
        if len(dates) < 2 and not (compare_date_1 and compare_date_2):
            return self._empty(ctx, reason="need_two_snapshots")

        d1 = compare_date_1 or dates[0]
        d2 = compare_date_2 or dates[-1]
        if d1 > d2:
            d1, d2 = d2, d1

        between = _replacements_between_dates(ctx, d1, d2)
        by_type: dict[str, dict[str, int]] = {}
        for row in between.to_dict(orient="records"):
            obj = str(row.get("object_type") or "unknown")
            kind = str(row.get("change_kind") or "")
            count = int(row.get("change_count") or 0)
            bucket = by_type.setdefault(obj, {"removed": 0, "added": 0, "net": 0})
            bucket[kind] = count
            bucket["net"] = bucket.get("added", 0) - bucket.get("removed", 0)

        compare_rows = [
            {
                "object_type": obj,
                "modules_removed": vals["removed"],
                "modules_added": vals["added"],
                "net_change": vals["net"],
                "compare_date_from": d1,
                "compare_date_to": d2,
            }
            for obj, vals in sorted(by_type.items(), key=lambda item: item[1]["removed"], reverse=True)
        ]

        timeline = self._timeline(ctx, dates)
        top_changes = self._top_changes(ctx, d1, d2)

        return {
            "vendor": ctx.vendor,
            "summary": {
                "compare_date_from": d1,
                "compare_date_to": d2,
                "total_removed": sum(r["modules_removed"] for r in compare_rows),
                "total_added": sum(r["modules_added"] for r in compare_rows),
                "object_types_impacted": len(compare_rows),
                "snapshots_in_scope": len(dates),
            },
            "by_type_between_periods": compare_rows,
            "timeline_by_type": timeline,
            "top_changes": top_changes,
        }

    def _timeline(self, ctx: FilterContext, dates: list[str]) -> list[dict[str, Any]]:
        if len(dates) < 2:
            return []
        rows: list[dict[str, Any]] = []
        for index in range(1, len(dates)):
            prev_date, curr_date = dates[index - 1], dates[index]
            frame = _replacements_between_dates(ctx, prev_date, curr_date)
            for record in frame.to_dict(orient="records"):
                if str(record.get("change_kind")) != "removed":
                    continue
                rows.append(
                    {
                        "snapshot_date": curr_date,
                        "previous_snapshot": prev_date,
                        "object_type": record.get("object_type"),
                        "replacements": int(record.get("change_count") or 0),
                    }
                )
        return rows

    def _top_changes(self, ctx: FilterContext, d1: str, d2: str) -> list[dict[str, Any]]:
        paths = resolve_lake_paths(ctx.vendor)
        scope_sql, scope_params = _equipment_scope(ctx)
        if not scope_sql:
            return []

        sql = f"""
        WITH from_rows AS (
            SELECT CAST(site_id AS VARCHAR) AS site_id, CAST(object_type AS VARCHAR) AS object_type,
                   TRIM(CAST(serial_number AS VARCHAR)) AS serial_number
            FROM read_parquet('{paths.equipment}')
            WHERE CAST(snapshot_date AS VARCHAR) = ? AND {scope_sql}
              AND serial_number IS NOT NULL AND TRIM(CAST(serial_number AS VARCHAR)) <> ''
        ),
        to_rows AS (
            SELECT CAST(site_id AS VARCHAR) AS site_id, CAST(object_type AS VARCHAR) AS object_type,
                   TRIM(CAST(serial_number AS VARCHAR)) AS serial_number
            FROM read_parquet('{paths.equipment}')
            WHERE CAST(snapshot_date AS VARCHAR) = ? AND {scope_sql}
              AND serial_number IS NOT NULL AND TRIM(CAST(serial_number AS VARCHAR)) <> ''
        ),
        removed AS (
            SELECT f.site_id, f.object_type, f.serial_number
            FROM from_rows f
            LEFT JOIN to_rows t ON f.site_id = t.site_id AND f.object_type = t.object_type AND f.serial_number = t.serial_number
            WHERE t.serial_number IS NULL
        )
        SELECT site_id, object_type, COUNT(*) AS replacements
        FROM removed
        GROUP BY site_id, object_type
        ORDER BY replacements DESC
        LIMIT 25
        """
        params = [d1, *scope_params, d2, *scope_params]
        df = query(sql, params)
        return df.to_dict(orient="records")

    def _empty(self, ctx: FilterContext, reason: str) -> dict[str, Any]:
        return {
            "vendor": ctx.vendor,
            "reason": reason,
            "summary": {
                "compare_date_from": "",
                "compare_date_to": "",
                "total_removed": 0,
                "total_added": 0,
                "object_types_impacted": 0,
                "snapshots_in_scope": 0,
            },
            "by_type_between_periods": [],
            "timeline_by_type": [],
            "top_changes": [],
        }


replacement_analytics_service = ReplacementAnalyticsService()
