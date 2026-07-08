import os
import re
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import duckdb
import pandas as pd

from src.parsers.nokia_parser import FINAL_EQUIPMENT_TYPES
from src.parsers.parsed_values import duckdb_field_is_missing
from src.services.vendor_lake import (
    DATA_ROOT,
    count_xml_files,
    discover_xml_snapshots,
    list_xml_file_options,
    normalize_snapshot_date,
    resolve_lake_paths,
    set_active_vendor,
)

_FINAL_EQUIPMENT_SQL = ", ".join(f"'{value}'" for value in sorted(FINAL_EQUIPMENT_TYPES))

_QUERY_TIMINGS_MS: deque[float] = deque(maxlen=300)
_QUERY_LABELED_MS: deque[tuple[str, float]] = deque(maxlen=500)
_DUCK_LOCK = threading.Lock()
_DUCK_CONN: duckdb.DuckDBPyConnection | None = None
_QUERY_TIMEOUT_MS = int(os.getenv("DUCKDB_QUERY_TIMEOUT_MS", "30000"))
_DUCKDB_THREADS = int(os.getenv("DUCKDB_THREADS", "0"))


def _get_duck_conn() -> duckdb.DuckDBPyConnection:
    global _DUCK_CONN
    if _DUCK_CONN is None:
        _DUCK_CONN = duckdb.connect(database=":memory:")
        if _DUCKDB_THREADS > 0:
            _DUCK_CONN.execute(f"SET threads TO {_DUCKDB_THREADS}")
    return _DUCK_CONN


