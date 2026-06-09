"""Serial pattern mining — préfixes communs, lots, corrélations."""

from __future__ import annotations

from typing import Any

from src.services.data_service import FilterContext, _append_in_filter, query
from src.services.vendor_lake import resolve_lake_paths


class SerialPatternsService:
    def investigate(self, ctx: FilterContext, prefix_length: int = 6, min_occurrences: int = 3) -> dict[str, Any]:
        paths = resolve_lake_paths(ctx.vendor)
        if not paths.has_sites_data:
            return {"available": False, "reason": "vendor_lake_empty", "patterns": [], "summary": {}}

        dates = sorted(ctx.effective_dates or ctx.selected_dates)
        clauses: list[str] = []
        params: list[Any] = []
        _append_in_filter(clauses, params, "CAST(snapshot_date AS VARCHAR)", dates)
        _append_in_filter(clauses, params, "CAST(site_id AS VARCHAR)", ctx.selected_sites)
        if not clauses:
            return {"available": False, "reason": "no_dates", "patterns": [], "summary": {}}

        prefix_len = max(3, min(12, int(prefix_length)))
        min_occ = max(2, int(min_occurrences))
        where = " AND ".join(clauses)

        df = query(
            f"""
            WITH base AS (
                SELECT
                    CAST(site_id AS VARCHAR) AS site_id,
                    CAST(object_type AS VARCHAR) AS object_type,
                    CAST(product_code AS VARCHAR) AS product_code,
                    TRIM(CAST(serial_number AS VARCHAR)) AS serial_number,
                    SUBSTRING(TRIM(CAST(serial_number AS VARCHAR)), 1, {prefix_len}) AS serial_prefix
                FROM read_parquet('{paths.equipment}')
                WHERE {where}
                  AND serial_number IS NOT NULL
                  AND TRIM(CAST(serial_number AS VARCHAR)) <> ''
            )
            SELECT
                serial_prefix,
                COUNT(*) AS occurrences,
                COUNT(DISTINCT site_id) AS sites_count,
                COUNT(DISTINCT object_type) AS object_types_count,
                COUNT(DISTINCT product_code) AS product_codes_count,
                MIN(serial_number) AS sample_serial_min,
                MAX(serial_number) AS sample_serial_max
            FROM base
            WHERE LENGTH(serial_prefix) >= 3
            GROUP BY serial_prefix
            HAVING COUNT(*) >= ?
            ORDER BY occurrences DESC, sites_count DESC
            LIMIT 50
            """,
            [*params, min_occ],
        )

        patterns = df.to_dict(orient="records")
        narrative_fr = (
            f"{len(patterns)} préfixe(s) serial récurrent(s) détecté(s) (longueur {prefix_len}, min {min_occ} occurrences)."
            if patterns
            else "Aucun pattern serial significatif sur la sélection."
        )
        narrative_en = (
            f"{len(patterns)} recurring serial prefix pattern(s) detected (length {prefix_len}, min {min_occ} hits)."
            if patterns
            else "No significant serial pattern on current selection."
        )

        return {
            "available": True,
            "vendor": ctx.vendor,
            "prefix_length": prefix_len,
            "min_occurrences": min_occ,
            "summary": {
                "patterns_found": len(patterns),
                "top_prefix": str(patterns[0].get("serial_prefix") if patterns else ""),
                "top_occurrences": int(patterns[0].get("occurrences") if patterns else 0),
            },
            "patterns": patterns,
            "narrative": {"fr": narrative_fr, "en": narrative_en},
        }


serial_patterns_service = SerialPatternsService()
