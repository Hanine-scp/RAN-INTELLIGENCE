from pathlib import Path
import duckdb
import pandas as pd

SITES_PATH = "data/lake/sites/*.parquet"
EQUIPMENT_PATH = "data/lake/equipment/*.parquet"
COUNTERS_PATH = "data/lake/counters/*.parquet"
COMPLETENESS_PATH = "data/lake/completeness/*.parquet"
DELTA_PATH = "data/lake/delta/delta_metrics.parquet"
SITE_CHANGES_PATH = "data/lake/site_changes/site_changes.parquet"


def lake_ready() -> bool:
    return Path("data/lake/sites").exists() and any(Path("data/lake/sites").glob("*.parquet"))


def query(sql: str) -> pd.DataFrame:
    return duckdb.query(sql).to_df()


def get_snapshot_dates() -> list[str]:
    df = query(f"""
        SELECT DISTINCT CAST(snapshot_date AS VARCHAR) AS snapshot_date
        FROM read_parquet('{SITES_PATH}')
        ORDER BY snapshot_date DESC
    """)
    return df["snapshot_date"].tolist()


def get_site_kpis(snapshot_date: str) -> pd.Series:
    return query(f"""
        SELECT
            COUNT(DISTINCT site_id) AS total_sites,
            COALESCE(SUM(CASE WHEN site_state = 'active' THEN 1 ELSE 0 END), 0) AS active_sites,
            COALESCE(SUM(CASE WHEN site_state = 'blocked' THEN 1 ELSE 0 END), 0) AS blocked_sites,
            COALESCE(SUM(nb_cells_2g), 0) AS cells_2g,
            COALESCE(SUM(nb_cells_3g), 0) AS cells_3g,
            COALESCE(SUM(nb_cells_lte_4g), 0) AS cells_4g,
            COALESCE(SUM(nb_cells_5g), 0) AS cells_5g
        FROM read_parquet('{SITES_PATH}')
        WHERE CAST(snapshot_date AS VARCHAR) = '{snapshot_date}'
    """).iloc[0]


def get_equipment_kpis(snapshot_date: str) -> pd.Series:
    return query(f"""
        SELECT COALESCE(SUM(nb_equipment), 0) AS total_equipment
        FROM read_parquet('{EQUIPMENT_PATH}')
        WHERE CAST(snapshot_date AS VARCHAR) = '{snapshot_date}'
    """).iloc[0]


def get_sites(snapshot_date: str, search: str = "") -> pd.DataFrame:
    where = f"CAST(snapshot_date AS VARCHAR) = '{snapshot_date}'"

    if search:
        q = search.replace("'", "''").lower()
        where += f"""
        AND (
            LOWER(CAST(site_id AS VARCHAR)) LIKE '%{q}%'
            OR LOWER(CAST(site_name AS VARCHAR)) LIKE '%{q}%'
            OR LOWER(CAST(ip_address AS VARCHAR)) LIKE '%{q}%'
            OR LOWER(CAST(sw_version AS VARCHAR)) LIKE '%{q}%'
        )
        """

    return query(f"""
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
        WHERE {where}
        ORDER BY site_id
    """)


def get_equipment(snapshot_date: str, object_types: list[str] | None = None) -> pd.DataFrame:
    where = f"CAST(snapshot_date AS VARCHAR) = '{snapshot_date}'"

    if object_types:
        values = ", ".join("'" + x.replace("'", "''") + "'" for x in object_types)
        where += f" AND object_type IN ({values})"

    return query(f"""
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
        WHERE {where}
        ORDER BY site_id, object_type, id
        LIMIT 5000
    """)


def get_object_types(snapshot_date: str) -> list[str]:
    df = query(f"""
        SELECT DISTINCT object_type
        FROM read_parquet('{EQUIPMENT_PATH}')
        WHERE CAST(snapshot_date AS VARCHAR) = '{snapshot_date}'
        ORDER BY object_type
    """)
    return df["object_type"].tolist()


def get_delta_metrics() -> pd.DataFrame:
    if not Path(DELTA_PATH).exists():
        return pd.DataFrame()

    return query(f"""
        SELECT *
        FROM read_parquet('{DELTA_PATH}')
        ORDER BY metric
    """)


def get_site_changes() -> pd.DataFrame:
    if not Path(SITE_CHANGES_PATH).exists():
        return pd.DataFrame()

    return query(f"""
        SELECT *
        FROM read_parquet('{SITE_CHANGES_PATH}')
        ORDER BY change_type, site_id
    """)


def get_quality_report() -> pd.DataFrame:
    return query(f"""
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
    """)