def _percentile_ms(values: list[float], ratio: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = min(len(ordered) - 1, int(ratio * (len(ordered) - 1)))
    return float(ordered[idx])


def _lake():
    return resolve_lake_paths()


@dataclass
class FilterContext:
    selected_dates: list[str]
    selected_files: list[str]
    selected_sites: list[str]
    selected_file_dates: list[str]
    effective_dates: list[str]
    site_search: str = ""
    date_search: str = ""
    period_start: str = ""
    period_end: str = ""
    smart_missing_serial: bool = False
    smart_duplicates: bool = False
    smart_critical_quality: bool = False
    language: str = "Français"
    vendor: str = "nokia"

    @classmethod
    def from_inputs(
        cls,
        *,
        selected_dates: list[str] | None = None,
        selected_files: list[str] | None = None,
        selected_sites: list[str] | None = None,
        selected_file_dates: list[str] | None = None,
        effective_dates: list[str] | None = None,
        site_search: str = "",
        date_search: str = "",
        period_start: str = "",
        period_end: str = "",
        smart_missing_serial: bool = False,
        smart_duplicates: bool = False,
        smart_critical_quality: bool = False,
        language: str = "Français",
        vendor: str = "nokia",
    ) -> "FilterContext":
        set_active_vendor(vendor)

        def normalize_site_value(value: str) -> str:
            normalized = value.strip()
            if "|" in normalized:
                parts = [part.strip() for part in normalized.split("|") if part.strip()]
                if len(parts) >= 2:
                    return parts[1]
            return normalized

        dates = [str(d) for d in (selected_dates or []) if str(d)]
        files = [str(f) for f in (selected_files or []) if str(f)]
        sites = [normalize_site_value(str(s)) for s in (selected_sites or []) if str(s)]
        file_dates = [str(d) for d in (selected_file_dates or []) if str(d)]
        effective = [str(d) for d in (effective_dates or []) if str(d)] or file_dates or dates
        if date_search:
            date_search_lower = date_search.lower()
            effective = [d for d in effective if date_search_lower in d.lower()]
        if period_start and period_end:
            effective = [d for d in effective if period_start <= d <= period_end]
        return cls(
            selected_dates=dates,
            selected_files=files,
            selected_sites=sites,
            selected_file_dates=file_dates,
            effective_dates=effective,
            site_search=site_search or "",
            date_search=date_search or "",
            period_start=period_start or "",
            period_end=period_end or "",
            smart_missing_serial=bool(smart_missing_serial),
            smart_duplicates=bool(smart_duplicates),
            smart_critical_quality=bool(smart_critical_quality),
            language=language,
            vendor=(vendor or "nokia").lower(),
        )


def _in_clause(values: list[str]) -> tuple[str, list[Any]]:
    placeholders = ", ".join(["?"] * len(values))
    return f"({placeholders})", values


def _append_in_filter(clauses: list[str], params: list[Any], column: str, values: list[str]) -> None:
    if not values:
        return
    clause, clause_params = _in_clause(values)
    clauses.append(f"{column} IN {clause}")
    params.extend(clause_params)


def lake_ready(vendor: str | None = None) -> bool:
    return resolve_lake_paths(vendor).has_sites_data


def query(sql: str, params: list[Any] | None = None, *, label: str = "generic") -> pd.DataFrame:
    lake = _lake()
    if not lake.has_sites_data and "read_parquet" in sql.lower():
        return pd.DataFrame()

    start = time.perf_counter()
    try:
        with _DUCK_LOCK:
            con = _get_duck_conn()
            if params:
                result = con.execute(sql, params).fetchdf()
            else:
                result = con.execute(sql).fetchdf()
    except duckdb.IOException as exc:
        if "No files found" in str(exc):
            return pd.DataFrame()
        raise
    except duckdb.Error as exc:
        if "timeout" in str(exc).lower() or "interrupted" in str(exc).lower():
            raise TimeoutError(f"Query timed out after {_QUERY_TIMEOUT_MS}ms ({label})") from exc
        raise

    elapsed_ms = (time.perf_counter() - start) * 1000
    _QUERY_TIMINGS_MS.append(elapsed_ms)
    _QUERY_LABELED_MS.append((label, elapsed_ms))
    return result


def get_query_observability() -> dict[str, Any]:
    if not _QUERY_TIMINGS_MS:
        return {
            "samples": 0,
            "avg_ms": 0.0,
            "p50_ms": 0.0,
            "p95_ms": 0.0,
            "p99_ms": 0.0,
            "max_ms": 0.0,
            "slowest_labels": [],
        }
    samples = list(_QUERY_TIMINGS_MS)
    by_label: dict[str, list[float]] = defaultdict(list)
    for label, duration in _QUERY_LABELED_MS:
        by_label[label].append(duration)
    slowest_labels = sorted(
        (
            {
                "label": label,
                "count": len(durations),
                "avg_ms": round(sum(durations) / len(durations), 2),
                "p95_ms": round(_percentile_ms(durations, 0.95), 2),
                "max_ms": round(max(durations), 2),
            }
            for label, durations in by_label.items()
        ),
        key=lambda row: row["p95_ms"],
        reverse=True,
    )[:10]
    return {
        "samples": float(len(samples)),
        "avg_ms": round(sum(samples) / len(samples), 2),
        "p50_ms": round(_percentile_ms(samples, 0.5), 2),
        "p95_ms": round(_percentile_ms(samples, 0.95), 2),
        "p99_ms": round(_percentile_ms(samples, 0.99), 2),
        "max_ms": round(float(max(samples)), 2),
        "timeout_ms": float(_QUERY_TIMEOUT_MS),
        "slowest_labels": slowest_labels,
    }


def get_snapshot_dates() -> list[str]:
    xml_dates = [str(s["snapshot_date"]) for s in discover_xml_snapshots()]
    if xml_dates:
        return xml_dates

    df = query(
        f"""
        SELECT DISTINCT CAST(snapshot_date AS VARCHAR) AS snapshot_date
        FROM read_parquet('{_lake().sites}')
        ORDER BY snapshot_date DESC
        """
    )
    return [normalize_snapshot_date(d) for d in df["snapshot_date"].tolist()]


def get_site_kpis(snapshot_date: str) -> pd.Series:
    return query(
        f"""
        SELECT
            COUNT(DISTINCT site_id) AS total_sites,
            COALESCE(SUM(CASE WHEN LOWER(site_state) = 'active' THEN 1 ELSE 0 END), 0) AS active_sites,
            COALESCE(SUM(CASE WHEN LOWER(site_state) = 'blocked' THEN 1 ELSE 0 END), 0) AS blocked_sites,
            COALESCE(SUM(nb_cells_2g), 0) AS cells_2g,
            COALESCE(SUM(nb_cells_3g), 0) AS cells_3g,
            COALESCE(SUM(nb_cells_lte_4g), 0) AS cells_4g,
            COALESCE(SUM(nb_cells_5g), 0) AS cells_5g
        FROM read_parquet('{_lake().sites}')
        WHERE CAST(snapshot_date AS VARCHAR) = ?
        """,
        [snapshot_date],
    ).iloc[0]


def get_equipment_kpis(snapshot_date: str) -> pd.Series:
    return query(
        f"""
        SELECT COALESCE(SUM(nb_equipment), 0) AS total_equipment
        FROM read_parquet('{_lake().equipment}')
        WHERE CAST(snapshot_date AS VARCHAR) = ?
        """,
        [snapshot_date],
    ).iloc[0]


def get_sites(snapshot_date: str, search: str = "") -> pd.DataFrame:
    clauses = ["CAST(snapshot_date AS VARCHAR) = ?"]
    params: list[Any] = [snapshot_date]
    if search:
        like_term = f"%{search.lower()}%"
        clauses.append(
            """
            (
                LOWER(CAST(site_id AS VARCHAR)) LIKE ?
                OR LOWER(CAST(site_name AS VARCHAR)) LIKE ?
                OR LOWER(CAST(ip_address AS VARCHAR)) LIKE ?
                OR LOWER(CAST(sw_version AS VARCHAR)) LIKE ?
            )
            """.strip()
        )
        params.extend([like_term, like_term, like_term, like_term])

    return query(
        f"""
        SELECT
            site_id,
            site_name,
            site_state,
            ip_address,
            sw_version,
            COALESCE(nb_cells, 0) AS nb_cells,
            COALESCE(nb_cells_lte_fdd, 0) AS cells_4g_fdd,
            COALESCE(nb_cells_lte_tdd, 0) AS cells_4g_tdd,
            technologies,
            source_file
        FROM read_parquet('{_lake().sites}')
        WHERE {' AND '.join(clauses)}
        ORDER BY site_id
        """,
        params,
    )


def get_object_types(snapshot_date: str) -> list[str]:
    df = query(
        f"""
        SELECT DISTINCT object_type
        FROM read_parquet('{_lake().equipment}')
        WHERE CAST(snapshot_date AS VARCHAR) = ?
        ORDER BY
            CASE
                WHEN object_type = 'CABINET' THEN 10
                WHEN object_type = 'SMOD' THEN 20
                WHEN object_type = 'RMOD' THEN 30
                WHEN object_type = 'BBMOD' THEN 40
                WHEN object_type = 'RETU' THEN 90
                WHEN object_type = 'ALD' THEN 91
                WHEN object_type = 'ANTL' THEN 92
                ELSE 50
            END,
            object_type
        """,
        [snapshot_date],
    )
    return df["object_type"].tolist()


def get_equipment(snapshot_date: str, object_types: list[str] | None = None) -> pd.DataFrame:
    clauses = ["CAST(snapshot_date AS VARCHAR) = ?"]
    params: list[Any] = [snapshot_date]
    if object_types:
        _append_in_filter(clauses, params, "object_type", object_types)

    return query(
        f"""
        SELECT
            site_id,
            object_type,
            id,
            serial_number,
            product_code,
            product_name,
            nb_equipment,
            source_file
        FROM read_parquet('{_lake().equipment}')
        WHERE {' AND '.join(clauses)}
        ORDER BY
            site_id,
            CASE
                WHEN object_type = 'CABINET' THEN 10
                WHEN object_type = 'SMOD' THEN 20
                WHEN object_type = 'RMOD' THEN 30
                WHEN object_type = 'BBMOD' THEN 40
                WHEN object_type = 'RETU' THEN 90
                WHEN object_type = 'ALD' THEN 91
                WHEN object_type = 'ANTL' THEN 92
                ELSE 50
            END,
            object_type,
            id
        """,
        params,
    )


def get_delta_metrics() -> pd.DataFrame:
    if not Path(_lake().delta).exists():
        return pd.DataFrame()
    return query(
        f"""
        SELECT *
        FROM read_parquet('{_lake().delta}')
        ORDER BY metric
        """
    )


def get_site_changes() -> pd.DataFrame:
    if not Path(_lake().site_changes).exists():
        return pd.DataFrame()
    return query(
        f"""
        SELECT *
        FROM read_parquet('{_lake().site_changes}')
        ORDER BY change_type, site_id
        """
    )


def get_quality_report() -> pd.DataFrame:
    return query(
        f"""
        SELECT
            snapshot_date,
            site_id,
            object_type,
            total_rows,
            serial_missing,
            product_code_missing,
            product_name_missing,
            completeness_percent
        FROM read_parquet('{_lake().completeness}')
        ORDER BY completeness_percent ASC
        """
    )


class DataService:
    """Centralized business/query layer shared by API and Streamlit."""

    _COPILOT_ALLOWLIST: dict[str, set[str]] = {
        "sites": {"snapshot_date", "site_id", "site_name", "site_state", "ip_address", "sw_version", "technologies", "source_file"},
        "equipment": {"snapshot_date", "site_id", "object_type", "serial_number", "product_code", "product_name", "source_file"},
        "completeness": {"snapshot_date", "site_id", "object_type", "completeness_percent", "serial_missing", "product_code_missing", "product_name_missing"},
    }

    def get_filter_options(self, ctx: FilterContext) -> dict[str, Any]:
        lake = _lake()
        xml_snapshots = discover_xml_snapshots(ctx.vendor)
        date_options = [str(s["snapshot_date"]) for s in xml_snapshots] or get_snapshot_dates()

        total_sites = 0
        if lake.has_sites_data:
            total_sites_df = query(
                f"""
                SELECT COUNT(DISTINCT CAST(site_id AS VARCHAR) || '-' || CAST(snapshot_date AS VARCHAR)) AS total_sites
                FROM read_parquet('{lake.sites}')
                """,
                label="filter_options_total_sites",
            )
            total_sites = int(total_sites_df.iloc[0]["total_sites"]) if not total_sites_df.empty else 0
        if total_sites == 0:
            total_sites = count_xml_files(ctx.vendor)

        total_xml = count_xml_files(ctx.vendor)

        file_options: list[dict[str, str]] = []
        if ctx.selected_dates:
            file_options = list_xml_file_options(ctx.vendor, ctx.selected_dates)
            if not file_options and lake.has_sites_data:
                date_clause, date_params = _in_clause(
                    [normalize_snapshot_date(d) for d in ctx.selected_dates]
                )
                files_df = query(
                    f"""
                    SELECT DISTINCT
                        CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                        CAST(source_file AS VARCHAR) AS source_file
                    FROM read_parquet('{lake.sites}')
                    WHERE CAST(snapshot_date AS VARCHAR) IN {date_clause}
                    ORDER BY snapshot_date DESC, source_file
                    """,
                    date_params,
                )
                file_options = files_df.to_dict(orient="records")

        site_options: list[dict[str, str]] = []
        if ctx.effective_dates:
            clauses: list[str] = []
            params: list[Any] = []
            _append_in_filter(clauses, params, "CAST(snapshot_date AS VARCHAR)", ctx.effective_dates)
            if ctx.selected_files:
                _append_in_filter(clauses, params, "CAST(source_file AS VARCHAR)", ctx.selected_files)
            if ctx.site_search:
                like_term = f"%{ctx.site_search.lower()}%"
                clauses.append(
                    """
                    (
                        LOWER(CAST(site_id AS VARCHAR)) LIKE ?
                        OR LOWER(CAST(site_name AS VARCHAR)) LIKE ?
                        OR LOWER(CAST(ip_address AS VARCHAR)) LIKE ?
                        OR LOWER(CAST(sw_version AS VARCHAR)) LIKE ?
                    )
                    """.strip()
                )
                params.extend([like_term, like_term, like_term, like_term])

            sites_df = query(
                f"""
                SELECT DISTINCT
                    CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                    CAST(source_file AS VARCHAR) AS source_file,
                    CAST(site_id AS VARCHAR) AS site_id,
                    COALESCE(CAST(site_name AS VARCHAR), '') AS site_name
                FROM read_parquet('{_lake().sites}')
                WHERE {' AND '.join(clauses)}
                ORDER BY snapshot_date DESC, site_id
                """,
                params,
            )
            site_options = sites_df.to_dict(orient="records")

        processed_dates = {
            str(s["snapshot_date"])
            for s in xml_snapshots
            if bool(s.get("processed_in_lake"))
        }
        xml_snapshots_meta = [
            {
                "snapshot_date": s["snapshot_date"],
                "folder_name": s["folder_name"],
                "xml_count": s["xml_count"],
                "processed_in_lake": s.get("processed_in_lake", False),
            }
            for s in xml_snapshots
        ]
        return {
            "date_options": date_options,
            "file_options": file_options,
            "site_options": site_options,
            "total_sites": total_sites,
            "total_xml": total_xml,
            "lake_ready": lake.has_sites_data,
            "vendor": lake.vendor,
            "vendor_phase": "live" if lake.has_sites_data else "scaffold",
            "xml_root": str(lake.xml_root),
            "xml_snapshots": xml_snapshots_meta,
            "processed_dates": sorted(processed_dates, reverse=True),
        }

    def _site_and_equipment_where(self, ctx: FilterContext) -> tuple[str, list[Any], str, list[Any]]:
        effective_dates = sorted(ctx.effective_dates or ctx.selected_dates)
        if not effective_dates:
            return "", [], "", []

        site_clauses = []
        site_params: list[Any] = []
        equipment_clauses = []
        equipment_params: list[Any] = []
        _append_in_filter(site_clauses, site_params, "CAST(snapshot_date AS VARCHAR)", effective_dates)
        _append_in_filter(equipment_clauses, equipment_params, "CAST(snapshot_date AS VARCHAR)", effective_dates)

        if ctx.selected_files:
            _append_in_filter(site_clauses, site_params, "CAST(source_file AS VARCHAR)", ctx.selected_files)
            _append_in_filter(equipment_clauses, equipment_params, "CAST(source_file AS VARCHAR)", ctx.selected_files)
        if ctx.selected_sites:
            _append_in_filter(site_clauses, site_params, "CAST(site_id AS VARCHAR)", ctx.selected_sites)
            _append_in_filter(equipment_clauses, equipment_params, "CAST(site_id AS VARCHAR)", ctx.selected_sites)

        return " AND ".join(site_clauses), site_params, " AND ".join(equipment_clauses), equipment_params

    @staticmethod
    def _object_order_case(column: str = "object_type") -> str:
        return f"""
            CASE
                WHEN {column} = 'CABINET' THEN 10
                WHEN {column} = 'SMOD' THEN 20
                WHEN {column} = 'RMOD' THEN 30
                WHEN {column} = 'BBMOD' THEN 40
                WHEN {column} = 'RETU' THEN 90
                WHEN {column} = 'ALD' THEN 91
                WHEN {column} = 'ANTL' THEN 92
                ELSE 50
            END
        """.strip()

    def _equipment_filters(self, ctx: FilterContext) -> tuple[list[str], list[Any]]:
        clauses: list[str] = []
        params: list[Any] = []
        dates = sorted(ctx.effective_dates or ctx.selected_dates)
        _append_in_filter(clauses, params, "CAST(snapshot_date AS VARCHAR)", dates)
        _append_in_filter(clauses, params, "CAST(source_file AS VARCHAR)", ctx.selected_files)
        _append_in_filter(clauses, params, "CAST(site_id AS VARCHAR)", ctx.selected_sites)

        if ctx.smart_missing_serial:
            clauses.append(duckdb_field_is_missing("serial_number"))
        if ctx.smart_duplicates:
            clauses.append(
                f"""
                TRIM(CAST(serial_number AS VARCHAR)) IN (
                    SELECT TRIM(CAST(serial_number AS VARCHAR))
                    FROM read_parquet('{_lake().equipment}')
                    WHERE NOT ({duckdb_field_is_missing("serial_number")})
                    GROUP BY TRIM(CAST(serial_number AS VARCHAR))
                    HAVING COUNT(*) > 1
                )
                """.strip()
            )
        if ctx.smart_critical_quality:
            clauses.append(
                f"({duckdb_field_is_missing('serial_number')} OR "
                f"{duckdb_field_is_missing('product_code')} OR "
                f"{duckdb_field_is_missing('product_name')})"
            )
        return clauses, params

    @staticmethod
    def _normalize_pagination(page: int, page_size: int) -> tuple[int, int, int, bool]:
        safe_page = max(1, int(page))
        if int(page_size) <= 0:
            return safe_page, 0, 0, True
        safe_size = int(page_size)
        offset = (safe_page - 1) * safe_size
        return safe_page, safe_size, offset, False

    @staticmethod
    def _limit_clause(unlimited: bool) -> str:
        return "" if unlimited else "LIMIT ? OFFSET ?"

    @staticmethod
    def _limit_params(unlimited: bool, size: int, offset: int) -> list[Any]:
        return [] if unlimited else [size, offset]

    def get_dashboard(self, ctx: FilterContext) -> dict[str, Any]:
        effective_dates = sorted(ctx.effective_dates or ctx.selected_dates)
        if not effective_dates:
            return {"kpis": {}, "summary": [], "equipment_summary": []}

        latest_date = effective_dates[-1]
        oldest_date = effective_dates[0]
        site_where, site_params, equipment_where, equipment_params = self._site_and_equipment_where(ctx)

        site_kpi = query(
            f"""
            SELECT
                COUNT(DISTINCT CAST(snapshot_date AS VARCHAR) || '|' || CAST(site_id AS VARCHAR)) AS total_sites,
                COALESCE(SUM(CASE WHEN LOWER(site_state) = 'active' THEN 1 ELSE 0 END), 0) AS active_sites,
                COALESCE(SUM(CASE WHEN LOWER(site_state) = 'blocked' THEN 1 ELSE 0 END), 0) AS blocked_sites,
                COALESCE(SUM(nb_cells_2g), 0) AS cells_2g,
                COALESCE(SUM(nb_cells_3g), 0) AS cells_3g,
                COALESCE(SUM(nb_cells_lte_4g), 0) AS cells_4g,
                COALESCE(SUM(nb_cells_5g), 0) AS cells_5g
            FROM read_parquet('{_lake().sites}')
            WHERE {site_where}
            """,
            site_params,
        ).iloc[0]
        equipment_kpi = query(
            f"""
            SELECT COALESCE(SUM(nb_equipment), 0) AS total_equipment
            FROM read_parquet('{_lake().equipment}')
            WHERE {equipment_where}
            """,
            equipment_params,
        ).iloc[0]

        summary = query(
            f"""
            SELECT
                CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                COUNT(DISTINCT site_id) AS nb_sites,
                COALESCE(SUM(CASE WHEN LOWER(site_state) = 'active' THEN 1 ELSE 0 END), 0) AS active_sites,
                COALESCE(SUM(CASE WHEN LOWER(site_state) = 'blocked' THEN 1 ELSE 0 END), 0) AS blocked_sites,
                COALESCE(SUM(nb_cells_2g), 0) AS cells_2g,
                COALESCE(SUM(nb_cells_3g), 0) AS cells_3g,
                COALESCE(SUM(nb_cells_lte_4g), 0) AS cells_4g,
                COALESCE(SUM(nb_cells_lte_fdd), 0) AS cells_4g_fdd,
                COALESCE(SUM(nb_cells_lte_tdd), 0) AS cells_4g_tdd,
                COALESCE(SUM(nb_cells_5g), 0) AS cells_5g
            FROM read_parquet('{_lake().sites}')
            WHERE {site_where}
            GROUP BY snapshot_date
            ORDER BY snapshot_date
            """,
            site_params,
        )
        equipment_summary = query(
            f"""
            SELECT
                CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                object_type,
                COALESCE(SUM(nb_equipment), 0) AS equipment_count
            FROM read_parquet('{_lake().equipment}')
            WHERE {equipment_where}
            GROUP BY snapshot_date, object_type
            ORDER BY snapshot_date, object_type
            """,
            equipment_params,
        )

        total_sites = int(site_kpi["total_sites"]) if int(site_kpi["total_sites"]) else 0
        active_sites = int(site_kpi["active_sites"])
        availability = round(active_sites / total_sites * 100, 2) if total_sites else 0

        return {
            "period": {"latest_date": latest_date, "oldest_date": oldest_date, "snapshot_count": len(effective_dates)},
            "kpis": {
                "total_sites": total_sites,
                "active_sites": active_sites,
                "blocked_sites": int(site_kpi["blocked_sites"]),
                "cells_2g": int(site_kpi["cells_2g"]),
                "cells_3g": int(site_kpi["cells_3g"]),
                "cells_4g": int(site_kpi["cells_4g"]),
                "cells_5g": int(site_kpi["cells_5g"]),
                "total_equipment": int(equipment_kpi["total_equipment"]),
                "availability_percent": availability,
            },
            "summary": summary.to_dict(orient="records"),
            "equipment_summary": equipment_summary.to_dict(orient="records"),
        }

    def _sites_where(self, ctx: FilterContext, *, search: str = "") -> tuple[str, list[Any]]:
        site_where, site_params, _, _ = self._site_and_equipment_where(ctx)
        if not site_where:
            return "", []

        clauses = [site_where]
        params = list(site_params)
        search_text = (search or ctx.site_search or "").strip().lower()
        if search_text:
            like_term = f"%{search_text}%"
            clauses.append(
                """
                (
                    LOWER(CAST(site_id AS VARCHAR)) LIKE ?
                    OR LOWER(CAST(site_name AS VARCHAR)) LIKE ?
                    OR LOWER(CAST(ip_address AS VARCHAR)) LIKE ?
                    OR LOWER(CAST(sw_version AS VARCHAR)) LIKE ?
                )
                """.strip()
            )
            params.extend([like_term, like_term, like_term, like_term])
        return " AND ".join(clauses), params

    def get_sites_page(self, ctx: FilterContext) -> list[dict[str, Any]]:
        where, params = self._sites_where(ctx)
        if not where:
            return []

        df = query(
            f"""
            SELECT
                CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                CAST(site_id AS VARCHAR) AS site_id,
                CAST(site_name AS VARCHAR) AS site_name,
                CAST(site_state AS VARCHAR) AS site_state,
                CAST(ip_address AS VARCHAR) AS ip_address,
                CAST(sw_version AS VARCHAR) AS sw_version,
                COALESCE(nb_cells, 0) AS nb_cells,
                COALESCE(nb_cells_2g, 0) AS nb_cells_2g,
                COALESCE(nb_cells_2g, 0) AS cells_2g,
                COALESCE(nb_cells_3g, 0) AS nb_cells_3g,
                COALESCE(nb_cells_3g, 0) AS cells_3g,
                COALESCE(nb_cells_lte_4g, 0) AS nb_cells_lte_4g,
                COALESCE(nb_cells_lte_4g, 0) AS cells_4g_lte,
                COALESCE(nb_cells_lte_fdd, 0) AS nb_cells_lte_fdd,
                COALESCE(nb_cells_lte_fdd, 0) AS cells_4g_fdd,
                COALESCE(nb_cells_lte_tdd, 0) AS nb_cells_lte_tdd,
                COALESCE(nb_cells_lte_tdd, 0) AS cells_4g_tdd,
                COALESCE(nb_cells_5g, 0) AS nb_cells_5g,
                COALESCE(nb_cells_5g, 0) AS cells_5g,
                CAST(technologies AS VARCHAR) AS technologies,
                CAST(source_file AS VARCHAR) AS source_file
            FROM read_parquet('{_lake().sites}')
            WHERE {where}
            ORDER BY snapshot_date DESC, site_id
            """,
            params,
        )
        return self._serialize_site_rows(df)

    def get_inventory_page(self, ctx: FilterContext, object_types: list[str] | None = None) -> dict[str, Any]:
        clauses, params = self._equipment_filters(ctx)
        if not clauses:
            return {"object_types": [], "rows": []}
        where = " AND ".join(clauses)
        object_types_df = query(
            f"""
            SELECT DISTINCT object_type
            FROM read_parquet('{_lake().equipment}')
            WHERE {where}
            ORDER BY {self._object_order_case()}, object_type
            """,
            params,
        )
        rows_where = where
        rows_params = [*params]
        if object_types:
            clause, clause_params = _in_clause(object_types)
            rows_where = f"{rows_where} AND object_type IN {clause}"
            rows_params.extend(clause_params)
        rows = query(
            f"""
            SELECT
                CAST(source_file AS VARCHAR) AS source_file,
                CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                CAST(site_id AS VARCHAR) AS site_id,
                CAST(object_type AS VARCHAR) AS object_type,
                CAST(id AS VARCHAR) AS id,
                CAST(serial_number AS VARCHAR) AS serial_number,
                CAST(product_code AS VARCHAR) AS product_code,
                CAST(product_name AS VARCHAR) AS product_name,
                COALESCE(nb_equipment, 1) AS nb_equipment
            FROM read_parquet('{_lake().equipment}')
            WHERE {rows_where}
            ORDER BY {self._object_order_case()}, site_id, id
            """,
            rows_params,
        )
        return {
            "object_types": object_types_df["object_type"].astype(str).tolist() if not object_types_df.empty else [],
            "rows": rows.to_dict(orient="records"),
        }

    def get_inventory_page_v2(
        self,
        ctx: FilterContext,
        *,
        object_types: list[str] | None = None,
        page: int = 1,
        page_size: int = 0,
        search: str = "",
    ) -> dict[str, Any]:
        clauses, params = self._equipment_filters(ctx)
        if not clauses:
            return {
                "object_types": [],
                "rows": [],
                "total_count": 0,
                "page": 1,
                "page_size": page_size,
                "summary": {
                    "total_equipment": 0,
                    "unique_sites": 0,
                    "unique_types": 0,
                    "avg_equipment_per_site": 0.0,
                    "top_type": "",
                    "top_type_qty": 0,
                    "top_type_share": 0.0,
                },
                "charts": {
                    "by_type": [],
                    "by_site": [],
                },
            }

        base_where = " AND ".join(clauses)
        object_types_df = query(
            f"""
            SELECT object_type
            FROM (
                SELECT DISTINCT CAST(object_type AS VARCHAR) AS object_type
                FROM read_parquet('{_lake().equipment}')
                WHERE {base_where}
            ) types
            ORDER BY {self._object_order_case()}, object_type
            """,
            params,
        )

        rows_where = base_where
        rows_params = [*params]
        if object_types:
            clause, clause_params = _in_clause(object_types)
            rows_where = f"{rows_where} AND object_type IN {clause}"
            rows_params.extend(clause_params)

        search_text = (search or "").strip().lower()
        if search_text:
            like_term = f"%{search_text}%"
            rows_where = (
                f"""{rows_where} AND (
                    LOWER(CAST(source_file AS VARCHAR)) LIKE ?
                    OR LOWER(CAST(snapshot_date AS VARCHAR)) LIKE ?
                    OR LOWER(CAST(site_id AS VARCHAR)) LIKE ?
                    OR LOWER(CAST(object_type AS VARCHAR)) LIKE ?
                    OR LOWER(CAST(id AS VARCHAR)) LIKE ?
                    OR LOWER(CAST(serial_number AS VARCHAR)) LIKE ?
                    OR LOWER(CAST(product_code AS VARCHAR)) LIKE ?
                    OR LOWER(CAST(product_name AS VARCHAR)) LIKE ?
                )"""
            )
            rows_params.extend([like_term] * 8)

        safe_page, safe_size, offset, unlimited = self._normalize_pagination(page, page_size)
        total_df = query(
            f"""
            SELECT COUNT(*) AS total_count
            FROM read_parquet('{_lake().equipment}')
            WHERE {rows_where}
            """,
            rows_params,
        )
        total_count = int(total_df.iloc[0]["total_count"]) if not total_df.empty else 0

        summary_df = query(
            f"""
            SELECT
                COALESCE(SUM(COALESCE(nb_equipment, 1)), 0) AS total_equipment,
                COUNT(DISTINCT CAST(site_id AS VARCHAR)) AS unique_sites,
                COUNT(DISTINCT CAST(object_type AS VARCHAR)) AS unique_types
            FROM read_parquet('{_lake().equipment}')
            WHERE {rows_where}
            """,
            rows_params,
        )
        total_equipment = int(summary_df.iloc[0]["total_equipment"]) if not summary_df.empty else 0
        unique_sites = int(summary_df.iloc[0]["unique_sites"]) if not summary_df.empty else 0
        unique_types = int(summary_df.iloc[0]["unique_types"]) if not summary_df.empty else 0
        avg_equipment_per_site = round(total_equipment / unique_sites, 1) if unique_sites else 0.0

        top_type_df = query(
            f"""
            SELECT
                CAST(object_type AS VARCHAR) AS object_type,
                COALESCE(SUM(COALESCE(nb_equipment, 1)), 0) AS total_equipment
            FROM read_parquet('{_lake().equipment}')
            WHERE {rows_where}
            GROUP BY CAST(object_type AS VARCHAR)
            ORDER BY total_equipment DESC, object_type
            LIMIT 1
            """,
            rows_params,
        )
        top_type = str(top_type_df.iloc[0]["object_type"]) if not top_type_df.empty else ""
        top_type_qty = int(top_type_df.iloc[0]["total_equipment"]) if not top_type_df.empty else 0
        top_type_share = round((top_type_qty / total_equipment) * 100, 1) if total_equipment else 0.0

        by_type_df = query(
            f"""
            SELECT
                CAST(object_type AS VARCHAR) AS object_type,
                COALESCE(SUM(COALESCE(nb_equipment, 1)), 0) AS total_equipment
            FROM read_parquet('{_lake().equipment}')
            WHERE {rows_where}
            GROUP BY CAST(object_type AS VARCHAR)
            ORDER BY total_equipment DESC, object_type
            """,
            rows_params,
        )
        by_site_df = query(
            f"""
            SELECT
                CAST(site_id AS VARCHAR) AS site_id,
                COALESCE(SUM(COALESCE(nb_equipment, 1)), 0) AS total_equipment
            FROM read_parquet('{_lake().equipment}')
            WHERE {rows_where}
            GROUP BY CAST(site_id AS VARCHAR)
            ORDER BY total_equipment DESC, site_id
            """,
            rows_params,
        )

        rows = query(
            f"""
            SELECT
                CAST(source_file AS VARCHAR) AS source_file,
                CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                CAST(site_id AS VARCHAR) AS site_id,
                CAST(object_type AS VARCHAR) AS object_type,
                CAST(id AS VARCHAR) AS id,
                CAST(serial_number AS VARCHAR) AS serial_number,
                CAST(product_code AS VARCHAR) AS product_code,
                CAST(product_name AS VARCHAR) AS product_name,
                COALESCE(nb_equipment, 1) AS nb_equipment
            FROM read_parquet('{_lake().equipment}')
            WHERE {rows_where}
            ORDER BY {self._object_order_case()}, site_id, id
            {self._limit_clause(unlimited)}
            """,
            [*rows_params, *self._limit_params(unlimited, safe_size, offset)],
        )
        return {
            "object_types": object_types_df["object_type"].astype(str).tolist() if not object_types_df.empty else [],
            "rows": rows.to_dict(orient="records"),
            "total_count": total_count,
            "page": safe_page,
            "page_size": total_count if unlimited else safe_size,
            "summary": {
                "total_equipment": total_equipment,
                "unique_sites": unique_sites,
                "unique_types": unique_types,
                "avg_equipment_per_site": avg_equipment_per_site,
                "top_type": top_type,
                "top_type_qty": top_type_qty,
                "top_type_share": top_type_share,
            },
            "charts": {
                "by_type": by_type_df.to_dict(orient="records"),
                "by_site": by_site_df.to_dict(orient="records"),
            },
        }

    @staticmethod
    def _serialize_site_rows(df: pd.DataFrame) -> list[dict[str, Any]]:
        records = df.to_dict(orient="records")
        int_keys = (
            "nb_cells",
            "nb_cells_2g",
            "nb_cells_3g",
            "nb_cells_lte_4g",
            "nb_cells_lte_fdd",
            "nb_cells_lte_tdd",
            "nb_cells_5g",
            "cells_2g",
            "cells_3g",
            "cells_4g_lte",
            "cells_4g_fdd",
            "cells_4g_tdd",
            "cells_5g",
        )
        for row in records:
            for key in int_keys:
                if key in row and row[key] is not None:
                    row[key] = int(row[key])
        return records

    def get_sites_page_v2(self, ctx: FilterContext, *, page: int = 1, page_size: int = 0, search: str = "") -> dict[str, Any]:
        where, params = self._sites_where(ctx, search=search)
        if not where:
            return {"rows": [], "total_count": 0, "page": 1, "page_size": page_size}
        safe_page, safe_size, offset, unlimited = self._normalize_pagination(page, page_size)
        total_df = query(
            f"""
            SELECT COUNT(*) AS total_count
            FROM read_parquet('{_lake().sites}')
            WHERE {where}
            """,
            params,
        )
        total_count = int(total_df.iloc[0]["total_count"]) if not total_df.empty else 0

        rows = query(
            f"""
            SELECT
                CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                CAST(site_id AS VARCHAR) AS site_id,
                CAST(site_name AS VARCHAR) AS site_name,
                CAST(site_state AS VARCHAR) AS site_state,
                CAST(ip_address AS VARCHAR) AS ip_address,
                CAST(sw_version AS VARCHAR) AS sw_version,
                COALESCE(nb_cells, 0) AS nb_cells,
                COALESCE(nb_cells_2g, 0) AS nb_cells_2g,
                COALESCE(nb_cells_2g, 0) AS cells_2g,
                COALESCE(nb_cells_3g, 0) AS nb_cells_3g,
                COALESCE(nb_cells_3g, 0) AS cells_3g,
                COALESCE(nb_cells_lte_4g, 0) AS nb_cells_lte_4g,
                COALESCE(nb_cells_lte_4g, 0) AS cells_4g_lte,
                COALESCE(nb_cells_lte_fdd, 0) AS nb_cells_lte_fdd,
                COALESCE(nb_cells_lte_fdd, 0) AS cells_4g_fdd,
                COALESCE(nb_cells_lte_tdd, 0) AS nb_cells_lte_tdd,
                COALESCE(nb_cells_lte_tdd, 0) AS cells_4g_tdd,
                COALESCE(nb_cells_5g, 0) AS nb_cells_5g,
                COALESCE(nb_cells_5g, 0) AS cells_5g,
                CAST(technologies AS VARCHAR) AS technologies,
                CAST(source_file AS VARCHAR) AS source_file
            FROM read_parquet('{_lake().sites}')
            WHERE {where}
            ORDER BY snapshot_date DESC, site_id
            {self._limit_clause(unlimited)}
            """,
            [*params, *self._limit_params(unlimited, safe_size, offset)],
        )
        serialized_rows = self._serialize_site_rows(rows)
        return {
            "rows": serialized_rows,
            "total_count": total_count,
            "page": safe_page,
            "page_size": total_count if unlimited else safe_size,
            "effective_dates": sorted(ctx.effective_dates or ctx.selected_dates),
        }

    def get_delta_page(self) -> dict[str, Any]:
        df_delta = get_delta_metrics()
        df_changes = get_site_changes()
        if df_delta.empty:
            return {"metrics": [], "site_changes": [], "summary": {}}

        numeric_delta = df_delta.dropna(subset=["delta_numeric"]).copy()
        added_sites = 0
        removed_sites = 0
        equipment_delta = 0
        if not numeric_delta.empty:
            added = numeric_delta[numeric_delta["metric"] == "nb_added_sites"]
            removed = numeric_delta[numeric_delta["metric"] == "nb_removed_sites"]
            equipment = numeric_delta[numeric_delta["metric"] == "nb_equipment"]
            if not added.empty:
                added_sites = int(added.iloc[0]["delta_numeric"])
            if not removed.empty:
                removed_sites = int(removed.iloc[0]["delta_numeric"])
            if not equipment.empty:
                equipment_delta = int(equipment.iloc[0]["delta_numeric"])

        return {
            "metrics": df_delta.to_dict(orient="records"),
            "numeric_metrics": numeric_delta.to_dict(orient="records"),
            "site_changes": df_changes.to_dict(orient="records"),
            "summary": {
                "added_sites": added_sites,
                "removed_sites": removed_sites,
                "equipment_delta": equipment_delta,
            },
        }

    def get_statistics_page(self, ctx: FilterContext) -> list[dict[str, Any]]:
        clauses, params = self._equipment_filters(ctx)
        if not clauses:
            return []
        where = " AND ".join(clauses)
        df = query(
            f"""
            SELECT
                object_type,
                SUM(nb_equipment) AS total_equipment
            FROM read_parquet('{_lake().equipment}')
            WHERE {where}
            GROUP BY object_type
            ORDER BY total_equipment DESC, {self._object_order_case()}
            """,
            params,
        )
        return df.to_dict(orient="records")

    def get_statistics_object_type_investigation(self, ctx: FilterContext, object_type: str) -> dict[str, Any]:
        obj_type = (object_type or "").strip()
        if not obj_type:
            return {"available": False, "reason": "missing_object_type"}

        base_clauses, base_params = self._equipment_filters(ctx)
        if not base_clauses:
            return {"available": False, "reason": "no_filter_context"}

        type_clauses = [*base_clauses, "CAST(object_type AS VARCHAR) = ?"]
        type_params = [*base_params, obj_type]
        type_where = " AND ".join(type_clauses)
        base_where = " AND ".join(base_clauses)

        stats = query(
            f"""
            SELECT
                COALESCE(SUM(nb_equipment), 0) AS total_equipment,
                COUNT(DISTINCT CAST(site_id AS VARCHAR)) AS sites_count,
                COUNT(DISTINCT CAST(snapshot_date AS VARCHAR)) AS snapshots_count,
                COUNT(DISTINCT NULLIF(TRIM(CAST(serial_number AS VARCHAR)), '')) AS unique_serials,
                COALESCE(SUM(
                    CASE
                        WHEN serial_number IS NULL OR TRIM(CAST(serial_number AS VARCHAR)) = ''
                        THEN nb_equipment ELSE 0
                    END
                ), 0) AS empty_serial_equipment
            FROM read_parquet('{_lake().equipment}')
            WHERE {type_where}
            """,
            type_params,
        )
        if stats.empty or int(stats.iloc[0]["total_equipment"] or 0) == 0:
            return {"available": False, "reason": "object_type_not_found", "object_type": obj_type}

        row = stats.iloc[0]
        total_equipment = int(row["total_equipment"])
        sites_count = int(row["sites_count"])
        snapshots_count = int(row["snapshots_count"])
        unique_serials = int(row["unique_serials"])
        empty_serial_equipment = int(row["empty_serial_equipment"])

        network = query(
            f"""
            SELECT COALESCE(SUM(nb_equipment), 0) AS network_total
            FROM read_parquet('{_lake().equipment}')
            WHERE {base_where}
            """,
            base_params,
        )
        network_total = int(network.iloc[0]["network_total"] or 0)
        share_pct = round((total_equipment * 100.0) / max(1, network_total), 2)

        all_types = self.get_statistics_page(ctx)
        rank = 1
        for index, item in enumerate(all_types, start=1):
            if str(item.get("object_type", "")) == obj_type:
                rank = index
                break

        top_sites = query(
            f"""
            SELECT
                CAST(site_id AS VARCHAR) AS site_id,
                COALESCE(SUM(nb_equipment), 0) AS equipment_count
            FROM read_parquet('{_lake().equipment}')
            WHERE {type_where}
            GROUP BY site_id
            ORDER BY equipment_count DESC
            LIMIT 5
            """,
            type_params,
        )

        avg_per_site = round(total_equipment / max(1, sites_count), 1)
        serial_fill_pct = round((unique_serials * 100.0) / max(1, total_equipment), 1)

        signals: list[dict[str, str]] = []
        if share_pct >= 20:
            signals.append(
                {
                    "level": "info",
                    "fr": f"{obj_type} représente {share_pct}% du parc équipements — type dominant du réseau.",
                    "en": f"{obj_type} accounts for {share_pct}% of network equipment — dominant type.",
                }
            )
        if empty_serial_equipment > 0:
            signals.append(
                {
                    "level": "warning",
                    "fr": f"{empty_serial_equipment:,} équipements {obj_type} sans serial renseigné.",
                    "en": f"{empty_serial_equipment:,} {obj_type} equipment units without serial number.",
                }
            )
        if rank == 1:
            signals.append(
                {
                    "level": "success",
                    "fr": f"{obj_type} est le type #1 par volume installé ({total_equipment:,} unités).",
                    "en": f"{obj_type} is the #1 type by installed volume ({total_equipment:,} units).",
                }
            )

        narrative_fr = (
            f"Le type {obj_type} totalise {total_equipment:,} équipements sur {sites_count:,} sites "
            f"({snapshots_count} snapshot(s)), soit {share_pct}% du parc filtré ({network_total:,} équipements). "
            f"Moyenne de {avg_per_site} unités/site, {unique_serials:,} serials uniques "
            f"({serial_fill_pct}% de couverture serial)."
        )
        narrative_en = (
            f"Type {obj_type} has {total_equipment:,} equipment units across {sites_count:,} sites "
            f"({snapshots_count} snapshot(s)), representing {share_pct}% of the filtered fleet ({network_total:,} units). "
            f"Average {avg_per_site} units/site, {unique_serials:,} unique serials "
            f"({serial_fill_pct}% serial coverage)."
        )

        return {
            "available": True,
            "object_type": obj_type,
            "summary": {
                "total_equipment": total_equipment,
                "network_total": network_total,
                "share_pct": share_pct,
                "rank": rank,
                "sites_count": sites_count,
                "snapshots_count": snapshots_count,
                "unique_serials": unique_serials,
                "empty_serial_equipment": empty_serial_equipment,
                "avg_per_site": avg_per_site,
                "serial_fill_pct": serial_fill_pct,
            },
            "top_sites": top_sites.to_dict(orient="records"),
            "signals": signals,
            "narrative": {"fr": narrative_fr, "en": narrative_en},
        }

    def get_prediction_page(self, ctx: FilterContext) -> list[dict[str, Any]]:
        clauses, params = self._equipment_filters(ctx)
        if not clauses:
            return []
        where = " AND ".join(clauses)
        df = query(
            f"""
            SELECT
                object_type,
                SUM(nb_equipment) AS installed_base,
                COUNT(DISTINCT serial_number) AS unique_serials
            FROM read_parquet('{_lake().equipment}')
            WHERE {where}
            GROUP BY object_type
            ORDER BY installed_base DESC, {self._object_order_case()}
            """,
            params,
        )
        if df.empty:
            return []

        dates = sorted(ctx.effective_dates or ctx.selected_dates)
        period_days = max(1, self._period_days(dates))
        churn_by_type: dict[str, float] = {}
        if len(dates) >= 2:
            try:
                from src.services.replacement_analytics_service import _replacements_between_dates

                frame = _replacements_between_dates(ctx, dates[0], dates[-1])
                for record in frame.to_dict(orient="records"):
                    if str(record.get("change_kind")) != "removed":
                        continue
                    obj = str(record.get("object_type") or "")
                    churn_by_type[obj] = churn_by_type.get(obj, 0) + int(record.get("change_count") or 0)
            except Exception:
                churn_by_type = {}

        df["risk_score"] = (df["installed_base"] / df["installed_base"].max() * 100).round(2)
        daily_rates = []
        forecast_30 = []
        forecast_90 = []
        for _, row in df.iterrows():
            obj = str(row["object_type"])
            removed = churn_by_type.get(obj, 0)
            daily = removed / period_days if removed else float(row["installed_base"]) * 0.0005
            daily_rates.append(round(daily, 4))
            forecast_30.append(max(0, int(round(daily * 30))))
            forecast_90.append(max(0, int(round(daily * 90))))
        df["daily_churn_rate"] = daily_rates
        df["forecast_changes_30d"] = forecast_30
        df["forecast_changes_90d"] = forecast_90
        df["estimated_spares_30d"] = df["forecast_changes_30d"]
        return df.to_dict(orient="records")

    def get_analytics_page(self, ctx: FilterContext) -> dict[str, list[dict[str, Any]]]:
        if not ctx.effective_dates:
            return {"summary": [], "equipment": []}
        clause, params = _in_clause(ctx.effective_dates)
        summary = query(
            f"""
            SELECT
                CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                COUNT(DISTINCT site_id) AS nb_sites,
                SUM(nb_cells_2g) AS cells_2g,
                SUM(nb_cells_3g) AS cells_3g,
                SUM(nb_cells_lte_4g) AS cells_4g,
                SUM(nb_cells_lte_fdd) AS cells_4g_fdd,
                SUM(nb_cells_lte_tdd) AS cells_4g_tdd,
                SUM(nb_cells_5g) AS cells_5g
            FROM read_parquet('{_lake().sites}')
            WHERE CAST(snapshot_date AS VARCHAR) IN {clause}
            GROUP BY snapshot_date
            ORDER BY snapshot_date
            """,
            params,
        )
        equipment = query(
            f"""
            SELECT
                CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                object_type,
                SUM(nb_equipment) AS equipment_count
            FROM read_parquet('{_lake().equipment}')
            WHERE CAST(snapshot_date AS VARCHAR) IN {clause}
            GROUP BY snapshot_date, object_type
            ORDER BY snapshot_date, {self._object_order_case()}, object_type
            """,
            params,
        )
        return {
            "summary": summary.to_dict(orient="records"),
            "equipment": equipment.to_dict(orient="records"),
        }

    def _analytics_snapshot_core(self, snapshot_date: str) -> dict[str, Any] | None:
        site_stats = query(
            f"""
            SELECT
                COUNT(DISTINCT site_id) AS nb_sites,
                COALESCE(SUM(CASE WHEN LOWER(site_state) = 'active' THEN 1 ELSE 0 END), 0) AS active_sites,
                COALESCE(SUM(CASE WHEN LOWER(site_state) = 'blocked' THEN 1 ELSE 0 END), 0) AS blocked_sites,
                COALESCE(SUM(nb_cells_2g), 0) AS cells_2g,
                COALESCE(SUM(nb_cells_3g), 0) AS cells_3g,
                COALESCE(SUM(nb_cells_lte_4g), 0) AS cells_4g,
                COALESCE(SUM(nb_cells_lte_fdd), 0) AS cells_4g_fdd,
                COALESCE(SUM(nb_cells_lte_tdd), 0) AS cells_4g_tdd,
                COALESCE(SUM(nb_cells_5g), 0) AS cells_5g,
                COALESCE(SUM(CASE WHEN COALESCE(nb_cells_5g, 0) > 0 THEN 1 ELSE 0 END), 0) AS sites_with_5g,
                COALESCE(SUM(CASE WHEN COALESCE(nb_cells_lte_4g, 0) > 0 THEN 1 ELSE 0 END), 0) AS sites_with_4g,
                COALESCE(SUM(CASE WHEN COALESCE(nb_cells_3g, 0) > 0 THEN 1 ELSE 0 END), 0) AS sites_with_3g,
                COALESCE(SUM(CASE WHEN COALESCE(nb_cells_2g, 0) > 0 THEN 1 ELSE 0 END), 0) AS sites_with_2g
            FROM read_parquet('{_lake().sites}')
            WHERE CAST(snapshot_date AS VARCHAR) = ?
            """,
            [snapshot_date],
        )
        if site_stats.empty:
            return None

        sites = {key: int(site_stats.iloc[0][key]) for key in site_stats.columns}
        total_cells = sites["cells_2g"] + sites["cells_3g"] + sites["cells_4g"] + sites["cells_5g"]
        availability = round((sites["active_sites"] * 100.0) / max(1, sites["nb_sites"]), 1)

        equipment_rows = query(
            f"""
            SELECT
                CAST(object_type AS VARCHAR) AS object_type,
                COALESCE(SUM(nb_equipment), 0) AS equipment_count
            FROM read_parquet('{_lake().equipment}')
            WHERE CAST(snapshot_date AS VARCHAR) = ?
            GROUP BY object_type
            ORDER BY equipment_count DESC, {self._object_order_case()}, object_type
            """,
            [snapshot_date],
        )
        equipment_by_type = equipment_rows.to_dict(orient="records")
        total_equipment = int(sum(int(row.get("equipment_count") or 0) for row in equipment_by_type))
        share_5g = round((sites["cells_5g"] * 100.0) / max(1, total_cells), 1)
        share_4g = round((sites["cells_4g"] * 100.0) / max(1, total_cells), 1)
        return {
            "sites": sites,
            "cells_total": total_cells,
            "equipment_total": total_equipment,
            "equipment_by_type": equipment_by_type,
            "availability": availability,
            "share_5g": share_5g,
            "share_4g": share_4g,
        }

    def get_analytics_snapshot_investigation(self, ctx: FilterContext, snapshot_date: str) -> dict[str, Any]:
        date = (snapshot_date or "").strip()
        if not date:
            return {"available": False, "reason": "missing_snapshot_date"}

        core = self._analytics_snapshot_core(date)
        if not core:
            return {"available": False, "reason": "snapshot_not_found", "snapshot_date": date}

        sites = core["sites"]
        total_cells = core["cells_total"]
        total_equipment = core["equipment_total"]
        equipment_by_type = core["equipment_by_type"]
        availability = core["availability"]
        share_5g = core["share_5g"]
        share_4g = core["share_4g"]

        dates = sorted(set(ctx.effective_dates or ctx.selected_dates))
        previous_date = ""
        for index, current in enumerate(dates):
            if current == date and index > 0:
                previous_date = dates[index - 1]
                break

        comparison: dict[str, Any] | None = None
        if previous_date:
            prev_core = self._analytics_snapshot_core(previous_date)
            if prev_core:
                prev_sites = prev_core["sites"]
                comparison = {
                    "previous_snapshot": previous_date,
                    "delta_nb_sites": sites["nb_sites"] - int(prev_sites["nb_sites"]),
                    "delta_active_sites": sites["active_sites"] - int(prev_sites["active_sites"]),
                    "delta_blocked_sites": sites["blocked_sites"] - int(prev_sites["blocked_sites"]),
                    "delta_cells_2g": sites["cells_2g"] - int(prev_sites["cells_2g"]),
                    "delta_cells_3g": sites["cells_3g"] - int(prev_sites["cells_3g"]),
                    "delta_cells_4g": sites["cells_4g"] - int(prev_sites["cells_4g"]),
                    "delta_cells_5g": sites["cells_5g"] - int(prev_sites["cells_5g"]),
                    "delta_total_cells": total_cells - int(prev_core["cells_total"]),
                    "delta_total_equipment": total_equipment - int(prev_core["equipment_total"]),
                }

        signals: list[dict[str, str]] = []
        if sites["blocked_sites"] > 0:
            signals.append(
                {
                    "level": "warning",
                    "fr": f"{sites['blocked_sites']} site(s) bloqué(s) détecté(s) sur ce snapshot.",
                    "en": f"{sites['blocked_sites']} blocked site(s) detected on this snapshot.",
                }
            )
        if comparison and comparison["delta_nb_sites"] != 0:
            direction_fr = "hausse" if comparison["delta_nb_sites"] > 0 else "baisse"
            direction_en = "increase" if comparison["delta_nb_sites"] > 0 else "decrease"
            signals.append(
                {
                    "level": "info",
                    "fr": f"Évolution du parc : {direction_fr} de {abs(comparison['delta_nb_sites'])} sites vs {previous_date}.",
                    "en": f"Fleet evolution: {direction_en} of {abs(comparison['delta_nb_sites'])} sites vs {previous_date}.",
                }
            )
        if comparison and comparison["delta_cells_5g"] > 0:
            signals.append(
                {
                    "level": "success",
                    "fr": f"Déploiement 5G en progression (+{comparison['delta_cells_5g']} cellules vs {previous_date}).",
                    "en": f"5G rollout progressing (+{comparison['delta_cells_5g']} cells vs {previous_date}).",
                }
            )
        if availability < 99:
            signals.append(
                {
                    "level": "warning",
                    "fr": f"Disponibilité réseau à {availability}% (sous le seuil cible de 99%).",
                    "en": f"Network availability at {availability}% (below 99% target).",
                }
            )

        narrative_fr = (
            f"Le snapshot du {date} couvre {sites['nb_sites']:,} sites ({sites['active_sites']:,} actifs, "
            f"{sites['blocked_sites']:,} bloqués) avec une disponibilité de {availability}%. "
            f"Le réseau totalise {total_cells:,} cellules (2G: {sites['cells_2g']:,}, 3G: {sites['cells_3g']:,}, "
            f"4G: {sites['cells_4g']:,}, 5G: {sites['cells_5g']:,}) et {total_equipment:,} équipements installés. "
            f"La 5G représente {share_5g}% du parc cellulaire et la 4G {share_4g}%."
        )
        narrative_en = (
            f"Snapshot {date} covers {sites['nb_sites']:,} sites ({sites['active_sites']:,} active, "
            f"{sites['blocked_sites']:,} blocked) with {availability}% availability. "
            f"The network has {total_cells:,} cells (2G: {sites['cells_2g']:,}, 3G: {sites['cells_3g']:,}, "
            f"4G: {sites['cells_4g']:,}, 5G: {sites['cells_5g']:,}) and {total_equipment:,} installed equipment. "
            f"5G accounts for {share_5g}% of the cell base and 4G for {share_4g}%."
        )
        if comparison:
            narrative_fr += (
                f" Par rapport au snapshot précédent ({previous_date}), le parc évolue de "
                f"{comparison['delta_nb_sites']:+d} sites, {comparison['delta_total_cells']:+d} cellules et "
                f"{comparison['delta_total_equipment']:+d} équipements."
            )
            narrative_en += (
                f" Compared to the previous snapshot ({previous_date}), the fleet changed by "
                f"{comparison['delta_nb_sites']:+d} sites, {comparison['delta_total_cells']:+d} cells and "
                f"{comparison['delta_total_equipment']:+d} equipment units."
            )

        return {
            "available": True,
            "snapshot_date": date,
            "sites": {
                "nb_sites": sites["nb_sites"],
                "active_sites": sites["active_sites"],
                "blocked_sites": sites["blocked_sites"],
                "availability_pct": availability,
                "sites_with_2g": sites["sites_with_2g"],
                "sites_with_3g": sites["sites_with_3g"],
                "sites_with_4g": sites["sites_with_4g"],
                "sites_with_5g": sites["sites_with_5g"],
            },
            "cells": {
                "cells_2g": sites["cells_2g"],
                "cells_3g": sites["cells_3g"],
                "cells_4g": sites["cells_4g"],
                "cells_4g_fdd": sites["cells_4g_fdd"],
                "cells_4g_tdd": sites["cells_4g_tdd"],
                "cells_5g": sites["cells_5g"],
                "total_cells": total_cells,
                "share_5g_pct": share_5g,
                "share_4g_pct": share_4g,
            },
            "equipment": {
                "total": total_equipment,
                "by_type": equipment_by_type,
                "object_type_count": len(equipment_by_type),
            },
            "comparison": comparison,
            "signals": signals,
            "narrative": {"fr": narrative_fr, "en": narrative_en},
        }

    def get_temporal_changes_page(self, ctx: FilterContext) -> dict[str, Any]:
        if not (ctx.effective_dates or ctx.selected_dates):
            return {
                "rows": [],
                "summary": {
                    "total_changes": 0,
                    "new_sites": 0,
                    "removed_sites": 0,
                    "net_evolution": 0,
                    "stability_score": 100.0,
                },
            }
        df_changes = get_site_changes()
        if df_changes.empty:
            return {
                "rows": [],
                "summary": {
                    "total_changes": 0,
                    "new_sites": 0,
                    "removed_sites": 0,
                    "net_evolution": 0,
                    "stability_score": 100.0,
                },
            }

        working = df_changes.copy()
        if ctx.selected_sites:
            working = working[working["site_id"].astype(str).isin(ctx.selected_sites)]

        if working.empty:
            return {
                "rows": [],
                "summary": {
                    "total_changes": 0,
                    "new_sites": 0,
                    "removed_sites": 0,
                    "net_evolution": 0,
                    "stability_score": 100.0,
                },
            }

        change_text = working["change_type"].astype(str).str.upper()
        new_count = int(change_text.str.contains("NEW|ADDED").sum())
        removed_count = int(change_text.str.contains("REMOVED").sum())
        total_changes = int(len(working))
        net_evolution = new_count - removed_count
        impacted_sites = int(working["site_id"].astype(str).nunique())
        denominator = max(1, impacted_sites)
        stability_score = round(max(0.0, 100.0 - (total_changes * 100.0 / denominator)), 1)

        return {
            "rows": working.to_dict(orient="records"),
            "summary": {
                "total_changes": total_changes,
                "new_sites": new_count,
                "removed_sites": removed_count,
                "net_evolution": net_evolution,
                    "impacted_sites": impacted_sites,
                "stability_score": stability_score,
            },
        }

    def get_asset_distribution_page(self, ctx: FilterContext) -> dict[str, Any]:
        if not (ctx.effective_dates or ctx.selected_dates):
            return {
                "rows": [],
                "summary": {
                    "total_assets": 0,
                    "total_sites": 0,
                    "total_object_types": 0,
                    "avg_assets_per_site": 0.0,
                },
            }
        clauses: list[str] = []
        params: list[Any] = []
        _append_in_filter(clauses, params, "CAST(snapshot_date AS VARCHAR)", sorted(ctx.effective_dates or ctx.selected_dates))
        _append_in_filter(clauses, params, "CAST(site_id AS VARCHAR)", ctx.selected_sites)
        where = " AND ".join(clauses) if clauses else "1=1"

        rows = query(
            f"""
            WITH base AS (
                SELECT
                    CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                    CAST(site_id AS VARCHAR) AS site_id,
                    CAST(object_type AS VARCHAR) AS object_type,
                    COALESCE(equipment_count, 0) AS equipment_count
                FROM read_parquet('{_lake().counters}')
                WHERE {where}
            ),
            site_totals AS (
                SELECT site_id, SUM(equipment_count) AS site_total_assets
                FROM base
                GROUP BY site_id
            ),
            object_totals AS (
                SELECT object_type, SUM(equipment_count) AS object_total_assets, COUNT(DISTINCT site_id) AS sites_count
                FROM base
                GROUP BY object_type
            )
            SELECT
                snapshot_date,
                site_id,
                object_type,
                equipment_count,
                site_total_assets,
                object_total_assets,
                sites_count,
                ROUND(equipment_count * 100.0 / NULLIF(site_total_assets, 0), 1) AS site_asset_share,
                ROUND(equipment_count * 100.0 / NULLIF(object_total_assets, 0), 1) AS object_asset_share
            FROM base
            LEFT JOIN site_totals USING (site_id)
            LEFT JOIN object_totals USING (object_type)
            ORDER BY snapshot_date DESC, site_total_assets DESC, site_id, {self._object_order_case()}, object_type
            """,
            params,
        )

        if rows.empty:
            return {
                "rows": [],
                "summary": {
                    "total_assets": 0,
                    "total_sites": 0,
                    "total_object_types": 0,
                    "avg_assets_per_site": 0.0,
                },
            }

        total_assets = int(rows["equipment_count"].sum())
        total_sites = int(rows["site_id"].astype(str).nunique())
        total_object_types = int(rows["object_type"].astype(str).nunique())
        avg_assets_per_site = round(total_assets / total_sites, 1) if total_sites else 0.0
        return {
            "rows": rows.to_dict(orient="records"),
            "summary": {
                "total_assets": total_assets,
                "total_sites": total_sites,
                "total_object_types": total_object_types,
                "avg_assets_per_site": avg_assets_per_site,
            },
        }

    def get_asset_distribution_page_v2(
        self,
        ctx: FilterContext,
        *,
        object_types: list[str] | None = None,
        page: int = 1,
        page_size: int = 0,
        search: str = "",
        unique_serial_only: bool = False,
    ) -> dict[str, Any]:
        if not (ctx.effective_dates or ctx.selected_dates):
            return {
                "rows": [],
                "total_count": 0,
                "page": 1,
                "page_size": page_size,
                "object_types": [],
                "summary": {
                    "total_assets": 0,
                    "total_sites": 0,
                    "total_object_types": 0,
                    "avg_assets_per_site": 0.0,
                },
            }
        clauses: list[str] = []
        params: list[Any] = []
        _append_in_filter(clauses, params, "CAST(snapshot_date AS VARCHAR)", sorted(ctx.effective_dates or ctx.selected_dates))
        _append_in_filter(clauses, params, "CAST(site_id AS VARCHAR)", ctx.selected_sites)
        if object_types:
            _append_in_filter(clauses, params, "CAST(object_type AS VARCHAR)", object_types)
        search_text = (search or "").strip().lower()
        if search_text:
            like_term = f"%{search_text}%"
            clauses.append(
                """
                (
                    LOWER(CAST(site_id AS VARCHAR)) LIKE ?
                    OR LOWER(CAST(object_type AS VARCHAR)) LIKE ?
                    OR LOWER(CAST(snapshot_date AS VARCHAR)) LIKE ?
                )
                """.strip()
            )
            params.extend([like_term, like_term, like_term])
        where = " AND ".join(clauses) if clauses else "1=1"
        safe_page, safe_size, offset, unlimited = self._normalize_pagination(page, page_size)

        if unique_serial_only:
            equipment_clauses, equipment_params = self._equipment_filters(ctx)
            if object_types:
                _append_in_filter(equipment_clauses, equipment_params, "CAST(object_type AS VARCHAR)", object_types)
            if search_text:
                like_term = f"%{search_text}%"
                equipment_clauses.append(
                    """
                    (
                        LOWER(CAST(site_id AS VARCHAR)) LIKE ?
                        OR LOWER(CAST(object_type AS VARCHAR)) LIKE ?
                        OR LOWER(CAST(snapshot_date AS VARCHAR)) LIKE ?
                        OR LOWER(CAST(serial_number AS VARCHAR)) LIKE ?
                        OR LOWER(CAST(product_name AS VARCHAR)) LIKE ?
                        OR LOWER(CAST(product_code AS VARCHAR)) LIKE ?
                    )
                    """.strip()
                )
                equipment_params.extend([like_term, like_term, like_term, like_term, like_term, like_term])
            equipment_where = " AND ".join(equipment_clauses) if equipment_clauses else "1=1"

            total_df = query(
                f"""
                SELECT COUNT(*) AS total_count
                FROM (
                    SELECT TRIM(CAST(serial_number AS VARCHAR)) AS serial_number
                    FROM read_parquet('{_lake().equipment}')
                    WHERE {equipment_where}
                      AND serial_number IS NOT NULL
                      AND TRIM(CAST(serial_number AS VARCHAR)) <> ''
                    GROUP BY TRIM(CAST(serial_number AS VARCHAR))
                ) deduped
                """,
                equipment_params,
            )
            total_count = int(total_df.iloc[0]["total_count"]) if not total_df.empty else 0

            rows = query(
                f"""
                WITH scoped AS (
                    SELECT
                        CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                        CAST(site_id AS VARCHAR) AS site_id,
                        CAST(object_type AS VARCHAR) AS object_type,
                        TRIM(CAST(serial_number AS VARCHAR)) AS serial_number,
                        CAST(product_code AS VARCHAR) AS product_code,
                        CAST(product_name AS VARCHAR) AS product_name,
                        COALESCE(nb_equipment, 1) AS nb_equipment
                    FROM read_parquet('{_lake().equipment}')
                    WHERE {equipment_where}
                      AND serial_number IS NOT NULL
                      AND TRIM(CAST(serial_number AS VARCHAR)) <> ''
                ),
                deduped AS (
                    SELECT
                        snapshot_date,
                        site_id,
                        object_type,
                        serial_number,
                        product_code,
                        product_name,
                        nb_equipment,
                        ROW_NUMBER() OVER (
                            PARTITION BY serial_number
                            ORDER BY snapshot_date DESC, site_id, object_type, product_code, product_name
                        ) AS rn
                    FROM scoped
                )
                SELECT
                    snapshot_date,
                    site_id,
                    object_type,
                    serial_number,
                    product_code,
                    product_name,
                    nb_equipment
                FROM deduped
                WHERE rn = 1
                ORDER BY snapshot_date DESC, {self._object_order_case()}, object_type, site_id, serial_number
                {self._limit_clause(unlimited)}
                """,
                [*equipment_params, *self._limit_params(unlimited, safe_size, offset)],
            )

            summary_df = query(
                f"""
                WITH scoped AS (
                    SELECT
                        CAST(site_id AS VARCHAR) AS site_id,
                        CAST(object_type AS VARCHAR) AS object_type,
                        TRIM(CAST(serial_number AS VARCHAR)) AS serial_number,
                        COALESCE(nb_equipment, 1) AS nb_equipment
                    FROM read_parquet('{_lake().equipment}')
                    WHERE {equipment_where}
                      AND serial_number IS NOT NULL
                      AND TRIM(CAST(serial_number AS VARCHAR)) <> ''
                ),
                deduped AS (
                    SELECT
                        site_id,
                        object_type,
                        serial_number,
                        nb_equipment,
                        ROW_NUMBER() OVER (
                            PARTITION BY serial_number
                            ORDER BY site_id, object_type
                        ) AS rn
                    FROM scoped
                )
                SELECT
                    COALESCE(SUM(nb_equipment), 0) AS total_assets,
                    COUNT(DISTINCT site_id) AS total_sites,
                    COUNT(DISTINCT object_type) AS total_object_types
                FROM deduped
                WHERE rn = 1
                """,
                equipment_params,
            )
            total_assets = int(summary_df.iloc[0]["total_assets"]) if not summary_df.empty else 0
            total_sites = int(summary_df.iloc[0]["total_sites"]) if not summary_df.empty else 0
            total_object_types = int(summary_df.iloc[0]["total_object_types"]) if not summary_df.empty else 0
            avg_assets_per_site = round(total_assets / total_sites, 1) if total_sites else 0.0

            object_types_df = query(
                f"""
                SELECT DISTINCT CAST(object_type AS VARCHAR) AS object_type
                FROM read_parquet('{_lake().counters}')
                WHERE {where}
                ORDER BY {self._object_order_case()}, object_type
                """,
                params,
            )

            return {
                "rows": rows.to_dict(orient="records"),
                "total_count": total_count,
                "page": safe_page,
                "page_size": total_count if unlimited else safe_size,
                "object_types": object_types_df["object_type"].astype(str).tolist() if not object_types_df.empty else [],
                "summary": {
                    "total_assets": total_assets,
                    "total_sites": total_sites,
                    "total_object_types": total_object_types,
                    "avg_assets_per_site": avg_assets_per_site,
                },
            }

        summary_df = query(
            f"""
            SELECT
                COALESCE(SUM(equipment_count), 0) AS total_assets,
                COUNT(DISTINCT CAST(site_id AS VARCHAR)) AS total_sites,
                COUNT(DISTINCT CAST(object_type AS VARCHAR)) AS total_object_types
            FROM read_parquet('{_lake().counters}')
            WHERE {where}
            """,
            params,
        )
        total_assets = int(summary_df.iloc[0]["total_assets"]) if not summary_df.empty else 0
        total_sites = int(summary_df.iloc[0]["total_sites"]) if not summary_df.empty else 0
        total_object_types = int(summary_df.iloc[0]["total_object_types"]) if not summary_df.empty else 0
        avg_assets_per_site = round(total_assets / total_sites, 1) if total_sites else 0.0

        total_df = query(
            f"""
            SELECT COUNT(*) AS total_count
            FROM read_parquet('{_lake().counters}')
            WHERE {where}
            """,
            params,
        )
        total_count = int(total_df.iloc[0]["total_count"]) if not total_df.empty else 0

        equipment_clauses, equipment_params = self._equipment_filters(ctx)
        if object_types:
            _append_in_filter(equipment_clauses, equipment_params, "CAST(object_type AS VARCHAR)", object_types)
        if search_text:
            like_term = f"%{search_text}%"
            equipment_clauses.append(
                """
                (
                    LOWER(CAST(site_id AS VARCHAR)) LIKE ?
                    OR LOWER(CAST(object_type AS VARCHAR)) LIKE ?
                    OR LOWER(CAST(snapshot_date AS VARCHAR)) LIKE ?
                )
                """.strip()
            )
            equipment_params.extend([like_term, like_term, like_term])
        equipment_where = " AND ".join(equipment_clauses) if equipment_clauses else "1=1"

        rows = query(
            f"""
            WITH base AS (
                SELECT
                    CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                    CAST(site_id AS VARCHAR) AS site_id,
                    CAST(object_type AS VARCHAR) AS object_type,
                    COALESCE(equipment_count, 0) AS equipment_count
                FROM read_parquet('{_lake().counters}')
                WHERE {where}
            ),
            serial_scope AS (
                SELECT
                    CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                    CAST(site_id AS VARCHAR) AS site_id,
                    CAST(object_type AS VARCHAR) AS object_type,
                    SUM(serial_occurrences) AS serial_rows,
                    COUNT(*) AS unique_serials,
                    COUNT(CASE WHEN serial_occurrences > 1 THEN 1 END) AS duplicated_serials
                FROM (
                    SELECT
                        CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                        CAST(site_id AS VARCHAR) AS site_id,
                        CAST(object_type AS VARCHAR) AS object_type,
                        TRIM(CAST(serial_number AS VARCHAR)) AS serial_number,
                        COUNT(*) AS serial_occurrences
                    FROM read_parquet('{_lake().equipment}')
                    WHERE {equipment_where}
                      AND serial_number IS NOT NULL
                      AND TRIM(CAST(serial_number AS VARCHAR)) <> ''
                    GROUP BY
                        CAST(snapshot_date AS VARCHAR),
                        CAST(site_id AS VARCHAR),
                        CAST(object_type AS VARCHAR),
                        TRIM(CAST(serial_number AS VARCHAR))
                ) serial_counts
                GROUP BY snapshot_date, site_id, object_type
            ),
            site_totals AS (
                SELECT site_id, SUM(equipment_count) AS site_total_assets
                FROM base
                GROUP BY site_id
            ),
            object_totals AS (
                SELECT object_type, SUM(equipment_count) AS object_total_assets, COUNT(DISTINCT site_id) AS sites_count
                FROM base
                GROUP BY object_type
            )
            SELECT
                snapshot_date,
                site_id,
                object_type,
                equipment_count,
                site_total_assets,
                object_total_assets,
                sites_count,
                COALESCE(serial_scope.unique_serials, 0) AS unique_serials,
                COALESCE(serial_scope.duplicated_serials, 0) AS duplicated_serials,
                ROUND(COALESCE(serial_scope.unique_serials, 0) * 100.0 / NULLIF(serial_scope.serial_rows, 0), 1) AS unique_serial_rate,
                ROUND(equipment_count * 100.0 / NULLIF(site_total_assets, 0), 1) AS site_asset_share,
                ROUND(equipment_count * 100.0 / NULLIF(object_total_assets, 0), 1) AS object_asset_share
            FROM base
            LEFT JOIN serial_scope USING (snapshot_date, site_id, object_type)
            LEFT JOIN site_totals USING (site_id)
            LEFT JOIN object_totals USING (object_type)
            ORDER BY snapshot_date DESC, site_total_assets DESC, site_id, {self._object_order_case()}, object_type
            {self._limit_clause(unlimited)}
            """,
            [*params, *equipment_params, *self._limit_params(unlimited, safe_size, offset)],
        )

        object_types_df = query(
            f"""
            SELECT DISTINCT CAST(object_type AS VARCHAR) AS object_type
            FROM read_parquet('{_lake().counters}')
            WHERE {where}
            ORDER BY {self._object_order_case()}, object_type
            """,
            params,
        )

        return {
            "rows": rows.to_dict(orient="records"),
            "total_count": total_count,
            "page": safe_page,
            "page_size": total_count if unlimited else safe_size,
            "object_types": object_types_df["object_type"].astype(str).tolist() if not object_types_df.empty else [],
            "summary": {
                "total_assets": total_assets,
                "total_sites": total_sites,
                "total_object_types": total_object_types,
                "avg_assets_per_site": avg_assets_per_site,
            },
        }

    def get_asset_product_codes_page_v2(
        self,
        ctx: FilterContext,
        *,
        object_types: list[str] | None = None,
        page: int = 1,
        page_size: int = 0,
        search: str = "",
        unique_serial_only: bool = True,
        pivot_product_code: bool = False,
    ) -> dict[str, Any]:
        clauses, params = self._equipment_filters(ctx)
        if object_types:
            _append_in_filter(clauses, params, "CAST(object_type AS VARCHAR)", object_types)
        search_text = (search or "").strip().lower()
        if search_text:
            like_term = f"%{search_text}%"
            clauses.append(
                """
                (
                    LOWER(CAST(object_type AS VARCHAR)) LIKE ?
                    OR LOWER(CAST(product_name AS VARCHAR)) LIKE ?
                    OR LOWER(CAST(product_code AS VARCHAR)) LIKE ?
                    OR LOWER(CAST(serial_number AS VARCHAR)) LIKE ?
                )
                """.strip()
            )
            params.extend([like_term, like_term, like_term, like_term])
        where = " AND ".join(clauses) if clauses else "1=1"
        safe_page, safe_size, offset, unlimited = self._normalize_pagination(page, page_size)

        if pivot_product_code:
            scoped_where = f"{where} AND serial_number IS NOT NULL AND TRIM(CAST(serial_number AS VARCHAR)) <> ''"
            total_df = query(
                f"""
                SELECT COUNT(*) AS total_count
                FROM (
                    SELECT 1
                    FROM read_parquet('{_lake().equipment}')
                    WHERE {scoped_where}
                    GROUP BY CAST(product_code AS VARCHAR)
                ) grouped
                """,
                params,
            )
            total_count = int(total_df.iloc[0]["total_count"]) if not total_df.empty else 0

            rows = query(
                f"""
                SELECT
                    CAST(product_code AS VARCHAR) AS product_code,
                    CAST(MAX(product_name) AS VARCHAR) AS product_name,
                    COUNT(*) AS product_code_count
                FROM read_parquet('{_lake().equipment}')
                WHERE {scoped_where}
                GROUP BY CAST(product_code AS VARCHAR)
                ORDER BY product_code_count DESC, product_code
                {self._limit_clause(unlimited)}
                """,
                [*params, *self._limit_params(unlimited, safe_size, offset)],
            )

            return {
                "rows": rows.to_dict(orient="records"),
                "total_count": total_count,
                "page": safe_page,
                "page_size": total_count if unlimited else safe_size,
                "unique_serial_only": unique_serial_only,
                "pivot_product_code": True,
            }

        if unique_serial_only:
            scoped_where = f"{where} AND serial_number IS NOT NULL AND TRIM(CAST(serial_number AS VARCHAR)) <> ''"
            total_df = query(
                f"""
                SELECT COUNT(*) AS total_count
                FROM (
                    SELECT 1
                    FROM (
                        SELECT
                            CAST(object_type AS VARCHAR) AS object_type,
                            CAST(product_name AS VARCHAR) AS product_name,
                            CAST(product_code AS VARCHAR) AS product_code,
                            TRIM(CAST(serial_number AS VARCHAR)) AS serial_number
                        FROM read_parquet('{_lake().equipment}')
                        WHERE {scoped_where}
                        QUALIFY ROW_NUMBER() OVER (
                            PARTITION BY TRIM(CAST(serial_number AS VARCHAR))
                            ORDER BY object_type, product_name, product_code
                        ) = 1
                    ) deduped
                    GROUP BY object_type, product_name, product_code
                ) grouped
                """,
                params,
            )
            total_count = int(total_df.iloc[0]["total_count"]) if not total_df.empty else 0

            rows = query(
                f"""
                WITH scoped AS (
                    SELECT
                        CAST(object_type AS VARCHAR) AS object_type,
                        CAST(product_name AS VARCHAR) AS product_name,
                        CAST(product_code AS VARCHAR) AS product_code,
                        TRIM(CAST(serial_number AS VARCHAR)) AS serial_number
                    FROM read_parquet('{_lake().equipment}')
                    WHERE {scoped_where}
                ),
                deduped AS (
                    SELECT
                        object_type,
                        product_name,
                        product_code,
                        serial_number
                    FROM scoped
                    QUALIFY ROW_NUMBER() OVER (
                        PARTITION BY serial_number
                        ORDER BY object_type, product_name, product_code
                    ) = 1
                )
                SELECT
                    object_type,
                    product_name,
                    product_code,
                    COUNT(*) AS product_code_count
                FROM deduped
                GROUP BY object_type, product_name, product_code
                ORDER BY product_code_count DESC, object_type, product_name, product_code
                {self._limit_clause(unlimited)}
                """,
                [*params, *self._limit_params(unlimited, safe_size, offset)],
            )
        else:
            total_df = query(
                f"""
                SELECT COUNT(*) AS total_count
                FROM (
                    SELECT 1
                    FROM read_parquet('{_lake().equipment}')
                    WHERE {where}
                    GROUP BY
                        CAST(object_type AS VARCHAR),
                        CAST(product_name AS VARCHAR),
                        CAST(product_code AS VARCHAR)
                ) grouped
                """,
                params,
            )
            total_count = int(total_df.iloc[0]["total_count"]) if not total_df.empty else 0

            rows = query(
                f"""
                SELECT
                    CAST(object_type AS VARCHAR) AS object_type,
                    CAST(product_name AS VARCHAR) AS product_name,
                    CAST(product_code AS VARCHAR) AS product_code,
                    SUM(COALESCE(nb_equipment, 1)) AS product_code_count
                FROM read_parquet('{_lake().equipment}')
                WHERE {where}
                GROUP BY
                    CAST(object_type AS VARCHAR),
                    CAST(product_name AS VARCHAR),
                    CAST(product_code AS VARCHAR)
                ORDER BY product_code_count DESC, object_type, product_name, product_code
                {self._limit_clause(unlimited)}
                """,
                [*params, *self._limit_params(unlimited, safe_size, offset)],
            )

        return {
            "rows": rows.to_dict(orient="records"),
            "total_count": total_count,
            "page": safe_page,
            "page_size": total_count if unlimited else safe_size,
            "unique_serial_only": unique_serial_only,
            "pivot_product_code": False,
        }

    def get_global_counters_page(self, ctx: FilterContext) -> dict[str, Any]:
        if not (ctx.effective_dates or ctx.selected_dates):
            return {
                "rows": [],
                "summary": {
                    "object_type_count": 0,
                    "raw_records": 0,
                    "unique_serials": 0,
                    "empty_serials": 0,
                    "duplicated_serials": 0,
                },
            }
        clauses, params = self._equipment_filters(ctx)
        where = " AND ".join(clauses) if clauses else "1=1"

        rows = query(
            f"""
            WITH base AS (
                SELECT
                    CAST(object_type AS VARCHAR) AS object_type,
                    TRIM(CAST(serial_number AS VARCHAR)) AS serial_number
                FROM read_parquet('{_lake().equipment}')
                WHERE {where}
            ),
            stats AS (
                SELECT
                    object_type,
                    COUNT(*) AS raw_records,
                    COUNT(DISTINCT CASE
                        WHEN serial_number IS NOT NULL AND serial_number <> ''
                        THEN serial_number
                    END) AS unique_serials,
                    SUM(CASE WHEN serial_number IS NULL OR serial_number = '' THEN 1 ELSE 0 END) AS empty_serials
                FROM base
                GROUP BY object_type
            )
            SELECT
                object_type,
                raw_records,
                unique_serials,
                empty_serials,
                (raw_records - empty_serials - unique_serials) AS duplicated_serials,
                ROUND((unique_serials * 100.0) / NULLIF(raw_records, 0), 1) AS quality_rate
            FROM stats
            ORDER BY {self._object_order_case()}, object_type
            """,
            params,
        )

        if rows.empty:
            return {
                "rows": [],
                "summary": {
                    "object_type_count": 0,
                    "raw_records": 0,
                    "unique_serials": 0,
                    "empty_serials": 0,
                    "duplicated_serials": 0,
                },
            }

        return {
            "rows": rows.to_dict(orient="records"),
            "summary": {
                "object_type_count": int(rows["object_type"].astype(str).nunique()),
                "raw_records": int(rows["raw_records"].sum()),
                "unique_serials": int(rows["unique_serials"].sum()),
                "empty_serials": int(rows["empty_serials"].sum()),
                "duplicated_serials": int(rows["duplicated_serials"].sum()),
            },
        }

    def get_delta_comparison(self, ctx: FilterContext, date_1: str, date_2: str) -> dict[str, Any]:
        if not date_1 or not date_2 or date_1 == date_2:
            return {"comparison": [], "details": [], "equipment_changes": []}

        base_site_clauses: list[str] = []
        base_site_params: list[Any] = []
        _append_in_filter(base_site_clauses, base_site_params, "CAST(source_file AS VARCHAR)", ctx.selected_files)
        _append_in_filter(base_site_clauses, base_site_params, "CAST(site_id AS VARCHAR)", ctx.selected_sites)
        base_site_where = " AND ".join(base_site_clauses) if base_site_clauses else "1=1"

        site_metrics = query(
            f"""
            WITH site_rows AS (
                SELECT
                    CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                    CAST(site_id AS VARCHAR) AS site_id,
                    LOWER(CAST(site_state AS VARCHAR)) AS site_state,
                    COALESCE(nb_cells_2g, 0) AS nb_cells_2g,
                    COALESCE(nb_cells_3g, 0) AS nb_cells_3g,
                    COALESCE(nb_cells_lte_4g, 0) AS nb_cells_lte_4g,
                    COALESCE(nb_cells_lte_fdd, 0) AS nb_cells_lte_fdd,
                    COALESCE(nb_cells_lte_tdd, 0) AS nb_cells_lte_tdd,
                    COALESCE(nb_cells_5g, 0) AS nb_cells_5g
                FROM read_parquet('{_lake().sites}')
                WHERE {base_site_where}
                  AND CAST(snapshot_date AS VARCHAR) IN (?, ?)
            ),
            site_dedup AS (
                SELECT
                    snapshot_date,
                    site_id,
                    MAX(site_state) AS site_state,
                    MAX(nb_cells_2g) AS nb_cells_2g,
                    MAX(nb_cells_3g) AS nb_cells_3g,
                    MAX(nb_cells_lte_4g) AS nb_cells_lte_4g,
                    MAX(nb_cells_lte_fdd) AS nb_cells_lte_fdd,
                    MAX(nb_cells_lte_tdd) AS nb_cells_lte_tdd,
                    MAX(nb_cells_5g) AS nb_cells_5g
                FROM site_rows
                GROUP BY snapshot_date, site_id
            )
            SELECT
                snapshot_date,
                COUNT(DISTINCT site_id) AS total_sites,
                COUNT(DISTINCT CASE WHEN site_state = 'active' THEN site_id END) AS active_sites,
                COUNT(DISTINCT CASE WHEN site_state = 'blocked' THEN site_id END) AS blocked_sites,
                COALESCE(SUM(nb_cells_2g), 0) AS cells_2g,
                COALESCE(SUM(nb_cells_3g), 0) AS cells_3g,
                COALESCE(SUM(nb_cells_lte_4g), 0) AS cells_4g,
                COALESCE(SUM(nb_cells_lte_fdd), 0) AS cells_4g_fdd,
                COALESCE(SUM(nb_cells_lte_tdd), 0) AS cells_4g_tdd,
                COALESCE(SUM(nb_cells_5g), 0) AS cells_5g
            FROM site_dedup
            GROUP BY snapshot_date
            """,
            [*base_site_params, date_1, date_2],
        )
        site_map = {str(row["snapshot_date"]): row for row in site_metrics.to_dict(orient="records")}
        site_1 = site_map.get(date_1, {})
        site_2 = site_map.get(date_2, {})

        eq_clauses, eq_params = self._equipment_filters(
            FilterContext(
                selected_dates=ctx.selected_dates,
                selected_files=ctx.selected_files,
                selected_sites=ctx.selected_sites,
                selected_file_dates=ctx.selected_file_dates,
                effective_dates=[date_1, date_2],
                site_search=ctx.site_search,
                date_search=ctx.date_search,
                period_start=ctx.period_start,
                period_end=ctx.period_end,
                smart_missing_serial=ctx.smart_missing_serial,
                smart_duplicates=ctx.smart_duplicates,
                smart_critical_quality=ctx.smart_critical_quality,
                language=ctx.language,
            )
        )
        eq_where = " AND ".join(eq_clauses) if eq_clauses else "1=1"
        eq_metrics = query(
            f"""
            SELECT
                CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                COALESCE(SUM(nb_equipment), 0) AS total_equipment,
                COALESCE(SUM(CASE
                    WHEN serial_number IS NOT NULL
                     AND TRIM(CAST(serial_number AS VARCHAR)) <> ''
                    THEN COALESCE(nb_equipment, 1)
                    ELSE 0
                END), 0) AS serial_rows,
                COUNT(DISTINCT CASE
                    WHEN serial_number IS NOT NULL
                    AND TRIM(CAST(serial_number AS VARCHAR)) <> ''
                    THEN TRIM(CAST(serial_number AS VARCHAR))
                END) AS unique_serials,
                COALESCE(SUM(CASE
                    WHEN serial_number IS NULL OR TRIM(CAST(serial_number AS VARCHAR)) = ''
                    THEN COALESCE(nb_equipment, 1)
                    ELSE 0
                END), 0) AS missing_serials
            FROM read_parquet('{_lake().equipment}')
            WHERE {eq_where}
              AND UPPER(CAST(object_type AS VARCHAR)) IN ({_FINAL_EQUIPMENT_SQL})
            GROUP BY snapshot_date
            """,
            eq_params,
        )
        eq_map = {str(row["snapshot_date"]): row for row in eq_metrics.to_dict(orient="records")}
        eq_1 = eq_map.get(date_1, {})
        eq_2 = eq_map.get(date_2, {})

        details = query(
            f"""
            WITH d1 AS (
                SELECT DISTINCT CAST(site_id AS VARCHAR) AS site_id
                FROM read_parquet('{_lake().sites}')
                WHERE {base_site_where} AND CAST(snapshot_date AS VARCHAR) = ?
            ),
            d2 AS (
                SELECT DISTINCT CAST(site_id AS VARCHAR) AS site_id
                FROM read_parquet('{_lake().sites}')
                WHERE {base_site_where} AND CAST(snapshot_date AS VARCHAR) = ?
            )
            SELECT
                'ADDED' AS change_type,
                d2.site_id AS site_id
            FROM d2
            LEFT JOIN d1 ON d1.site_id = d2.site_id
            WHERE d1.site_id IS NULL
            UNION ALL
            SELECT
                'REMOVED' AS change_type,
                d1.site_id AS site_id
            FROM d1
            LEFT JOIN d2 ON d1.site_id = d2.site_id
            WHERE d2.site_id IS NULL
            ORDER BY change_type, site_id
            """,
            [*base_site_params, date_1, *base_site_params, date_2],
        )
        added_sites = int((details["change_type"] == "ADDED").sum()) if not details.empty else 0
        removed_sites = int((details["change_type"] == "REMOVED").sum()) if not details.empty else 0

        equipment_changes = query(
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
                FROM read_parquet('{_lake().equipment}')
                WHERE {eq_where}
                  AND UPPER(CAST(object_type AS VARCHAR)) IN ({_FINAL_EQUIPMENT_SQL})
            ),
            e1 AS (
                SELECT * FROM scoped WHERE snapshot_date = ?
            ),
            e2 AS (
                SELECT * FROM scoped WHERE snapshot_date = ?
            ),
            changes AS (
                SELECT
                    'ADDED' AS change_type,
                    e2.site_id,
                    e2.object_type,
                    e2.id,
                    e2.serial_number,
                    e2.product_code,
                    e2.product_name,
                    e2.nb_equipment,
                    ? AS date_1,
                    ? AS date_2
                FROM e2
                LEFT JOIN e1
                  ON e1.site_id = e2.site_id
                 AND e1.object_type = e2.object_type
                 AND e1.id = e2.id
                WHERE e1.id IS NULL
                UNION ALL
                SELECT
                    'REMOVED' AS change_type,
                    e1.site_id,
                    e1.object_type,
                    e1.id,
                    e1.serial_number,
                    e1.product_code,
                    e1.product_name,
                    e1.nb_equipment,
                    ? AS date_1,
                    ? AS date_2
                FROM e1
                LEFT JOIN e2
                  ON e1.site_id = e2.site_id
                 AND e1.object_type = e2.object_type
                 AND e1.id = e2.id
                WHERE e2.id IS NULL
            )
            SELECT *
            FROM changes
            ORDER BY change_type, site_id, {self._object_order_case("changes.object_type")}, changes.object_type, changes.id
            """,
            [*eq_params, date_1, date_2, date_1, date_2, date_1, date_2],
        )

        metrics = [
            ("total_sites", "sites", int(site_1.get("total_sites", 0)), int(site_2.get("total_sites", 0)), False),
            ("added_sites", "sites", 0, added_sites, False),
            ("removed_sites", "sites", 0, removed_sites, True),
            ("active_sites", "sites", int(site_1.get("active_sites", 0)), int(site_2.get("active_sites", 0)), False),
            ("blocked_sites", "sites", int(site_1.get("blocked_sites", 0)), int(site_2.get("blocked_sites", 0)), True),
            ("total_equipment", "equipment", int(eq_1.get("total_equipment", 0)), int(eq_2.get("total_equipment", 0)), False),
            ("serial_rows", "equipment", int(eq_1.get("serial_rows", 0)), int(eq_2.get("serial_rows", 0)), False),
            ("unique_serials", "equipment", int(eq_1.get("unique_serials", 0)), int(eq_2.get("unique_serials", 0)), False),
            ("missing_serials", "equipment", int(eq_1.get("missing_serials", 0)), int(eq_2.get("missing_serials", 0)), True),
            ("cells_2g", "cells", int(site_1.get("cells_2g", 0)), int(site_2.get("cells_2g", 0)), False),
            ("cells_3g", "cells", int(site_1.get("cells_3g", 0)), int(site_2.get("cells_3g", 0)), False),
            ("cells_4g", "cells", int(site_1.get("cells_4g", 0)), int(site_2.get("cells_4g", 0)), False),
            ("cells_4g_fdd", "cells", int(site_1.get("cells_4g_fdd", 0)), int(site_2.get("cells_4g_fdd", 0)), False),
            ("cells_4g_tdd", "cells", int(site_1.get("cells_4g_tdd", 0)), int(site_2.get("cells_4g_tdd", 0)), False),
            ("cells_5g", "cells", int(site_1.get("cells_5g", 0)), int(site_2.get("cells_5g", 0)), False),
        ]

        comparison: list[dict[str, Any]] = []
        for name, group, value_1, value_2, negative_when_up in metrics:
            delta = value_2 - value_1
            if delta == 0:
                status = "stable"
            elif negative_when_up and delta > 0:
                status = "warning"
            elif negative_when_up and delta < 0:
                status = "ok"
            elif delta > 0:
                status = "up"
            else:
                status = "down"
            comparison.append(
                {
                    "metric": name,
                    "group": group,
                    "date_1": date_1,
                    "date_2": date_2,
                    "value_1": value_1,
                    "value_2": value_2,
                    "delta": delta,
                    "status": status,
                }
            )
        return {
            "comparison": comparison,
            "details": details.to_dict(orient="records"),
            "equipment_changes": equipment_changes.to_dict(orient="records"),
        }

    def get_quality_page(self, ctx: FilterContext) -> dict[str, Any]:
        clauses, params = self._equipment_filters(ctx)
        if not clauses:
            return {"rows": [], "summary": {}}
        where = " AND ".join(clauses)
        rows = query(
            f"""
            WITH base AS (
                SELECT
                    CAST(site_id AS VARCHAR) AS site_id,
                    CAST(object_type AS VARCHAR) AS object_type,
                    CAST(id AS VARCHAR) AS equipment_id,
                    TRIM(CAST(serial_number AS VARCHAR)) AS serial_number,
                    TRIM(CAST(product_code AS VARCHAR)) AS product_code,
                    TRIM(CAST(product_name AS VARCHAR)) AS product_name
                FROM read_parquet('{_lake().equipment}')
                WHERE {where}
            ),
            serial_stats AS (
                SELECT
                    site_id,
                    object_type,
                    serial_number,
                    COUNT(*) AS serial_occurrences
                FROM base
                WHERE NOT ({duckdb_field_is_missing("serial_number")})
                GROUP BY site_id, object_type, serial_number
            )
            SELECT
                base.site_id AS site_id,
                base.object_type AS object_type,
                COUNT(*) AS records,
                SUM(CASE WHEN {duckdb_field_is_missing("base.serial_number")} THEN 1 ELSE 0 END) AS missing_serial,
                SUM(CASE WHEN {duckdb_field_is_missing("base.product_code")} THEN 1 ELSE 0 END) AS missing_product_code,
                SUM(CASE WHEN {duckdb_field_is_missing("base.product_name")} THEN 1 ELSE 0 END) AS missing_product_name,
                COUNT(DISTINCT CASE WHEN NOT ({duckdb_field_is_missing("base.serial_number")}) THEN base.serial_number END) AS unique_serials,
                SUM(CASE WHEN serial_stats.serial_occurrences > 1 THEN 1 ELSE 0 END) AS duplicated_records
            FROM base
            LEFT JOIN serial_stats
                ON base.site_id = serial_stats.site_id
               AND base.object_type = serial_stats.object_type
               AND base.serial_number = serial_stats.serial_number
            GROUP BY base.site_id, base.object_type
            ORDER BY
                base.site_id,
                CASE
                    WHEN base.object_type = 'CABINET' THEN 10
                    WHEN base.object_type = 'BBMOD' THEN 20
                    WHEN base.object_type = 'RMOD' THEN 30
                    WHEN base.object_type = 'SMOD' THEN 40
                    WHEN base.object_type = 'RETU' THEN 90
                    WHEN base.object_type = 'ALD' THEN 91
                    WHEN base.object_type = 'ANTL' THEN 92
                    ELSE 50
                END,
                base.object_type
            """,
            params,
        )
        if rows.empty:
            return {"rows": [], "summary": {}}

        rows["missing_total"] = rows["missing_serial"] + rows["missing_product_code"] + rows["missing_product_name"]
        rows["completeness_percent"] = (
            ((rows["records"] * 3 - rows["missing_total"]) * 100.0) / (rows["records"] * 3)
        ).round(1)
        rows["serial_quality_percent"] = ((rows["unique_serials"] * 100.0) / rows["records"]).round(1)
        rows["risk_score"] = (
            rows["missing_total"] * 2 + rows["duplicated_records"] * 3 + (100 - rows["completeness_percent"])
        ).round(1)
        rows["severity"] = rows.apply(
            lambda r: "low"
            if r["missing_total"] == 0 and r["duplicated_records"] == 0 and r["completeness_percent"] >= 99.9
            else ("medium" if r["completeness_percent"] >= 85 and r["serial_quality_percent"] >= 85 else "high"),
            axis=1,
        )

        summary = {
            "total_records": int(rows["records"].sum()),
            "total_missing": int(rows["missing_total"].sum()),
            "total_duplicates": int(rows["duplicated_records"].sum()),
            "avg_completeness": round(float(rows["completeness_percent"].mean()), 1),
            "avg_serial_quality": round(float(rows["serial_quality_percent"].mean()), 1),
            "network_quality_score": round(
                float(rows["completeness_percent"].mean()) * 0.6 + float(rows["serial_quality_percent"].mean()) * 0.4,
                1,
            ),
            "critical_groups": int((rows["severity"] == "high").sum()),
        }
        return {"rows": rows.to_dict(orient="records"), "summary": summary}

    def get_site_investigation(self, ctx: FilterContext, site_id: str, object_type: str = "") -> dict[str, Any]:
        site_history = query(
            f"""
            SELECT
                CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                CAST(source_file AS VARCHAR) AS source_file,
                CAST(site_id AS VARCHAR) AS site_id,
                CAST(site_name AS VARCHAR) AS site_name,
                CAST(site_state AS VARCHAR) AS site_state,
                CAST(blocking_state AS VARCHAR) AS blocking_state,
                CAST(ip_address AS VARCHAR) AS ip_address,
                CAST(sw_version AS VARCHAR) AS sw_version,
                COALESCE(nb_cells, 0) AS nb_cells,
                COALESCE(nb_cells_2g, 0) AS nb_cells_2g,
                COALESCE(nb_cells_3g, 0) AS nb_cells_3g,
                COALESCE(nb_cells_lte_4g, 0) AS nb_cells_lte_4g,
                COALESCE(nb_cells_lte_fdd, 0) AS nb_cells_lte_fdd,
                COALESCE(nb_cells_lte_tdd, 0) AS nb_cells_lte_tdd,
                COALESCE(nb_cells_5g, 0) AS nb_cells_5g,
                CAST(technologies AS VARCHAR) AS technologies
            FROM read_parquet('{_lake().sites}')
            WHERE CAST(site_id AS VARCHAR) = ?
            ORDER BY snapshot_date DESC
            """,
            [site_id],
        )
        clauses, params = self._equipment_filters(ctx)
        clauses.append("CAST(site_id AS VARCHAR) = ?")
        params.append(site_id)
        if object_type:
            clauses.append("CAST(object_type AS VARCHAR) = ?")
            params.append(object_type)
        equipment = query(
            f"""
            SELECT
                CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                CAST(source_file AS VARCHAR) AS source_file,
                CAST(site_id AS VARCHAR) AS site_id,
                CAST(object_type AS VARCHAR) AS object_type,
                CAST(id AS VARCHAR) AS equipment_id,
                CAST(serial_number AS VARCHAR) AS serial_number,
                CAST(product_code AS VARCHAR) AS product_code,
                CAST(product_name AS VARCHAR) AS product_name
            FROM read_parquet('{_lake().equipment}')
            WHERE {' AND '.join(clauses)}
            ORDER BY snapshot_date DESC, {self._object_order_case()}, object_type, equipment_id
            """,
            params,
        )
        return {"site_history": site_history.to_dict(orient="records"), "equipment": equipment.to_dict(orient="records")}

    def get_serial_investigation(self, serial_number: str) -> dict[str, Any]:
        serial = (serial_number or "").strip()
        if not serial:
            return {"rows": []}
        rows = query(
            f"""
            SELECT
                CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                CAST(source_file AS VARCHAR) AS source_file,
                CAST(site_id AS VARCHAR) AS site_id,
                CAST(object_type AS VARCHAR) AS object_type,
                CAST(id AS VARCHAR) AS equipment_id,
                CAST(serial_number AS VARCHAR) AS serial_number,
                CAST(product_code AS VARCHAR) AS product_code,
                CAST(product_name AS VARCHAR) AS product_name
            FROM read_parquet('{_lake().equipment}')
            WHERE TRIM(CAST(serial_number AS VARCHAR)) = ?
            ORDER BY snapshot_date DESC, site_id, equipment_id
            """,
            [serial],
        )
        return {"rows": rows.to_dict(orient="records")}

    def get_operational_summary(self, ctx: FilterContext) -> dict[str, Any]:
        dates = sorted(ctx.effective_dates or ctx.selected_dates)
        if not dates:
            return {"snapshot_count": 0, "latest_snapshot": "", "quality_score": 0.0, "query_observability": get_query_observability()}

        quality = self.get_quality_page(ctx)
        quality_score = float(quality.get("summary", {}).get("network_quality_score", 0.0))

        return {
            "snapshot_count": len(dates),
            "latest_snapshot": dates[-1],
            "oldest_snapshot": dates[0],
            "smart_filters": {
                "missing_serial": ctx.smart_missing_serial,
                "duplicates": ctx.smart_duplicates,
                "critical_quality": ctx.smart_critical_quality,
            },
            "quality_score": quality_score,
            "query_observability": get_query_observability(),
        }

    def get_assistant_insight(self, ctx: FilterContext, question: str) -> dict[str, Any]:
        from src.services.report_prompt_utils import is_expert_report_prompt

        if is_expert_report_prompt(question):
            return {
                "intent": "expert_report",
                "message": "",
                "rows": [],
                "details": [],
                "sources": [],
                "suggested_questions": [],
                "sql_guardrails": {
                    "mode": "template_sql_only",
                    "allowlist_tables": sorted(self._COPILOT_ALLOWLIST.keys()),
                    "dynamic_sql_generation": False,
                },
            }

        q = (question or "").strip().lower()
        if not q:
            q = "help"

        dates = sorted(ctx.effective_dates or ctx.selected_dates)

        def _default_suggestions() -> list[str]:
            return [
                "Quels sites 5G ont changé de version SW ce mois-ci ?",
                "Donne-moi les 10 sites avec le plus de remplacements de cartes.",
                "Y a-t-il des sites bloqués dans la région Nord ?",
                "Résume la qualité réseau actuelle.",
                "Compare le delta des deux derniers snapshots.",
            ]

        def _build_sources(intent: str, table: str, columns: list[str], rule_note: str) -> list[dict[str, Any]]:
            allowlisted = sorted(self._COPILOT_ALLOWLIST.get(table, set()))
            used_columns = [col for col in columns if col in self._COPILOT_ALLOWLIST.get(table, set())]
            return [
                {
                    "intent": intent,
                    "table": table,
                    "columns_used": used_columns,
                    "allowlisted_columns": allowlisted,
                    "rule_note": rule_note,
                }
            ]

        def _extract_top_n(default_value: int = 10) -> int:
            match = re.search(r"\b(\d{1,3})\b", q)
            if not match:
                return default_value
            value = int(match.group(1))
            return max(1, min(100, value))

        if "5g" in q and ("sw" in q or "version" in q) and any(token in q for token in ["change", "changé", "changement"]):
            site_where, site_params, _, _ = self._site_and_equipment_where(ctx)
            clauses: list[str] = [site_where] if site_where else []
            params: list[Any] = list(site_params)
            clauses.append("LOWER(COALESCE(CAST(technologies AS VARCHAR), '')) LIKE '%5g%'")
            clauses.append("COALESCE(TRIM(CAST(sw_version AS VARCHAR)), '') <> ''")
            sql = f"""
                WITH base AS (
                    SELECT
                        CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                        CAST(site_id AS VARCHAR) AS site_id,
                        COALESCE(CAST(site_name AS VARCHAR), '') AS site_name,
                        COALESCE(CAST(sw_version AS VARCHAR), '') AS sw_version,
                        COALESCE(CAST(technologies AS VARCHAR), '') AS technologies,
                        COALESCE(CAST(source_file AS VARCHAR), '') AS source_file
                    FROM read_parquet('{_lake().sites}')
                    WHERE {' AND '.join(clauses)}
                ),
                changed AS (
                    SELECT
                        site_id,
                        MAX(site_name) AS site_name,
                        MIN(snapshot_date) AS first_snapshot,
                        MAX(snapshot_date) AS last_snapshot,
                        MIN(sw_version) AS old_sw_version,
                        MAX(sw_version) AS new_sw_version,
                        COUNT(DISTINCT sw_version) AS distinct_sw_versions
                    FROM base
                    GROUP BY site_id
                    HAVING COUNT(DISTINCT sw_version) > 1
                )
                SELECT *
                FROM changed
                ORDER BY distinct_sw_versions DESC, site_id
                LIMIT 50
            """
            rows = query(sql, params).to_dict(orient="records")
            return {
                "intent": "ops_5g_sw_changes",
                "message": f"{len(rows)} site(s) 5G avec changement de SW détecté(s) sur la période sélectionnée.",
                "rows": rows,
                "details": [],
                "sources": _build_sources(
                    "ops_5g_sw_changes",
                    "sites",
                    ["snapshot_date", "site_id", "site_name", "sw_version", "technologies", "source_file"],
                    "Filtre 5G + comparaison des versions SW distinctes par site.",
                ),
                "suggested_questions": _default_suggestions(),
                "sql_guardrails": {
                    "mode": "template_sql_only",
                    "allowlist_tables": sorted(self._COPILOT_ALLOWLIST.keys()),
                    "dynamic_sql_generation": False,
                },
            }

        if any(token in q for token in ["remplacement", "remplacements", "replace", "replacements", "carte", "cartes", "card"]):
            top_n = _extract_top_n(10)
            _, _, eq_where, eq_params = self._site_and_equipment_where(ctx)
            clauses: list[str] = [eq_where] if eq_where else []
            params: list[Any] = list(eq_params)
            clauses.append("COALESCE(TRIM(CAST(object_type AS VARCHAR)), '') <> ''")
            sql = f"""
                SELECT
                    CAST(site_id AS VARCHAR) AS site_id,
                    CAST(object_type AS VARCHAR) AS object_type,
                    COUNT(*) AS observed_rows,
                    COUNT(DISTINCT NULLIF(TRIM(CAST(serial_number AS VARCHAR)), '')) AS distinct_serials,
                    GREATEST(COUNT(DISTINCT NULLIF(TRIM(CAST(serial_number AS VARCHAR)), '')) - 1, 0) AS estimated_replacements
                FROM read_parquet('{_lake().equipment}')
                WHERE {' AND '.join(clauses)}
                GROUP BY site_id, object_type
                HAVING GREATEST(COUNT(DISTINCT NULLIF(TRIM(CAST(serial_number AS VARCHAR)), '')) - 1, 0) > 0
                ORDER BY estimated_replacements DESC, observed_rows DESC, site_id
                LIMIT ?
            """
            rows = query(sql, [*params, top_n]).to_dict(orient="records")
            return {
                "intent": "ops_top_replacements",
                "message": f"Top {top_n} des sites/objets avec le plus de remplacements estimés sur la période sélectionnée.",
                "rows": rows,
                "details": [],
                "sources": _build_sources(
                    "ops_top_replacements",
                    "equipment",
                    ["snapshot_date", "site_id", "object_type", "serial_number", "source_file"],
                    "Estimation via variation de serial numbers distincts par site et type.",
                ),
                "suggested_questions": _default_suggestions(),
                "sql_guardrails": {
                    "mode": "template_sql_only",
                    "allowlist_tables": sorted(self._COPILOT_ALLOWLIST.keys()),
                    "dynamic_sql_generation": False,
                },
            }

        if any(token in q for token in ["bloqué", "bloques", "blocked"]) and any(token in q for token in ["nord", "north"]):
            site_where, site_params, _, _ = self._site_and_equipment_where(ctx)
            clauses: list[str] = [site_where] if site_where else []
            params: list[Any] = list(site_params)
            clauses.append("LOWER(COALESCE(CAST(site_state AS VARCHAR), '')) = 'blocked'")
            clauses.append(
                "(LOWER(COALESCE(CAST(site_name AS VARCHAR), '')) LIKE ? OR LOWER(COALESCE(CAST(site_id AS VARCHAR), '')) LIKE ?)"
            )
            params.extend(["%nord%", "%nord%"])
            sql = f"""
                SELECT
                    CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                    CAST(site_id AS VARCHAR) AS site_id,
                    COALESCE(CAST(site_name AS VARCHAR), '') AS site_name,
                    COALESCE(CAST(site_state AS VARCHAR), '') AS site_state,
                    COALESCE(CAST(ip_address AS VARCHAR), '') AS ip_address,
                    COALESCE(CAST(sw_version AS VARCHAR), '') AS sw_version
                FROM read_parquet('{_lake().sites}')
                WHERE {' AND '.join(clauses)}
                ORDER BY snapshot_date DESC, site_id
                LIMIT 100
            """
            rows = query(sql, params).to_dict(orient="records")
            return {
                "intent": "ops_blocked_north",
                "message": f"{len(rows)} site(s) bloqué(s) détecté(s) pour la zone Nord (match sur nom/identifiant).",
                "rows": rows,
                "details": [],
                "sources": _build_sources(
                    "ops_blocked_north",
                    "sites",
                    ["snapshot_date", "site_id", "site_name", "site_state", "ip_address", "sw_version"],
                    "Filtre état bloqué + mot-clé Nord sur site_name/site_id.",
                ),
                "suggested_questions": _default_suggestions(),
                "sql_guardrails": {
                    "mode": "template_sql_only",
                    "allowlist_tables": sorted(self._COPILOT_ALLOWLIST.keys()),
                    "dynamic_sql_generation": False,
                },
            }

        quality = self.get_quality_page(ctx)
        quality_summary = quality.get("summary", {})
        prediction_rows = self.get_prediction_page(ctx)
        top_prediction = prediction_rows[0] if prediction_rows else None

        if any(keyword in q for keyword in ["qualité", "quality", "fault", "panne"]):
            score = quality_summary.get("network_quality_score", 0)
            critical = quality_summary.get("critical_groups", 0)
            status = "healthy" if score >= 90 else "warning" if score >= 75 else "critical"
            return {
                "intent": "quality_summary",
                "message": f"Qualité réseau: score {score}/100, groupes critiques: {critical}.",
                "status": status,
                "rows": quality.get("rows", []),
                "details": [],
                "sources": _build_sources(
                    "quality_summary",
                    "completeness",
                    ["snapshot_date", "site_id", "object_type", "completeness_percent", "serial_missing", "product_code_missing", "product_name_missing"],
                    "Synthèse qualité calculée depuis le rapport de complétude.",
                ),
                "suggested_questions": _default_suggestions(),
                "sql_guardrails": {
                    "mode": "template_sql_only",
                    "allowlist_tables": sorted(self._COPILOT_ALLOWLIST.keys()),
                    "dynamic_sql_generation": False,
                },
            }

        if any(keyword in q for keyword in ["spare", "stock", "prévision", "prediction", "predict"]):
            if not top_prediction:
                return {
                    "intent": "prediction_empty",
                    "message": "Aucune donnée de prédiction disponible pour les filtres courants.",
                    "rows": [],
                    "details": [],
                    "sources": [],
                    "suggested_questions": _default_suggestions(),
                    "sql_guardrails": {
                        "mode": "template_sql_only",
                        "allowlist_tables": sorted(self._COPILOT_ALLOWLIST.keys()),
                        "dynamic_sql_generation": False,
                    },
                }
            return {
                "intent": "spares_forecast",
                "message": (
                    f"Type prioritaire: {top_prediction.get('object_type')} "
                    f"(risk_score={top_prediction.get('risk_score')}, "
                    f"estimated_spares_30d={top_prediction.get('estimated_spares_30d')})."
                ),
                "rows": prediction_rows,
                "details": [],
                "sources": _build_sources(
                    "spares_forecast",
                    "equipment",
                    ["snapshot_date", "site_id", "object_type", "serial_number", "product_code", "product_name"],
                    "Prévision spare issue du module de prédiction existant.",
                ),
                "suggested_questions": _default_suggestions(),
                "sql_guardrails": {
                    "mode": "template_sql_only",
                    "allowlist_tables": sorted(self._COPILOT_ALLOWLIST.keys()),
                    "dynamic_sql_generation": False,
                },
            }

        if any(keyword in q for keyword in ["delta", "changement", "change"]):
            if len(dates) < 2:
                return {
                    "intent": "delta_unavailable",
                    "message": "Sélectionnez au moins deux snapshots pour analyser le delta.",
                    "rows": [],
                    "details": [],
                    "sources": [],
                    "suggested_questions": _default_suggestions(),
                    "sql_guardrails": {
                        "mode": "template_sql_only",
                        "allowlist_tables": sorted(self._COPILOT_ALLOWLIST.keys()),
                        "dynamic_sql_generation": False,
                    },
                }
            delta = self.get_delta_comparison(ctx, dates[-2], dates[-1])
            return {
                "intent": "delta_compare",
                "message": f"Comparaison générée entre {dates[-2]} et {dates[-1]}.",
                "rows": delta.get("comparison", []),
                "details": delta.get("details", []),
                "sources": _build_sources(
                    "delta_compare",
                    "sites",
                    ["snapshot_date", "site_id", "site_state", "sw_version", "technologies"],
                    "Comparaison inter-snapshots basée sur les métriques delta.",
                ),
                "suggested_questions": _default_suggestions(),
                "sql_guardrails": {
                    "mode": "template_sql_only",
                    "allowlist_tables": sorted(self._COPILOT_ALLOWLIST.keys()),
                    "dynamic_sql_generation": False,
                },
            }

        return {
            "intent": "general_ops",
            "message": (
                "Je peux explorer vos données réseau : qualité, delta, sites, équipements, remplacements et tendances."
            ),
            "rows": [],
            "details": [],
            "sources": [],
            "suggested_questions": _default_suggestions(),
            "sql_guardrails": {
                "mode": "template_sql_only",
                "allowlist_tables": sorted(self._COPILOT_ALLOWLIST.keys()),
                "dynamic_sql_generation": False,
            },
        }

    def ask_assistant(self, question: str) -> dict[str, Any]:
        q = (question or "").lower()
        if "bloqué" in q or "blocked" in q:
            result = query(
                f"""
                SELECT snapshot_date, site_id, site_name, ip_address, sw_version
                FROM read_parquet('{_lake().sites}')
                WHERE LOWER(site_state) = 'blocked'
                ORDER BY snapshot_date DESC, site_id
                """
            )
            return {
                "message": "Voici les sites bloqués détectés :",
                "intent": "blocked_sites",
                "rows": result.to_dict(orient="records"),
            }
        if "rmod" in q:
            result = query(
                f"""
                SELECT snapshot_date, site_id, object_type, serial_number, product_code, product_name
                FROM read_parquet('{_lake().equipment}')
                WHERE object_type = 'RMOD'
                """
            )
            return {
                "message": "Voici un échantillon des équipements RMOD :",
                "intent": "rmod_sample",
                "rows": result.to_dict(orient="records"),
            }
        if "serial" in q:
            result = query(
                f"""
                SELECT serial_number, COUNT(*) AS occurrences
                FROM read_parquet('{_lake().equipment}')
                WHERE serial_number IS NOT NULL
                GROUP BY serial_number
                HAVING COUNT(*) > 1
                ORDER BY occurrences DESC
                """
            )
            return {
                "message": "Voici les numéros de série répétés :",
                "intent": "duplicate_serials",
                "rows": result.to_dict(orient="records"),
            }
        return {
            "message": "Je peux répondre pour l’instant aux questions sur : sites bloqués, RMOD, serial numbers répétés.",
            "intent": "fallback",
            "rows": [],
        }

    @staticmethod
    def _anomaly_level(score: float) -> str:
        if score >= 80:
            return "Critical"
        if score >= 60:
            return "High"
        if score >= 35:
            return "Medium"
        return "Low"

    _ML_FEATURES = [
        "equipment_rows",
        "object_types",
        "missing_serials",
        "serial_churn",
        "sw_versions",
        "nb_cells",
        "cells_2g",
        "cells_3g",
        "cells_4g",
        "cells_5g",
        "blocked",
    ]

    def _build_site_feature_frame(
        self,
        dates: list[str],
        scope_clauses: list[str],
        scope_params: list[Any],
    ) -> "pd.DataFrame":
        """Per-site cross-sectional feature matrix used by ML modules."""
        scope_sql = (" AND " + " AND ".join(scope_clauses)) if scope_clauses else ""
        date_clause, date_params = _in_clause(dates)
        latest = sorted(dates)[-1]

        sites_df = query(
            f"""
            SELECT
                CAST(site_id AS VARCHAR) AS site_id,
                MAX(COALESCE(CAST(site_name AS VARCHAR), '')) AS site_name,
                COUNT(DISTINCT NULLIF(TRIM(CAST(sw_version AS VARCHAR)), '')) AS sw_versions,
                MAX(COALESCE(nb_cells, 0)) AS nb_cells,
                MAX(COALESCE(nb_cells_2g, 0)) AS cells_2g,
                MAX(COALESCE(nb_cells_3g, 0)) AS cells_3g,
                MAX(COALESCE(nb_cells_lte_4g, 0)) AS cells_4g,
                MAX(COALESCE(nb_cells_5g, 0)) AS cells_5g,
                MAX(CASE WHEN LOWER(CAST(site_state AS VARCHAR)) = 'blocked' THEN 1 ELSE 0 END) AS blocked
            FROM read_parquet('{_lake().sites}')
            WHERE CAST(snapshot_date AS VARCHAR) IN {date_clause}{scope_sql}
            GROUP BY site_id
            """,
            [*date_params, *scope_params],
        )

        equip_latest = query(
            f"""
            SELECT
                CAST(site_id AS VARCHAR) AS site_id,
                SUM(COALESCE(nb_equipment, 0)) AS equipment_rows,
                COUNT(DISTINCT CAST(object_type AS VARCHAR)) AS object_types,
                SUM(CASE WHEN serial_number IS NULL OR TRIM(CAST(serial_number AS VARCHAR)) = '' THEN 1 ELSE 0 END) AS missing_serials
            FROM read_parquet('{_lake().equipment}')
            WHERE CAST(snapshot_date AS VARCHAR) = ?{scope_sql}
            GROUP BY site_id
            """,
            [latest, *scope_params],
        )

        churn_df = query(
            f"""
            WITH per_snapshot AS (
                SELECT
                    CAST(site_id AS VARCHAR) AS site_id,
                    CAST(object_type AS VARCHAR) AS object_type,
                    CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                    COUNT(DISTINCT NULLIF(TRIM(CAST(serial_number AS VARCHAR)), '')) AS serials_in_snapshot
                FROM read_parquet('{_lake().equipment}')
                WHERE CAST(snapshot_date AS VARCHAR) IN {date_clause}{scope_sql}
                GROUP BY site_id, object_type, snapshot_date
            ),
            totals AS (
                SELECT
                    CAST(site_id AS VARCHAR) AS site_id,
                    CAST(object_type AS VARCHAR) AS object_type,
                    COUNT(DISTINCT NULLIF(TRIM(CAST(serial_number AS VARCHAR)), '')) AS total_distinct
                FROM read_parquet('{_lake().equipment}')
                WHERE CAST(snapshot_date AS VARCHAR) IN {date_clause}{scope_sql}
                GROUP BY site_id, object_type
            ),
            per_type AS (
                SELECT
                    t.site_id AS site_id,
                    GREATEST(t.total_distinct - MAX(p.serials_in_snapshot), 0) AS churn
                FROM totals t
                JOIN per_snapshot p ON t.site_id = p.site_id AND t.object_type = p.object_type
                GROUP BY t.site_id, t.object_type, t.total_distinct
            )
            SELECT site_id, SUM(churn) AS serial_churn
            FROM per_type
            GROUP BY site_id
            """,
            [*date_params, *scope_params, *date_params, *scope_params],
        )

        frame = sites_df.merge(equip_latest, on="site_id", how="left").merge(churn_df, on="site_id", how="left")
        for column in self._ML_FEATURES:
            if column not in frame.columns:
                frame[column] = 0
            frame[column] = pd.to_numeric(frame[column], errors="coerce").fillna(0)
        return frame

    def _ml_site_anomalies(
        self,
        dates: list[str],
        scope_clauses: list[str],
        scope_params: list[Any],
        contamination: float = 0.05,
    ) -> dict[str, Any]:
        """Unsupervised anomaly scoring (Isolation Forest) with per-site explainability."""
        empty = {
            "available": False,
            "rows": [],
            "summary": {"sites": 0, "anomalies": 0, "contamination": contamination},
            "feature_importance": [],
            "score_map": {},
        }
        try:
            import numpy as np
            from sklearn.ensemble import IsolationForest
            from sklearn.preprocessing import StandardScaler
        except Exception:
            return empty

        frame = self._build_site_feature_frame(dates, scope_clauses, scope_params)
        if frame.empty or len(frame) < 12:
            return empty

        feature_matrix = frame[self._ML_FEATURES].to_numpy(dtype=float)
        scaler = StandardScaler()
        scaled = scaler.fit_transform(feature_matrix)

        model = IsolationForest(
            n_estimators=200,
            contamination=contamination,
            random_state=42,
        )
        model.fit(scaled)
        raw = -model.score_samples(scaled)  # higher = more anomalous
        predictions = model.predict(scaled)  # -1 anomaly, 1 normal

        lo, hi = float(raw.min()), float(raw.max())
        span = (hi - lo) or 1.0
        ml_score = ((raw - lo) / span) * 100.0

        feature_names = self._ML_FEATURES
        median = np.median(scaled, axis=0)
        deviation = np.abs(scaled - median)

        rows: list[dict[str, Any]] = []
        for idx in range(len(frame)):
            site_id = str(frame.iloc[idx]["site_id"])
            site_name = str(frame.iloc[idx].get("site_name", ""))
            is_anomaly = bool(predictions[idx] == -1)
            top_idx = np.argsort(deviation[idx])[::-1][:3]
            drivers = []
            for j in top_idx:
                if deviation[idx][j] < 0.5:
                    continue
                direction = "élevé" if scaled[idx][j] > median[j] else "faible"
                drivers.append(f"{feature_names[j]} {direction}")
            rows.append(
                {
                    "site_id": site_id,
                    "site_name": site_name,
                    "ml_score": round(float(ml_score[idx]), 1),
                    "ml_flag": "anomaly" if is_anomaly else "normal",
                    "top_features": ", ".join(drivers) if drivers else "profil nominal",
                    "equipment_rows": int(frame.iloc[idx]["equipment_rows"]),
                    "serial_churn": int(frame.iloc[idx]["serial_churn"]),
                    "missing_serials": int(frame.iloc[idx]["missing_serials"]),
                    "sw_versions": int(frame.iloc[idx]["sw_versions"]),
                }
            )

        rows.sort(key=lambda item: item["ml_score"], reverse=True)

        anomaly_mask = predictions == -1
        if anomaly_mask.any():
            importance_values = deviation[anomaly_mask].mean(axis=0)
        else:
            importance_values = deviation.mean(axis=0)
        total_importance = float(importance_values.sum()) or 1.0
        feature_importance = [
            {"feature": feature_names[j], "importance": round(float(importance_values[j] / total_importance * 100.0), 1)}
            for j in range(len(feature_names))
        ]
        feature_importance.sort(key=lambda item: item["importance"], reverse=True)

        score_map = {row["site_id"]: {"ml_score": row["ml_score"], "ml_flag": row["ml_flag"]} for row in rows}

        return {
            "available": True,
            "rows": rows,
            "summary": {
                "sites": int(len(frame)),
                "anomalies": int(anomaly_mask.sum()),
                "contamination": contamination,
            },
            "feature_importance": feature_importance,
            "score_map": score_map,
        }

    def get_anomaly_alerts(self, ctx: FilterContext, replacement_threshold: int = 3) -> dict[str, Any]:
        """Rule-based anomaly detection with severity scoring.

        Rules:
          - SW version change across snapshots (potentially unplanned)
          - Site disappeared between earliest and latest snapshot
          - High replacement rate (distinct serials variation > threshold)
          - Critical data quality (missing serials)
        """
        dates = sorted(ctx.effective_dates or ctx.selected_dates)
        empty_payload = {
            "rows": [],
            "site_summary": [],
            "summary": {"total": 0, "critical": 0, "high": 0, "medium": 0, "low": 0, "sites_impacted": 0},
            "severity_chart": [
                {"level": "Critical", "count": 0},
                {"level": "High", "count": 0},
                {"level": "Medium", "count": 0},
                {"level": "Low", "count": 0},
            ],
            "params": {"replacement_threshold": replacement_threshold, "snapshots": len(dates)},
        }
        if not dates:
            return empty_payload

        threshold = max(1, min(50, int(replacement_threshold)))
        earliest, latest = dates[0], dates[-1]

        # Optional file/site scope (without snapshot filter, handled per-query)
        scope_clauses: list[str] = []
        scope_params: list[Any] = []
        if ctx.selected_files:
            _append_in_filter(scope_clauses, scope_params, "CAST(source_file AS VARCHAR)", ctx.selected_files)
        if ctx.selected_sites:
            _append_in_filter(scope_clauses, scope_params, "CAST(site_id AS VARCHAR)", ctx.selected_sites)
        scope_sql = (" AND " + " AND ".join(scope_clauses)) if scope_clauses else ""

        date_clause, date_params = _in_clause(dates)
        anomalies: list[dict[str, Any]] = []

        # Rule 1: SW version changes
        sw_df = query(
            f"""
            SELECT
                CAST(site_id AS VARCHAR) AS site_id,
                MAX(COALESCE(CAST(site_name AS VARCHAR), '')) AS site_name,
                COUNT(DISTINCT NULLIF(TRIM(CAST(sw_version AS VARCHAR)), '')) AS distinct_sw,
                MIN(NULLIF(TRIM(CAST(sw_version AS VARCHAR)), '')) AS old_sw,
                MAX(NULLIF(TRIM(CAST(sw_version AS VARCHAR)), '')) AS new_sw
            FROM read_parquet('{_lake().sites}')
            WHERE CAST(snapshot_date AS VARCHAR) IN {date_clause}{scope_sql}
            GROUP BY site_id
            HAVING COUNT(DISTINCT NULLIF(TRIM(CAST(sw_version AS VARCHAR)), '')) > 1
            """,
            [*date_params, *scope_params],
        )
        for row in sw_df.to_dict(orient="records"):
            distinct_sw = int(row.get("distinct_sw", 0) or 0)
            score = min(95.0, 55.0 + (distinct_sw - 1) * 15.0)
            anomalies.append(
                {
                    "site_id": str(row.get("site_id", "")),
                    "site_name": str(row.get("site_name", "")),
                    "anomaly_type": "SW change",
                    "detail": f"{distinct_sw} versions SW: {row.get('old_sw')} -> {row.get('new_sw')}",
                    "metric_value": distinct_sw,
                    "severity_score": round(score, 1),
                    "level": self._anomaly_level(score),
                    "evidence": "sites.sw_version (distinct par site)",
                }
            )

        # Rule 2: Site disappeared between earliest and latest
        if len(dates) >= 2:
            disappeared_df = query(
                f"""
                WITH earliest_sites AS (
                    SELECT DISTINCT CAST(site_id AS VARCHAR) AS site_id,
                           MAX(COALESCE(CAST(site_name AS VARCHAR), '')) AS site_name
                    FROM read_parquet('{_lake().sites}')
                    WHERE CAST(snapshot_date AS VARCHAR) = ?{scope_sql}
                    GROUP BY site_id
                ),
                latest_sites AS (
                    SELECT DISTINCT CAST(site_id AS VARCHAR) AS site_id
                    FROM read_parquet('{_lake().sites}')
                    WHERE CAST(snapshot_date AS VARCHAR) = ?{scope_sql}
                )
                SELECT e.site_id, e.site_name
                FROM earliest_sites e
                LEFT JOIN latest_sites l ON e.site_id = l.site_id
                WHERE l.site_id IS NULL
                ORDER BY e.site_id
                """,
                [earliest, *scope_params, latest, *scope_params],
            )
            for row in disappeared_df.to_dict(orient="records"):
                anomalies.append(
                    {
                        "site_id": str(row.get("site_id", "")),
                        "site_name": str(row.get("site_name", "")),
                        "anomaly_type": "Site disappeared",
                        "detail": f"Présent le {earliest}, absent le {latest}",
                        "metric_value": 1,
                        "severity_score": 90.0,
                        "level": "Critical",
                        "evidence": "sites.snapshot_date (présence/absence)",
                    }
                )

        # Rule 3: High replacement rate (serial CHURN per site/type)
        # Replacements ~= distinct serials over the period MINUS the installed base
        # (max distinct serials seen in a single snapshot). This avoids counting a
        # site's normal multi-card base as replacements.
        repl_df = query(
            f"""
            WITH per_snapshot AS (
                SELECT
                    CAST(site_id AS VARCHAR) AS site_id,
                    CAST(object_type AS VARCHAR) AS object_type,
                    CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                    COUNT(DISTINCT NULLIF(TRIM(CAST(serial_number AS VARCHAR)), '')) AS serials_in_snapshot
                FROM read_parquet('{_lake().equipment}')
                WHERE CAST(snapshot_date AS VARCHAR) IN {date_clause}{scope_sql}
                GROUP BY site_id, object_type, snapshot_date
            ),
            totals AS (
                SELECT
                    CAST(site_id AS VARCHAR) AS site_id,
                    CAST(object_type AS VARCHAR) AS object_type,
                    COUNT(DISTINCT NULLIF(TRIM(CAST(serial_number AS VARCHAR)), '')) AS total_distinct
                FROM read_parquet('{_lake().equipment}')
                WHERE CAST(snapshot_date AS VARCHAR) IN {date_clause}{scope_sql}
                GROUP BY site_id, object_type
            )
            SELECT
                t.site_id AS site_id,
                t.object_type AS object_type,
                GREATEST(t.total_distinct - MAX(p.serials_in_snapshot), 0) AS estimated_replacements
            FROM totals t
            JOIN per_snapshot p ON t.site_id = p.site_id AND t.object_type = p.object_type
            GROUP BY t.site_id, t.object_type, t.total_distinct
            HAVING GREATEST(t.total_distinct - MAX(p.serials_in_snapshot), 0) >= ?
            ORDER BY estimated_replacements DESC
            """,
            [*date_params, *scope_params, *date_params, *scope_params, threshold],
        )
        for row in repl_df.to_dict(orient="records"):
            est = int(row.get("estimated_replacements", 0) or 0)
            score = min(98.0, 40.0 + est * 12.0)
            anomalies.append(
                {
                    "site_id": str(row.get("site_id", "")),
                    "site_name": "",
                    "anomaly_type": "High replacement rate",
                    "detail": f"{row.get('object_type')}: {est} remplacement(s) estimé(s) (>= {threshold})",
                    "metric_value": est,
                    "severity_score": round(score, 1),
                    "level": self._anomaly_level(score),
                    "evidence": "equipment.serial_number (variation distincte)",
                }
            )

        # Rule 4: Critical data quality (missing serials)
        quality_df = query(
            f"""
            SELECT
                CAST(site_id AS VARCHAR) AS site_id,
                SUM(CASE WHEN serial_number IS NULL OR TRIM(CAST(serial_number AS VARCHAR)) = '' THEN 1 ELSE 0 END) AS missing_serials,
                COUNT(*) AS total_rows
            FROM read_parquet('{_lake().equipment}')
            WHERE CAST(snapshot_date AS VARCHAR) IN {date_clause}{scope_sql}
            GROUP BY site_id
            HAVING SUM(CASE WHEN serial_number IS NULL OR TRIM(CAST(serial_number AS VARCHAR)) = '' THEN 1 ELSE 0 END) > 0
            ORDER BY missing_serials DESC
            """,
            [*date_params, *scope_params],
        )
        for row in quality_df.to_dict(orient="records"):
            missing = int(row.get("missing_serials", 0) or 0)
            total = int(row.get("total_rows", 0) or 0)
            ratio = (missing / total) if total else 0.0
            score = min(85.0, 30.0 + ratio * 55.0)
            anomalies.append(
                {
                    "site_id": str(row.get("site_id", "")),
                    "site_name": "",
                    "anomaly_type": "Critical data quality",
                    "detail": f"{missing}/{total} serial number(s) manquant(s) ({round(ratio * 100, 1)}%)",
                    "metric_value": missing,
                    "severity_score": round(score, 1),
                    "level": self._anomaly_level(score),
                    "evidence": "equipment.serial_number (champ manquant)",
                }
            )

        anomalies.sort(key=lambda item: item["severity_score"], reverse=True)
        for idx, item in enumerate(anomalies, start=1):
            item["alert_id"] = f"ALR-{idx:04d}"

        # Per-site aggregation
        site_aggregate: dict[str, dict[str, Any]] = {}
        for item in anomalies:
            site_id = item["site_id"]
            agg = site_aggregate.setdefault(
                site_id,
                {"site_id": site_id, "anomalies": 0, "max_severity": 0.0, "types": set()},
            )
            agg["anomalies"] += 1
            agg["max_severity"] = max(agg["max_severity"], item["severity_score"])
            agg["types"].add(item["anomaly_type"])

        # Unsupervised model (Isolation Forest) + explainability
        ml_block = self._ml_site_anomalies(dates, scope_clauses, scope_params)
        ml_score_map = ml_block.get("score_map", {})

        site_summary = []
        for agg in site_aggregate.values():
            ml_info = ml_score_map.get(agg["site_id"], {})
            ml_flag = ml_info.get("ml_flag") == "anomaly"
            detection = "Règles + IA" if ml_flag else "Règles"
            site_summary.append(
                {
                    "site_id": agg["site_id"],
                    "anomalies": agg["anomalies"],
                    "max_severity": round(agg["max_severity"], 1),
                    "level": self._anomaly_level(agg["max_severity"]),
                    "ml_score": ml_info.get("ml_score", 0.0),
                    "detection": detection,
                    "types": ", ".join(sorted(agg["types"])),
                }
            )
        site_summary.sort(key=lambda item: item["max_severity"], reverse=True)

        # ML-only sites (flagged by Isolation Forest but not by rules)
        rule_site_ids = set(site_aggregate.keys())
        ml_only = [
            {
                "site_id": row["site_id"],
                "ml_score": row["ml_score"],
                "top_features": row["top_features"],
                "detection": "IA seule",
            }
            for row in ml_block.get("rows", [])
            if row["ml_flag"] == "anomaly" and row["site_id"] not in rule_site_ids
        ]

        level_counts = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
        for item in anomalies:
            level_counts[item["level"]] = level_counts.get(item["level"], 0) + 1

        return {
            "rows": anomalies,
            "site_summary": site_summary,
            "summary": {
                "total": len(anomalies),
                "critical": level_counts["Critical"],
                "high": level_counts["High"],
                "medium": level_counts["Medium"],
                "low": level_counts["Low"],
                "sites_impacted": len(site_aggregate),
            },
            "severity_chart": [
                {"level": "Critical", "count": level_counts["Critical"]},
                {"level": "High", "count": level_counts["High"]},
                {"level": "Medium", "count": level_counts["Medium"]},
                {"level": "Low", "count": level_counts["Low"]},
            ],
            "ml": {
                "available": ml_block.get("available", False),
                "summary": ml_block.get("summary", {}),
                "feature_importance": ml_block.get("feature_importance", []),
                "top_sites": ml_block.get("rows", [])[:30],
                "ml_only": ml_only[:30],
            },
            "params": {"replacement_threshold": threshold, "snapshots": len(dates)},
        }

    def get_ai_report(self, ctx: FilterContext) -> dict[str, Any]:
        """Narrative AI report (executive + technical), bilingual FR/EN."""
        dates = sorted(ctx.effective_dates or ctx.selected_dates)
        generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        if not dates:
            return {
                "generated_at": generated_at,
                "period": {"start": "", "end": "", "snapshots": 0},
                "metrics": {},
                "executive": {"fr": "Aucun snapshot sélectionné.", "en": "No snapshot selected."},
                "sections": [],
                "trend": [],
                "top_risks": [],
                "decisions": [],
                "critical_findings": [],
                "risk_index": 0,
            }

        earliest, latest = dates[0], dates[-1]

        scope_clauses: list[str] = []
        scope_params: list[Any] = []
        if ctx.selected_files:
            _append_in_filter(scope_clauses, scope_params, "CAST(source_file AS VARCHAR)", ctx.selected_files)
        if ctx.selected_sites:
            _append_in_filter(scope_clauses, scope_params, "CAST(site_id AS VARCHAR)", ctx.selected_sites)
        scope_sql = (" AND " + " AND ".join(scope_clauses)) if scope_clauses else ""

        date_clause, date_params = _in_clause(dates)

        # Activations / deactivations between earliest and latest
        added_sites = 0
        removed_sites = 0
        if len(dates) >= 2:
            change_df = query(
                f"""
                WITH earliest_sites AS (
                    SELECT DISTINCT CAST(site_id AS VARCHAR) AS site_id
                    FROM read_parquet('{_lake().sites}')
                    WHERE CAST(snapshot_date AS VARCHAR) = ?{scope_sql}
                ),
                latest_sites AS (
                    SELECT DISTINCT CAST(site_id AS VARCHAR) AS site_id
                    FROM read_parquet('{_lake().sites}')
                    WHERE CAST(snapshot_date AS VARCHAR) = ?{scope_sql}
                )
                SELECT
                    (SELECT COUNT(*) FROM latest_sites l WHERE l.site_id NOT IN (SELECT site_id FROM earliest_sites)) AS added,
                    (SELECT COUNT(*) FROM earliest_sites e WHERE e.site_id NOT IN (SELECT site_id FROM latest_sites)) AS removed
                """,
                [earliest, *scope_params, latest, *scope_params],
            )
            if not change_df.empty:
                added_sites = int(change_df.iloc[0]["added"] or 0)
                removed_sites = int(change_df.iloc[0]["removed"] or 0)

        # Site state on latest snapshot
        state_df = query(
            f"""
            SELECT
                COUNT(DISTINCT site_id) AS total_sites,
                COUNT(DISTINCT CASE WHEN LOWER(CAST(site_state AS VARCHAR)) = 'active' THEN site_id END) AS active_sites,
                COUNT(DISTINCT CASE WHEN LOWER(CAST(site_state AS VARCHAR)) = 'blocked' THEN site_id END) AS blocked_sites
            FROM read_parquet('{_lake().sites}')
            WHERE CAST(snapshot_date AS VARCHAR) = ?{scope_sql}
            """,
            [latest, *scope_params],
        )
        total_sites = int(state_df.iloc[0]["total_sites"] or 0) if not state_df.empty else 0
        active_sites = int(state_df.iloc[0]["active_sites"] or 0) if not state_df.empty else 0
        blocked_sites = int(state_df.iloc[0]["blocked_sites"] or 0) if not state_df.empty else 0

        # Cells trend per snapshot
        trend_df = query(
            f"""
            SELECT
                CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                SUM(nb_cells_2g) AS cells_2g,
                SUM(nb_cells_3g) AS cells_3g,
                SUM(nb_cells_lte_4g) AS cells_4g,
                SUM(nb_cells_5g) AS cells_5g
            FROM read_parquet('{_lake().sites}')
            WHERE CAST(snapshot_date AS VARCHAR) IN {date_clause}{scope_sql}
            GROUP BY snapshot_date
            ORDER BY snapshot_date
            """,
            [*date_params, *scope_params],
        )
        trend = trend_df.to_dict(orient="records")

        # Equipment delta earliest vs latest
        equip_df = query(
            f"""
            SELECT
                SUM(CASE WHEN CAST(snapshot_date AS VARCHAR) = ? THEN nb_equipment ELSE 0 END) AS old_equipment,
                SUM(CASE WHEN CAST(snapshot_date AS VARCHAR) = ? THEN nb_equipment ELSE 0 END) AS new_equipment
            FROM read_parquet('{_lake().equipment}')
            WHERE CAST(snapshot_date AS VARCHAR) IN (?, ?){(' AND ' + ' AND '.join(scope_clauses)) if scope_clauses else ''}
            """,
            [earliest, latest, earliest, latest, *scope_params],
        )
        old_equipment = int(equip_df.iloc[0]["old_equipment"] or 0) if not equip_df.empty else 0
        new_equipment = int(equip_df.iloc[0]["new_equipment"] or 0) if not equip_df.empty else 0
        equipment_delta = new_equipment - old_equipment

        # Top risks from anomaly engine
        anomalies = self.get_anomaly_alerts(ctx)
        top_risks = anomalies["site_summary"][:5]
        critical = anomalies["summary"]["critical"]
        high = anomalies["summary"]["high"]

        # Cells trend deltas (first vs last)
        cells_first = trend[0] if trend else {}
        cells_last = trend[-1] if trend else {}
        cells_4g_delta = int((cells_last.get("cells_4g") or 0)) - int((cells_first.get("cells_4g") or 0))
        cells_5g_delta = int((cells_last.get("cells_5g") or 0)) - int((cells_first.get("cells_5g") or 0))

        metrics = {
            "total_sites": total_sites,
            "active_sites": active_sites,
            "blocked_sites": blocked_sites,
            "added_sites": added_sites,
            "removed_sites": removed_sites,
            "equipment_delta": equipment_delta,
            "old_equipment": old_equipment,
            "new_equipment": new_equipment,
            "anomalies_total": anomalies["summary"]["total"],
            "anomalies_critical": critical,
            "anomalies_high": high,
            "cells_4g_delta": cells_4g_delta,
            "cells_5g_delta": cells_5g_delta,
        }

        risk_lines_fr = [
            f"{row['site_id']} — {row['anomalies']} anomalie(s), niveau {row['level']} ({row['types']})"
            for row in top_risks
        ] or ["Aucun site à risque détecté sur la période."]
        risk_lines_en = [
            f"{row['site_id']} — {row['anomalies']} anomaly(ies), level {row['level']} ({row['types']})"
            for row in top_risks
        ] or ["No at-risk site detected over the period."]

        sections = [
            {
                "id": "activations",
                "title": {"fr": "Activations & résiliations", "en": "Activations & decommissions"},
                "lines": {
                    "fr": [
                        f"{added_sites} nouveau(x) site(s) activé(s) entre {earliest} et {latest}.",
                        f"{removed_sites} site(s) résilié(s)/disparu(s) sur la même période.",
                        f"Parc actuel: {total_sites} sites ({active_sites} actifs, {blocked_sites} bloqués).",
                    ],
                    "en": [
                        f"{added_sites} new site(s) activated between {earliest} and {latest}.",
                        f"{removed_sites} site(s) decommissioned/disappeared over the same period.",
                        f"Current fleet: {total_sites} sites ({active_sites} active, {blocked_sites} blocked).",
                    ],
                },
            },
            {
                "id": "degradations",
                "title": {"fr": "Dégradations & blocages", "en": "Degradations & blocks"},
                "lines": {
                    "fr": [
                        f"{blocked_sites} site(s) en état bloqué sur le dernier snapshot.",
                        f"{critical} alerte(s) critiques et {high} alerte(s) élevées détectées par le moteur de règles.",
                    ],
                    "en": [
                        f"{blocked_sites} site(s) blocked on the latest snapshot.",
                        f"{critical} critical and {high} high alert(s) detected by the rule engine.",
                    ],
                },
            },
            {
                "id": "top_risks",
                "title": {"fr": "Top risques (sites)", "en": "Top risks (sites)"},
                "lines": {"fr": risk_lines_fr, "en": risk_lines_en},
            },
            {
                "id": "trends",
                "title": {"fr": "Tendances réseau", "en": "Network trends"},
                "lines": {
                    "fr": [
                        f"Cellules 4G: variation de {cells_4g_delta:+d} sur la période.",
                        f"Cellules 5G: variation de {cells_5g_delta:+d} sur la période.",
                        f"Parc équipements: {old_equipment} -> {new_equipment} (delta {equipment_delta:+d}).",
                    ],
                    "en": [
                        f"4G cells: {cells_4g_delta:+d} change over the period.",
                        f"5G cells: {cells_5g_delta:+d} change over the period.",
                        f"Equipment base: {old_equipment} -> {new_equipment} (delta {equipment_delta:+d}).",
                    ],
                },
            },
        ]

        executive_fr = (
            f"Sur la période du {earliest} au {latest} ({len(dates)} snapshots), le réseau compte {total_sites} sites "
            f"dont {blocked_sites} bloqués. {added_sites} activation(s) et {removed_sites} résiliation(s) ont été détectées. "
            f"Le moteur d’anomalies remonte {anomalies['summary']['total']} alerte(s) ({critical} critiques). "
            f"L’expansion 5G affiche une variation de {cells_5g_delta:+d} cellules."
        )
        executive_en = (
            f"From {earliest} to {latest} ({len(dates)} snapshots), the network operates {total_sites} sites "
            f"with {blocked_sites} blocked. {added_sites} activation(s) and {removed_sites} decommission(s) were detected. "
            f"The anomaly engine raises {anomalies['summary']['total']} alert(s) ({critical} critical). "
            f"5G expansion shows a {cells_5g_delta:+d} cell change."
        )

        decisions: list[dict[str, Any]] = []

        def _decision(priority: str, category: str, fr: str, en: str) -> None:
            decisions.append({"priority": priority, "category": category, "fr": fr, "en": en})

        if critical > 0:
            _decision(
                "P1",
                "risks",
                f"Escalader immédiatement {critical} alerte(s) critique(s) avant exploitation opérationnelle du snapshot.",
                f"Immediately escalate {critical} critical alert(s) before operational use of the snapshot.",
            )
        if high > 0:
            _decision(
                "P2",
                "risks",
                f"Planifier une revue NOC sous 48 h pour {high} alerte(s) de sévérité élevée.",
                f"Schedule a NOC review within 48 h for {high} high-severity alert(s).",
            )
        if blocked_sites > 0:
            _decision(
                "P2",
                "operations",
                f"Auditer {blocked_sites} site(s) bloqué(s) et valider l'impact sur la couverture.",
                f"Audit {blocked_sites} blocked site(s) and validate coverage impact.",
            )
        if abs(equipment_delta) > max(50, int(total_sites * 0.05)):
            _decision(
                "P2",
                "inventory",
                f"Contrôler le delta équipements ({equipment_delta:+d}) vs baseline attendue.",
                f"Verify equipment delta ({equipment_delta:+d}) against expected baseline.",
            )
        if added_sites > 0 or removed_sites > 0:
            _decision(
                "P3",
                "evolution",
                f"Valider avec le planning réseau {added_sites} activation(s) et {removed_sites} résiliation(s) détectées.",
                f"Validate with network planning: {added_sites} activation(s) and {removed_sites} decommission(s) detected.",
            )
        if anomalies["summary"]["total"] == 0:
            _decision(
                "P3",
                "quality",
                "Aucune anomalie majeure — snapshot prêt pour analytics et reporting exécutif.",
                "No major anomaly — snapshot ready for analytics and executive reporting.",
            )
        if not decisions:
            _decision(
                "P3",
                "operations",
                "Poursuivre la surveillance standard et comparer avec le snapshot précédent.",
                "Continue standard monitoring and compare with the previous snapshot.",
            )

        critical_findings: list[dict[str, Any]] = []
        if critical > 0:
            critical_findings.append(
                {
                    "severity": "critical",
                    "fr": f"{critical} alerte(s) critique(s) actives sur le snapshot {latest}.",
                    "en": f"{critical} critical alert(s) active on snapshot {latest}.",
                }
            )
        if blocked_sites > 0:
            critical_findings.append(
                {
                    "severity": "high",
                    "fr": f"{blocked_sites} site(s) en état bloqué — risque de couverture.",
                    "en": f"{blocked_sites} site(s) in blocked state — coverage risk.",
                }
            )
        for row in top_risks[:5]:
            level = str(row.get("level") or "medium").lower()
            critical_findings.append(
                {
                    "severity": level,
                    "fr": f"Site {row.get('site_id')} — {row.get('anomalies')} anomalie(s) ({row.get('types')}).",
                    "en": f"Site {row.get('site_id')} — {row.get('anomalies')} anomaly(ies) ({row.get('types')}).",
                }
            )
        if cells_5g_delta < 0:
            critical_findings.append(
                {
                    "severity": "medium",
                    "fr": f"Régression 5G détectée ({cells_5g_delta:+d} cellules) sur la période.",
                    "en": f"5G regression detected ({cells_5g_delta:+d} cells) over the period.",
                }
            )

        from src.services.predictive_risk_service import predictive_risk_service

        predictions = predictive_risk_service.get_risk_predictions(snapshot_date=latest, vendor=ctx.vendor, limit=10)
        if not predictions:
            predictions = predictive_risk_service.compute_risk_predictions(ctx, snapshot_date=latest, persist=False)[:10]
        predicted_index = int(round(max((row.get("risk_score", 0.0) for row in predictions), default=0.0) * 100))

        risk_index = max(
            min(
                100,
                critical * 18 + high * 10 + blocked_sites * 4 + min(25, anomalies["summary"]["total"]),
            ),
            predicted_index,
        )

        return {
            "generated_at": generated_at,
            "period": {"start": earliest, "end": latest, "snapshots": len(dates)},
            "metrics": metrics,
            "executive": {"fr": executive_fr, "en": executive_en},
            "sections": sections,
            "trend": trend,
            "top_risks": top_risks,
            "decisions": decisions,
            "critical_findings": critical_findings,
            "risk_index": risk_index,
        }

    @staticmethod
    def _period_days(dates: list[str]) -> int:
        ordered = sorted(dates)
        for fmt in ("%Y-%m-%d", "%Y.%m.%d", "%Y/%m/%d"):
            try:
                start = datetime.strptime(ordered[0], fmt)
                end = datetime.strptime(ordered[-1], fmt)
                return max(1, (end - start).days)
            except ValueError:
                continue
        return 1

    def get_spares_dimensioning(self, ctx: FilterContext, horizon_days: int = 90, service_level: float = 0.95) -> dict[str, Any]:
        """Spares sizing per product_code/object_type from observed serial churn.

        Replacements = distinct serials over the period that are no longer present
        in the latest snapshot (units that churned out). Demand is annualised over
        the observed window, then projected on the requested horizon with a Poisson
        safety stock.
        """
        dates = sorted(ctx.effective_dates or ctx.selected_dates)
        horizon = max(7, min(365, int(horizon_days)))
        empty = {
            "rows": [],
            "summary": {
                "product_lines": 0,
                "total_installed": 0,
                "total_replacements": 0,
                "total_recommended": 0,
                "horizon_days": horizon,
                "period_days": 0,
            },
            "top_chart": [],
            "params": {"horizon_days": horizon, "service_level": service_level},
        }
        if not dates:
            return empty

        if len(dates) == 1:
            latest = dates[0]
            lake = _lake()
            available_dates = [date for date in sorted(lake.snapshot_dates) if date <= latest]
            if len(available_dates) > 1:
                dates = available_dates[-4:]

        period_days = self._period_days(dates)
        latest = dates[-1]

        scope_clauses: list[str] = []
        scope_params: list[Any] = []
        if ctx.selected_files:
            _append_in_filter(scope_clauses, scope_params, "CAST(source_file AS VARCHAR)", ctx.selected_files)
        if ctx.selected_sites:
            _append_in_filter(scope_clauses, scope_params, "CAST(site_id AS VARCHAR)", ctx.selected_sites)
        scope_sql = (" AND " + " AND ".join(scope_clauses)) if scope_clauses else ""

        date_clause, date_params = _in_clause(dates)

        df = query(
            f"""
            WITH totals AS (
                SELECT
                    CAST(product_code AS VARCHAR) AS product_code,
                    MAX(COALESCE(CAST(product_name AS VARCHAR), '')) AS product_name,
                    MAX(CAST(object_type AS VARCHAR)) AS object_type,
                    COUNT(DISTINCT NULLIF(TRIM(CAST(serial_number AS VARCHAR)), '')) AS total_distinct
                FROM read_parquet('{_lake().equipment}')
                WHERE CAST(snapshot_date AS VARCHAR) IN {date_clause}{scope_sql}
                GROUP BY product_code
            ),
            latest AS (
                SELECT
                    CAST(product_code AS VARCHAR) AS product_code,
                    COUNT(DISTINCT NULLIF(TRIM(CAST(serial_number AS VARCHAR)), '')) AS latest_distinct,
                    SUM(COALESCE(nb_equipment, 0)) AS installed_base,
                    COUNT(DISTINCT CAST(site_id AS VARCHAR)) AS sites
                FROM read_parquet('{_lake().equipment}')
                WHERE CAST(snapshot_date AS VARCHAR) = ?{scope_sql}
                GROUP BY product_code
            )
            SELECT
                t.product_code AS product_code,
                t.product_name AS product_name,
                t.object_type AS object_type,
                COALESCE(l.installed_base, 0) AS installed_base,
                COALESCE(l.latest_distinct, 0) AS latest_distinct,
                COALESCE(l.sites, 0) AS sites,
                GREATEST(t.total_distinct - COALESCE(l.latest_distinct, 0), 0) AS replacements
            FROM totals t
            LEFT JOIN latest l ON t.product_code = l.product_code
            WHERE COALESCE(l.installed_base, 0) > 0
            ORDER BY replacements DESC, installed_base DESC
            """,
            [*date_params, *scope_params, latest, *scope_params],
        )
        if df.empty:
            return empty

        try:
            import math
        except Exception:  # pragma: no cover
            math = None  # type: ignore

        z = 1.65 if service_level >= 0.95 else (1.28 if service_level >= 0.90 else 1.04)

        rows: list[dict[str, Any]] = []
        total_installed = 0
        total_replacements = 0
        total_recommended = 0
        for record in df.to_dict(orient="records"):
            installed = int(record.get("installed_base", 0) or 0)
            replacements = int(record.get("replacements", 0) or 0)
            daily_rate = replacements / period_days
            expected_demand = daily_rate * horizon
            safety = z * (expected_demand ** 0.5)
            recommended = int(round(expected_demand + safety))
            if replacements > 0 and recommended < 1:
                recommended = 1
            annual_rate = (replacements / installed) * (365.0 / period_days) if installed else 0.0

            if annual_rate >= 0.15 or replacements >= 20:
                criticality = "High"
            elif annual_rate >= 0.05 or replacements >= 5:
                criticality = "Medium"
            else:
                criticality = "Low"

            total_installed += installed
            total_replacements += replacements
            total_recommended += recommended

            rows.append(
                {
                    "product_code": str(record.get("product_code", "")),
                    "product_name": str(record.get("product_name", "")),
                    "object_type": str(record.get("object_type", "")),
                    "installed_base": installed,
                    "sites": int(record.get("sites", 0) or 0),
                    "replacements_period": replacements,
                    "annual_failure_rate_pct": round(annual_rate * 100, 1),
                    "expected_demand": round(expected_demand, 1),
                    "recommended_spares": recommended,
                    "criticality": criticality,
                }
            )

        top_chart = [
            {"product_code": row["product_code"], "recommended_spares": row["recommended_spares"], "replacements": row["replacements_period"]}
            for row in rows[:12]
        ]

        return {
            "rows": rows,
            "summary": {
                "product_lines": len(rows),
                "total_installed": total_installed,
                "total_replacements": total_replacements,
                "total_recommended": total_recommended,
                "horizon_days": horizon,
                "period_days": period_days,
            },
            "top_chart": top_chart,
            "params": {"horizon_days": horizon, "service_level": service_level},
        }

    def get_site_clustering(self, ctx: FilterContext, n_clusters: int = 4) -> dict[str, Any]:
        """Behavioural clustering of sites (KMeans) + 2D PCA projection + health score."""
        dates = sorted(ctx.effective_dates or ctx.selected_dates)
        empty = {
            "available": False,
            "points": [],
            "clusters": [],
            "health_distribution": [],
            "summary": {"sites": 0, "clusters": 0},
            "reason": "missing_snapshot_date",
        }
        if not dates:
            return empty

        scope_clauses: list[str] = []
        scope_params: list[Any] = []
        if ctx.selected_files:
            _append_in_filter(scope_clauses, scope_params, "CAST(source_file AS VARCHAR)", ctx.selected_files)
        if ctx.selected_sites:
            _append_in_filter(scope_clauses, scope_params, "CAST(site_id AS VARCHAR)", ctx.selected_sites)

        try:
            import numpy as np
            from sklearn.cluster import KMeans
            from sklearn.decomposition import PCA
            from sklearn.preprocessing import StandardScaler
        except Exception:
            return {
                **empty,
                "reason": "sklearn_missing",
            }

        frame = self._build_site_feature_frame(dates, scope_clauses, scope_params)
        if frame.empty or len(frame) < max(12, n_clusters * 3):
            return {
                **empty,
                "reason": "insufficient_sites",
            }

        k = max(2, min(8, int(n_clusters)))
        matrix = frame[self._ML_FEATURES].to_numpy(dtype=float)
        scaler = StandardScaler()
        scaled = scaler.fit_transform(matrix)

        kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = kmeans.fit_predict(scaled)

        pca = PCA(n_components=2, random_state=42)
        coords = pca.fit_transform(scaled)

        # Health score: penalise churn, missing serials, sw instability, blocked state.
        def col(name: str) -> "np.ndarray":
            return frame[name].to_numpy(dtype=float)

        def norm(arr: "np.ndarray") -> "np.ndarray":
            span = (arr.max() - arr.min()) or 1.0
            return (arr - arr.min()) / span

        risk = (
            0.35 * norm(col("serial_churn"))
            + 0.25 * norm(col("missing_serials"))
            + 0.20 * norm(np.maximum(col("sw_versions") - 1, 0))
            + 0.20 * col("blocked")
        )
        health = (100.0 * (1.0 - norm(risk))).round(1)

        def health_band(value: float) -> str:
            if value >= 75:
                return "Bonne"
            if value >= 50:
                return "Moyenne"
            if value >= 25:
                return "Fragile"
            return "Critique"

        points: list[dict[str, Any]] = []
        for idx in range(len(frame)):
            points.append(
                {
                    "site_id": str(frame.iloc[idx]["site_id"]),
                    "site_name": str(frame.iloc[idx].get("site_name", "")),
                    "cluster": int(labels[idx]),
                    "x": round(float(coords[idx][0]), 3),
                    "y": round(float(coords[idx][1]), 3),
                    "health_score": float(health[idx]),
                    "health_band": health_band(float(health[idx])),
                    "serial_churn": int(frame.iloc[idx]["serial_churn"]),
                    "missing_serials": int(frame.iloc[idx]["missing_serials"]),
                    "blocked": int(frame.iloc[idx]["blocked"]),
                }
            )

        clusters: list[dict[str, Any]] = []
        for cluster_id in range(k):
            mask = labels == cluster_id
            size = int(mask.sum())
            if not size:
                continue
            avg_health = round(float(health[mask].mean()), 1)
            avg_churn = round(float(col("serial_churn")[mask].mean()), 2)
            avg_missing = round(float(col("missing_serials")[mask].mean()), 2)
            blocked_count = int(col("blocked")[mask].sum())
            clusters.append(
                {
                    "cluster": cluster_id,
                    "sites": size,
                    "avg_health": avg_health,
                    "avg_serial_churn": avg_churn,
                    "avg_missing_serials": avg_missing,
                    "blocked_sites": blocked_count,
                    "profile": health_band(avg_health),
                }
            )
        clusters.sort(key=lambda item: item["avg_health"])

        bands = ["Bonne", "Moyenne", "Fragile", "Critique"]
        band_counts = {band: 0 for band in bands}
        for point in points:
            band_counts[point["health_band"]] = band_counts.get(point["health_band"], 0) + 1
        health_distribution = [{"band": band, "count": band_counts[band]} for band in bands]

        return {
            "available": True,
            "points": points,
            "clusters": clusters,
            "health_distribution": health_distribution,
            "summary": {
                "sites": int(len(frame)),
                "clusters": k,
                "explained_variance_pct": round(float(pca.explained_variance_ratio_.sum() * 100), 1),
            },
        }


data_service = DataService()