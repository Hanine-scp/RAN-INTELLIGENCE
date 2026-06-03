import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import duckdb
import pandas as pd

_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_DATA_ROOT = _REPO_ROOT / "data" / "lake"
DATA_ROOT = Path(os.getenv("DATA_ROOT", str(_DEFAULT_DATA_ROOT)))

SITES_PATH = (DATA_ROOT / "sites" / "*.parquet").as_posix()
EQUIPMENT_PATH = (DATA_ROOT / "equipment" / "*.parquet").as_posix()
COUNTERS_PATH = (DATA_ROOT / "counters" / "*.parquet").as_posix()
COMPLETENESS_PATH = (DATA_ROOT / "completeness" / "*.parquet").as_posix()
DELTA_PATH = (DATA_ROOT / "delta" / "delta_metrics.parquet").as_posix()
SITE_CHANGES_PATH = (DATA_ROOT / "site_changes" / "site_changes.parquet").as_posix()


@dataclass
class FilterContext:
    selected_dates: list[str]
    selected_files: list[str]
    selected_sites: list[str]
    selected_file_dates: list[str]
    effective_dates: list[str]
    site_search: str = ""
    date_search: str = ""
    language: str = "Français"

    @classmethod
    def from_inputs(
        cls,
        *,
        selected_dates: list[str] | None = None,
        selected_files: list[str] | None = None,
        selected_sites: list[str] | None = None,
        selected_file_dates: list[str] | None = None,
        site_search: str = "",
        date_search: str = "",
        language: str = "Français",
    ) -> "FilterContext":
        dates = [str(d) for d in (selected_dates or []) if str(d)]
        files = [str(f) for f in (selected_files or []) if str(f)]
        sites = [str(s) for s in (selected_sites or []) if str(s)]
        file_dates = [str(d) for d in (selected_file_dates or []) if str(d)]
        effective_dates = file_dates or dates
        if date_search:
            date_search_lower = date_search.lower()
            effective_dates = [d for d in effective_dates if date_search_lower in d.lower()]
        return cls(
            selected_dates=dates,
            selected_files=files,
            selected_sites=sites,
            selected_file_dates=file_dates,
            effective_dates=effective_dates,
            site_search=site_search or "",
            date_search=date_search or "",
            language=language,
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


def lake_ready() -> bool:
    sites_dir = DATA_ROOT / "sites"
    return sites_dir.exists() and any(sites_dir.glob("*.parquet"))


def query(sql: str, params: list[Any] | None = None) -> pd.DataFrame:
    with duckdb.connect(database=":memory:") as con:
        if params:
            return con.execute(sql, params).fetchdf()
        return con.execute(sql).fetchdf()


def get_snapshot_dates() -> list[str]:
    df = query(
        f"""
        SELECT DISTINCT CAST(snapshot_date AS VARCHAR) AS snapshot_date
        FROM read_parquet('{SITES_PATH}')
        ORDER BY snapshot_date DESC
        """
    )
    return df["snapshot_date"].tolist()


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
        FROM read_parquet('{SITES_PATH}')
        WHERE CAST(snapshot_date AS VARCHAR) = ?
        """,
        [snapshot_date],
    ).iloc[0]


def get_equipment_kpis(snapshot_date: str) -> pd.Series:
    return query(
        f"""
        SELECT COALESCE(SUM(nb_equipment), 0) AS total_equipment
        FROM read_parquet('{EQUIPMENT_PATH}')
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
            nb_cells,
            technologies,
            source_file
        FROM read_parquet('{SITES_PATH}')
        WHERE {' AND '.join(clauses)}
        ORDER BY site_id
        """,
        params,
    )


def get_object_types(snapshot_date: str) -> list[str]:
    df = query(
        f"""
        SELECT DISTINCT object_type
        FROM read_parquet('{EQUIPMENT_PATH}')
        WHERE CAST(snapshot_date AS VARCHAR) = ?
        ORDER BY object_type
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
        FROM read_parquet('{EQUIPMENT_PATH}')
        WHERE {' AND '.join(clauses)}
        ORDER BY site_id, object_type, id
        LIMIT 5000
        """,
        params,
    )


def get_delta_metrics() -> pd.DataFrame:
    if not Path(DELTA_PATH).exists():
        return pd.DataFrame()
    return query(
        f"""
        SELECT *
        FROM read_parquet('{DELTA_PATH}')
        ORDER BY metric
        """
    )


def get_site_changes() -> pd.DataFrame:
    if not Path(SITE_CHANGES_PATH).exists():
        return pd.DataFrame()
    return query(
        f"""
        SELECT *
        FROM read_parquet('{SITE_CHANGES_PATH}')
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
        FROM read_parquet('{COMPLETENESS_PATH}')
        ORDER BY completeness_percent ASC
        LIMIT 5000
        """
    )


class DataService:
    """Centralized business/query layer shared by API and Streamlit."""

    def get_filter_options(self, ctx: FilterContext) -> dict[str, Any]:
        date_options = get_snapshot_dates()
        total_sites_df = query(
            f"""
            SELECT COUNT(DISTINCT CAST(site_id AS VARCHAR) || '-' || CAST(snapshot_date AS VARCHAR)) AS total_sites
            FROM read_parquet('{SITES_PATH}')
            """
        )
        total_xml_df = query(
            f"""
            SELECT COUNT(DISTINCT CAST(source_file AS VARCHAR) || '-' || CAST(snapshot_date AS VARCHAR)) AS total_xml
            FROM read_parquet('{SITES_PATH}')
            """
        )

        file_options: list[dict[str, str]] = []
        if ctx.selected_dates:
            date_clause, date_params = _in_clause(ctx.selected_dates)
            files_df = query(
                f"""
                SELECT DISTINCT
                    CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                    CAST(source_file AS VARCHAR) AS source_file
                FROM read_parquet('{SITES_PATH}')
                WHERE CAST(snapshot_date AS VARCHAR) IN {date_clause}
                ORDER BY snapshot_date DESC, source_file
                """,
                date_params,
            )
            file_options = files_df.to_dict(orient="records")

        site_options: list[dict[str, str]] = []
        if ctx.effective_dates and ctx.selected_files:
            clauses: list[str] = []
            params: list[Any] = []
            _append_in_filter(clauses, params, "CAST(snapshot_date AS VARCHAR)", ctx.effective_dates)
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
                FROM read_parquet('{SITES_PATH}')
                WHERE {' AND '.join(clauses)}
                ORDER BY snapshot_date DESC, site_id
                """,
                params,
            )
            site_options = sites_df.to_dict(orient="records")

        return {
            "date_options": date_options,
            "file_options": file_options,
            "site_options": site_options,
            "total_sites": int(total_sites_df.iloc[0]["total_sites"]) if not total_sites_df.empty else 0,
            "total_xml": int(total_xml_df.iloc[0]["total_xml"]) if not total_xml_df.empty else 0,
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

    def get_dashboard(self, ctx: FilterContext) -> dict[str, Any]:
        effective_dates = sorted(ctx.effective_dates or ctx.selected_dates)
        if not effective_dates:
            return {"kpis": {}, "summary": [], "equipment_summary": []}

        latest_date = effective_dates[-1]
        oldest_date = effective_dates[0]
        site_where, site_params, equipment_where, equipment_params = self._site_and_equipment_where(ctx)

        latest_site_where = f"{site_where} AND CAST(snapshot_date AS VARCHAR) = ?"
        latest_equipment_where = f"{equipment_where} AND CAST(snapshot_date AS VARCHAR) = ?"
        site_kpi = query(
            f"""
            SELECT
                COUNT(DISTINCT site_id) AS total_sites,
                COALESCE(SUM(CASE WHEN LOWER(site_state) = 'active' THEN 1 ELSE 0 END), 0) AS active_sites,
                COALESCE(SUM(CASE WHEN LOWER(site_state) = 'blocked' THEN 1 ELSE 0 END), 0) AS blocked_sites,
                COALESCE(SUM(nb_cells_2g), 0) AS cells_2g,
                COALESCE(SUM(nb_cells_3g), 0) AS cells_3g,
                COALESCE(SUM(nb_cells_lte_4g), 0) AS cells_4g,
                COALESCE(SUM(nb_cells_5g), 0) AS cells_5g
            FROM read_parquet('{SITES_PATH}')
            WHERE {latest_site_where}
            """,
            [*site_params, latest_date],
        ).iloc[0]
        equipment_kpi = query(
            f"""
            SELECT COALESCE(SUM(nb_equipment), 0) AS total_equipment
            FROM read_parquet('{EQUIPMENT_PATH}')
            WHERE {latest_equipment_where}
            """,
            [*equipment_params, latest_date],
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
                COALESCE(SUM(nb_cells_5g), 0) AS cells_5g
            FROM read_parquet('{SITES_PATH}')
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
            FROM read_parquet('{EQUIPMENT_PATH}')
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

    def get_sites_page(self, ctx: FilterContext) -> list[dict[str, Any]]:
        effective_dates = sorted(ctx.effective_dates)
        if not effective_dates:
            return []
        selected_date = effective_dates[-1]
        return get_sites(selected_date, ctx.site_search).to_dict(orient="records")

    def get_inventory_page(self, ctx: FilterContext, object_types: list[str] | None = None) -> dict[str, Any]:
        effective_dates = sorted(ctx.effective_dates)
        if not effective_dates:
            return {"object_types": [], "rows": []}
        selected_date = effective_dates[-1]
        return {
            "object_types": get_object_types(selected_date),
            "rows": get_equipment(selected_date, object_types).to_dict(orient="records"),
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
        if not ctx.effective_dates:
            return []
        clause, params = _in_clause(ctx.effective_dates)
        df = query(
            f"""
            SELECT
                object_type,
                SUM(nb_equipment) AS total_equipment
            FROM read_parquet('{EQUIPMENT_PATH}')
            WHERE CAST(snapshot_date AS VARCHAR) IN {clause}
            GROUP BY object_type
            ORDER BY total_equipment DESC
            """,
            params,
        )
        return df.to_dict(orient="records")

    def get_prediction_page(self, ctx: FilterContext) -> list[dict[str, Any]]:
        if not ctx.effective_dates:
            return []
        clause, params = _in_clause(ctx.effective_dates)
        df = query(
            f"""
            SELECT
                object_type,
                SUM(nb_equipment) AS installed_base,
                COUNT(DISTINCT serial_number) AS unique_serials
            FROM read_parquet('{EQUIPMENT_PATH}')
            WHERE CAST(snapshot_date AS VARCHAR) IN {clause}
            GROUP BY object_type
            ORDER BY installed_base DESC
            """,
            params,
        )
        if df.empty:
            return []
        df["risk_score"] = (df["installed_base"] / df["installed_base"].max() * 100).round(2)
        df["estimated_spares_30d"] = (df["installed_base"] * 0.02).round(0).astype(int)
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
                SUM(nb_cells_5g) AS cells_5g
            FROM read_parquet('{SITES_PATH}')
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
            FROM read_parquet('{EQUIPMENT_PATH}')
            WHERE CAST(snapshot_date AS VARCHAR) IN {clause}
            GROUP BY snapshot_date, object_type
            ORDER BY snapshot_date, object_type
            """,
            params,
        )
        return {
            "summary": summary.to_dict(orient="records"),
            "equipment": equipment.to_dict(orient="records"),
        }

    def ask_assistant(self, question: str) -> dict[str, Any]:
        q = (question or "").lower()
        if "bloqué" in q or "blocked" in q:
            result = query(
                f"""
                SELECT snapshot_date, site_id, site_name, ip_address, sw_version
                FROM read_parquet('{SITES_PATH}')
                WHERE LOWER(site_state) = 'blocked'
                ORDER BY snapshot_date DESC, site_id
                LIMIT 50
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
                FROM read_parquet('{EQUIPMENT_PATH}')
                WHERE object_type = 'RMOD'
                LIMIT 100
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
                FROM read_parquet('{EQUIPMENT_PATH}')
                WHERE serial_number IS NOT NULL
                GROUP BY serial_number
                HAVING COUNT(*) > 1
                ORDER BY occurrences DESC
                LIMIT 50
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


data_service = DataService()