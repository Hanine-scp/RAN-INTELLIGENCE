from __future__ import annotations

import argparse
import logging
import re
import shutil
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Optional

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import duckdb
import pandas as pd

from src.parsers.nokia_parser import (
    build_equipment_class_counter,
    build_equipment_completeness_report,
    build_final_equipment_inventory,
    parse_folder_parallel,
)

APP_NAME = "ran-intelligence-platform"
DATE_FOLDER_PATTERN = re.compile(r"^\d{4}[.\-_]\d{2}[.\-_]\d{2}$")


# ============================================================
# PATHS
# ============================================================

@dataclass(frozen=True)
class ProjectPaths:
    root: Path
    source_root: Path
    lake: Path
    processed: Path
    sites_lake: Path
    equipment_lake: Path
    counters_lake: Path
    completeness_lake: Path
    site_changes_lake: Path
    delta_lake: Path

    @classmethod
    def from_root(
        cls,
        root: Path,
        source_root: Optional[Path] = None,
    ) -> "ProjectPaths":
        source = source_root or (root / "DATA.XML")
        lake = root / "data" / "lake"
        processed = root / "data" / "processed"

        return cls(
            root=root,
            source_root=source,
            lake=lake,
            processed=processed,
            sites_lake=lake / "sites",
            equipment_lake=lake / "equipment",
            counters_lake=lake / "counters",
            completeness_lake=lake / "completeness",
            site_changes_lake=lake / "site_changes",
            delta_lake=lake / "delta",
        )


# ============================================================
# LOGGING
# ============================================================

def configure_logging(verbose: bool = False) -> None:
    level = logging.DEBUG if verbose else logging.INFO

    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)-8s | %(message)s",
        datefmt="%H:%M:%S",
    )


# ============================================================
# DISCOVERY DATA.XML
# ============================================================

@dataclass(frozen=True)
class DateBatch:
    folder_date: str
    folder_name: str
    folder_path: Path
    xml_count: int


def normalize_folder_date(folder_name: str) -> str:
    """
    2025.02.13 -> 2025-02-13
    2025_02_13 -> 2025-02-13
    2025-02-13 -> 2025-02-13
    """
    return folder_name.strip().replace(".", "-").replace("_", "-")


def is_date_folder(path: Path) -> bool:
    return path.is_dir() and bool(DATE_FOLDER_PATTERN.match(path.name.strip()))


def count_xml_files(folder: Path, recursive: bool = True) -> int:
    """
    Compte tous les fichiers XML disponibles.
    Aucun plafond n'est appliqué.
    """
    pattern = "**/*.xml" if recursive else "*.xml"

    return sum(
        1
        for p in folder.glob(pattern)
        if p.is_file() and p.suffix.lower() == ".xml"
    )


def discover_date_batches(
    source_root: Path,
    recursive_xml: bool = True,
) -> list[DateBatch]:
    """
    Découvre tous les dossiers dates sous DATA.XML.
    Aucun nombre maximum de dossiers n'est appliqué.
    Aucun nombre maximum de fichiers XML n'est appliqué.
    """
    if not source_root.exists():
        raise FileNotFoundError(f"Dossier source introuvable: {source_root}")

    if not source_root.is_dir():
        raise NotADirectoryError(f"Le chemin source n'est pas un dossier: {source_root}")

    batches: list[DateBatch] = []

    for folder in sorted(source_root.iterdir(), key=lambda p: p.name):
        if not is_date_folder(folder):
            logging.info("Ignoré: dossier non-date: %s", folder.name)
            continue

        xml_count = count_xml_files(folder, recursive=recursive_xml)

        if xml_count == 0:
            logging.warning("Ignoré: aucun XML dans le dossier date: %s", folder)
            continue

        batches.append(
            DateBatch(
                folder_date=normalize_folder_date(folder.name),
                folder_name=folder.name,
                folder_path=folder,
                xml_count=xml_count,
            )
        )

    if not batches:
        raise FileNotFoundError(
            f"Aucun dossier date contenant des XML trouvé dans: {source_root}. "
            "Format attendu: DATA.XML/2025.02.13/*.xml"
        )

    return batches


# ============================================================
# DOSSIERS / EXPORT
# ============================================================

def reset_folder(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)

    path.mkdir(parents=True, exist_ok=True)


def prepare_folders(paths: ProjectPaths, clean: bool = True) -> None:
    paths.lake.mkdir(parents=True, exist_ok=True)
    paths.processed.mkdir(parents=True, exist_ok=True)

    output_folders = [
        paths.sites_lake,
        paths.equipment_lake,
        paths.counters_lake,
        paths.completeness_lake,
        paths.site_changes_lake,
        paths.delta_lake,
    ]

    for folder in output_folders:
        if clean:
            reset_folder(folder)
        else:
            folder.mkdir(parents=True, exist_ok=True)


def safe_filename_date(date_value: str) -> str:
    return date_value.replace("-", "_")


def prepare_for_export(df: pd.DataFrame) -> pd.DataFrame:
    """
    Nettoie le DataFrame avant export Parquet.

    Correction importante:
    PyArrow n'aime pas les colonnes object avec valeurs mixtes:
        12, -3, "2G, 3G, LTE(4G)"
    L'erreur typique:
        Could not convert '2G, 3G, 5G, LTE(4G)' with type str:
        tried to convert to int64

    On convertit donc toutes les colonnes object en string pandas.
    Les colonnes numériques pures restent numériques.
    """
    if df is None:
        return pd.DataFrame()

    df = df.copy()

    if df.empty:
        return df

    df.columns = [str(c).strip() for c in df.columns]

    for col in df.columns:
        if pd.api.types.is_object_dtype(df[col]) or pd.api.types.is_string_dtype(df[col]):
            df[col] = df[col].astype("string")

    return df


def export_dataset(
    df: pd.DataFrame,
    parquet_path: Path,
    csv_path: Optional[Path] = None,
) -> None:
    """
    Export atomique en Parquet et CSV optionnel.
    Corrige les colonnes mixtes avant export Parquet.
    """
    df = prepare_for_export(df)

    parquet_path.parent.mkdir(parents=True, exist_ok=True)

    tmp_parquet = parquet_path.with_suffix(parquet_path.suffix + ".tmp")
    df.to_parquet(tmp_parquet, index=False)
    tmp_parquet.replace(parquet_path)

    if csv_path is not None:
        csv_path.parent.mkdir(parents=True, exist_ok=True)

        tmp_csv = csv_path.with_suffix(csv_path.suffix + ".tmp")
        df.to_csv(tmp_csv, index=False, encoding="utf-8-sig")
        tmp_csv.replace(csv_path)


# ============================================================
# NORMALISATION / VALIDATION
# ============================================================

REQUIRED_SITE_COLUMNS = {"site_id", "snapshot_date", "source_file"}
REQUIRED_EQUIPMENT_COLUMNS = {"site_id", "snapshot_date", "source_file", "object_type"}


def normalize_dataframe(df: Optional[pd.DataFrame]) -> pd.DataFrame:
    if df is None:
        return pd.DataFrame()

    if df.empty:
        return df

    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]

    for col in df.columns:
        if pd.api.types.is_object_dtype(df[col]):
            df[col] = df[col].map(lambda x: x.strip() if isinstance(x, str) else x)

    if "snapshot_date" in df.columns:
        df["snapshot_date"] = df["snapshot_date"].astype(str)

    return df


def require_columns(
    df: pd.DataFrame,
    required: set[str],
    dataset_name: str,
) -> None:
    missing = sorted(required - set(df.columns))

    if missing:
        raise ValueError(
            f"{dataset_name}: colonnes obligatoires manquantes: {', '.join(missing)}"
        )


def force_folder_snapshot(
    df: pd.DataFrame,
    folder_date: str,
    folder_name: str,
) -> pd.DataFrame:
    """
    Règle clé:
    Le delta est basé sur les grands dossiers DATA.XML/DATE.
    Donc snapshot_date doit toujours être la date du dossier.
    """
    df = normalize_dataframe(df)

    if df.empty:
        return df

    if "xml_snapshot_date" not in df.columns and "snapshot_date" in df.columns:
        df["xml_snapshot_date"] = df["snapshot_date"]

    df["snapshot_date"] = folder_date
    df["date_folder"] = folder_date
    df["date_folder_name"] = folder_name

    return df


# ============================================================
# MÉTRIQUES BUSINESS
# ============================================================

def safe_sum(df: pd.DataFrame, column: str) -> int:
    if df.empty or column not in df.columns:
        return 0

    return int(pd.to_numeric(df[column], errors="coerce").fillna(0).sum())


def count_distinct(df: pd.DataFrame, column: str) -> int:
    if df.empty or column not in df.columns:
        return 0

    return int(df[column].dropna().astype(str).nunique())


def extract_technology_set(df_sites: pd.DataFrame) -> set[str]:
    if df_sites.empty or "technologies" not in df_sites.columns:
        return set()

    values = (
        df_sites["technologies"]
        .dropna()
        .astype(str)
        .str.replace("|", ",", regex=False)
        .str.split(",")
        .explode()
        .str.strip()
    )

    return set(v for v in values.tolist() if v)


def extract_equipment_type_set(df_equipment: pd.DataFrame) -> set[str]:
    if df_equipment.empty or "object_type" not in df_equipment.columns:
        return set()

    return set(df_equipment["object_type"].dropna().astype(str).unique())


def delta_status(delta: int | float, negative_when_up: bool = False) -> str:
    if delta == 0:
        return "STABLE"

    if negative_when_up:
        return "WARNING_UP" if delta > 0 else "OK_DOWN"

    return "UP" if delta > 0 else "DOWN"


# ============================================================
# RAPPORTS SITE CHANGE / SUMMARY / DELTA
# ============================================================

def build_site_change_report(df_sites: pd.DataFrame) -> pd.DataFrame:
    """
    Compare la première grande date et la dernière grande date.
    Donne les sites ajoutés et supprimés globalement.
    """
    columns = ["change_type", "site_id", "date_old", "date_new"]

    if df_sites.empty or not {"site_id", "snapshot_date"}.issubset(df_sites.columns):
        return pd.DataFrame(columns=columns)

    dates = sorted(df_sites["snapshot_date"].dropna().astype(str).unique().tolist())

    if len(dates) < 2:
        return pd.DataFrame(columns=columns)

    old_date = dates[0]
    new_date = dates[-1]

    old_sites = set(
        df_sites.loc[df_sites["snapshot_date"].astype(str) == old_date, "site_id"]
        .dropna()
        .astype(str)
        .unique()
    )

    new_sites = set(
        df_sites.loc[df_sites["snapshot_date"].astype(str) == new_date, "site_id"]
        .dropna()
        .astype(str)
        .unique()
    )

    rows: list[dict[str, str]] = []

    for site_id in sorted(new_sites - old_sites):
        rows.append(
            {
                "change_type": "NEW_SITE",
                "site_id": site_id,
                "date_old": old_date,
                "date_new": new_date,
            }
        )

    for site_id in sorted(old_sites - new_sites):
        rows.append(
            {
                "change_type": "REMOVED_SITE",
                "site_id": site_id,
                "date_old": old_date,
                "date_new": new_date,
            }
        )

    return pd.DataFrame(rows, columns=columns)


def build_snapshot_summary(
    df_sites: pd.DataFrame,
    df_equipment: pd.DataFrame,
) -> pd.DataFrame:
    """
    Résumé par date:
    - nb sites
    - nb sites actifs/bloqués
    - nb équipements
    - cellules 2G/3G/4G/5G
    - technologies
    - types équipements
    """
    if df_sites.empty and df_equipment.empty:
        return pd.DataFrame()

    site_dates = (
        df_sites["snapshot_date"].dropna().astype(str).unique().tolist()
        if "snapshot_date" in df_sites.columns
        else []
    )

    equipment_dates = (
        df_equipment["snapshot_date"].dropna().astype(str).unique().tolist()
        if "snapshot_date" in df_equipment.columns
        else []
    )

    dates = sorted(set(site_dates) | set(equipment_dates))

    rows: list[dict[str, object]] = []

    for date in dates:
        s = (
            df_sites[df_sites["snapshot_date"].astype(str) == date]
            if "snapshot_date" in df_sites.columns
            else pd.DataFrame()
        )

        e = (
            df_equipment[df_equipment["snapshot_date"].astype(str) == date]
            if "snapshot_date" in df_equipment.columns
            else pd.DataFrame()
        )

        tech_set = extract_technology_set(s)
        eq_type_set = extract_equipment_type_set(e)

        rows.append(
            {
                "date": date,
                "nb_sites": count_distinct(s, "site_id"),
                "nb_active_sites": int((s["site_state"].astype(str).str.lower() == "active").sum()) if "site_state" in s.columns else 0,
                "nb_blocked_sites": int((s["site_state"].astype(str).str.lower() == "blocked").sum()) if "site_state" in s.columns else 0,
                "nb_equipment": safe_sum(e, "nb_equipment") if "nb_equipment" in e.columns else len(e),
                "nb_cells_total": safe_sum(s, "nb_cells"),
                "nb_cells_2g": safe_sum(s, "nb_cells_2g"),
                "nb_cells_3g": safe_sum(s, "nb_cells_3g"),
                "nb_cells_4g": safe_sum(s, "nb_cells_lte_4g"),
                "nb_cells_lte_fdd": safe_sum(s, "nb_cells_lte_fdd"),
                "nb_cells_lte_tdd": safe_sum(s, "nb_cells_lte_tdd"),
                "nb_cells_5g": safe_sum(s, "nb_cells_5g"),
                "nb_technologies": len(tech_set),
                "technologies": ", ".join(sorted(tech_set)),
                "nb_equipment_types": len(eq_type_set),
                "equipment_types": ", ".join(sorted(eq_type_set)),
            }
        )

    return pd.DataFrame(rows)


def build_delta_between_dates(
    df_sites: pd.DataFrame,
    df_equipment: pd.DataFrame,
    date_1: str,
    date_2: str,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Delta entre deux grandes dates consécutives.

    Correction:
    La colonne delta est maintenant toujours string pour éviter les erreurs Parquet
    lorsqu'on mélange des nombres et du texte.
    Une colonne delta_numeric est ajoutée pour les métriques numériques.
    """
    s1 = df_sites[df_sites["snapshot_date"].astype(str) == date_1] if not df_sites.empty else pd.DataFrame()
    s2 = df_sites[df_sites["snapshot_date"].astype(str) == date_2] if not df_sites.empty else pd.DataFrame()

    e1 = df_equipment[df_equipment["snapshot_date"].astype(str) == date_1] if not df_equipment.empty else pd.DataFrame()
    e2 = df_equipment[df_equipment["snapshot_date"].astype(str) == date_2] if not df_equipment.empty else pd.DataFrame()

    sites_1 = set(s1["site_id"].dropna().astype(str).unique()) if "site_id" in s1.columns else set()
    sites_2 = set(s2["site_id"].dropna().astype(str).unique()) if "site_id" in s2.columns else set()

    added_sites = sorted(sites_2 - sites_1)
    removed_sites = sorted(sites_1 - sites_2)

    tech_1 = extract_technology_set(s1)
    tech_2 = extract_technology_set(s2)

    eq_types_1 = extract_equipment_type_set(e1)
    eq_types_2 = extract_equipment_type_set(e2)

    metric_rows = [
        ("nb_sites", len(sites_1), len(sites_2), False),
        ("nb_active_sites", int((s1["site_state"].astype(str).str.lower() == "active").sum()) if "site_state" in s1.columns else 0, int((s2["site_state"].astype(str).str.lower() == "active").sum()) if "site_state" in s2.columns else 0, False),
        ("nb_blocked_sites", int((s1["site_state"].astype(str).str.lower() == "blocked").sum()) if "site_state" in s1.columns else 0, int((s2["site_state"].astype(str).str.lower() == "blocked").sum()) if "site_state" in s2.columns else 0, True),
        ("nb_added_sites", 0, len(added_sites), False),
        ("nb_removed_sites", 0, len(removed_sites), True),
        ("nb_equipment", safe_sum(e1, "nb_equipment") if "nb_equipment" in e1.columns else len(e1), safe_sum(e2, "nb_equipment") if "nb_equipment" in e2.columns else len(e2), False),
        ("nb_cells_total", safe_sum(s1, "nb_cells"), safe_sum(s2, "nb_cells"), False),
        ("nb_cells_2g", safe_sum(s1, "nb_cells_2g"), safe_sum(s2, "nb_cells_2g"), False),
        ("nb_cells_3g", safe_sum(s1, "nb_cells_3g"), safe_sum(s2, "nb_cells_3g"), False),
        ("nb_cells_4g", safe_sum(s1, "nb_cells_lte_4g"), safe_sum(s2, "nb_cells_lte_4g"), False),
        ("nb_cells_lte_fdd", safe_sum(s1, "nb_cells_lte_fdd"), safe_sum(s2, "nb_cells_lte_fdd"), False),
        ("nb_cells_lte_tdd", safe_sum(s1, "nb_cells_lte_tdd"), safe_sum(s2, "nb_cells_lte_tdd"), False),
        ("nb_cells_5g", safe_sum(s1, "nb_cells_5g"), safe_sum(s2, "nb_cells_5g"), False),
        ("nb_technologies", len(tech_1), len(tech_2), False),
        ("nb_equipment_types", len(eq_types_1), len(eq_types_2), False),
    ]

    rows: list[dict[str, object]] = []

    for metric, value_1, value_2, negative_when_up in metric_rows:
        d = value_2 - value_1
        rows.append(
            {
                "date_1": date_1,
                "date_2": date_2,
                "metric": metric,
                "value_date_1": value_1,
                "value_date_2": value_2,
                "delta": str(d),
                "delta_numeric": d,
                "status": delta_status(d, negative_when_up=negative_when_up),
            }
        )

    info_rows = [
        ("technologies_date_1", ", ".join(sorted(tech_1))),
        ("technologies_date_2", ", ".join(sorted(tech_2))),
        ("technologies_added", ", ".join(sorted(tech_2 - tech_1))),
        ("technologies_removed", ", ".join(sorted(tech_1 - tech_2))),
        ("equipment_types_date_1", ", ".join(sorted(eq_types_1))),
        ("equipment_types_date_2", ", ".join(sorted(eq_types_2))),
        ("equipment_types_added", ", ".join(sorted(eq_types_2 - eq_types_1))),
        ("equipment_types_removed", ", ".join(sorted(eq_types_1 - eq_types_2))),
    ]

    for metric, value in info_rows:
        rows.append(
            {
                "date_1": date_1,
                "date_2": date_2,
                "metric": metric,
                "value_date_1": None,
                "value_date_2": None,
                "delta": value,
                "delta_numeric": None,
                "status": "INFO",
            }
        )

    site_detail_rows: list[dict[str, str]] = []

    for site_id in added_sites:
        site_detail_rows.append(
            {
                "date_1": date_1,
                "date_2": date_2,
                "change_type": "ADDED_SITE",
                "site_id": site_id,
            }
        )

    for site_id in removed_sites:
        site_detail_rows.append(
            {
                "date_1": date_1,
                "date_2": date_2,
                "change_type": "REMOVED_SITE",
                "site_id": site_id,
            }
        )

    return pd.DataFrame(rows), pd.DataFrame(site_detail_rows)


def build_all_consecutive_deltas(
    df_sites: pd.DataFrame,
    df_equipment: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    if df_sites.empty or "snapshot_date" not in df_sites.columns:
        return pd.DataFrame(), pd.DataFrame()

    dates = sorted(df_sites["snapshot_date"].dropna().astype(str).unique().tolist())

    if len(dates) < 2:
        return pd.DataFrame(), pd.DataFrame()

    all_delta: list[pd.DataFrame] = []
    all_details: list[pd.DataFrame] = []

    for date_1, date_2 in zip(dates[:-1], dates[1:]):
        df_delta, df_details = build_delta_between_dates(
            df_sites=df_sites,
            df_equipment=df_equipment,
            date_1=date_1,
            date_2=date_2,
        )

        all_delta.append(df_delta)
        all_details.append(df_details)

    return (
        pd.concat(all_delta, ignore_index=True) if all_delta else pd.DataFrame(),
        pd.concat(all_details, ignore_index=True) if all_details else pd.DataFrame(),
    )


# ============================================================
# PARSING PAR DOSSIER DATE
# ============================================================

def parse_one_date_batch(
    batch: DateBatch,
    source_root: Path,
    recursive_xml: bool,
    max_workers: Optional[int],
) -> tuple[pd.DataFrame, pd.DataFrame]:
    logging.info(
        "Parsing date=%s | XML=%s | dossier=%s",
        batch.folder_date,
        f"{batch.xml_count:,}".replace(",", " "),
        batch.folder_path,
    )

    df_sites, df_equipment_raw = parse_folder_parallel(
        xml_folder=batch.folder_path,
        max_workers=max_workers,
        forced_snapshot_date=batch.folder_date,
        date_folder=batch.folder_date,
        recursive=recursive_xml,
        source_root=source_root,
    )

    df_sites = force_folder_snapshot(df_sites, batch.folder_date, batch.folder_name)
    df_equipment_raw = force_folder_snapshot(df_equipment_raw, batch.folder_date, batch.folder_name)

    require_columns(df_sites, REQUIRED_SITE_COLUMNS, f"sites[{batch.folder_date}]")
    require_columns(df_equipment_raw, REQUIRED_EQUIPMENT_COLUMNS, f"equipment_raw[{batch.folder_date}]")

    return df_sites, df_equipment_raw


# ============================================================
# VALIDATION LAKE
# ============================================================

def validate_lake(paths: ProjectPaths) -> None:
    checks = {
        "sites": paths.sites_lake / "*.parquet",
        "equipment": paths.equipment_lake / "*.parquet",
        "counters": paths.counters_lake / "*.parquet",
        "completeness": paths.completeness_lake / "*.parquet",
        "site_changes": paths.site_changes_lake / "*.parquet",
        "delta": paths.delta_lake / "*.parquet",
    }

    with duckdb.connect() as con:
        for name, pattern in checks.items():
            pattern_str = pattern.as_posix()

            try:
                count = con.execute(
                    f"SELECT COUNT(*) FROM read_parquet('{pattern_str}')"
                ).fetchone()[0]

                logging.info(
                    "[CHECK] %-13s %s rows",
                    name + ":",
                    f"{count:,}".replace(",", " "),
                )
            except Exception:
                logging.warning("[CHECK] %-13s aucun fichier lisible", name + ":")


# ============================================================
# MAIN PIPELINE
# ============================================================

def run_pipeline(
    paths: ProjectPaths,
    clean: bool = True,
    recursive_xml: bool = True,
    max_workers: Optional[int] = None,
) -> None:
    started = time.perf_counter()

    logging.info("=" * 80)
    logging.info("%s — Pipeline complet DATA.XML", APP_NAME)
    logging.info("=" * 80)

    batches = discover_date_batches(
        source_root=paths.source_root,
        recursive_xml=recursive_xml,
    )

    total_xml = sum(batch.xml_count for batch in batches)

    logging.info("Source DATA.XML: %s", paths.source_root)
    logging.info("Dossiers dates détectés: %s", len(batches))
    logging.info("Fichiers XML détectés: %s", f"{total_xml:,}".replace(",", " "))
    logging.info("Recherche récursive XML: %s", "OUI" if recursive_xml else "NON")
    logging.info("Workers parallèles: %s", max_workers if max_workers else "AUTO")

    for index, batch in enumerate(batches, start=1):
        logging.info(
            "%03d | date=%s | XML=%s | dossier=%s",
            index,
            batch.folder_date,
            f"{batch.xml_count:,}".replace(",", " "),
            batch.folder_path,
        )

    prepare_folders(paths, clean=clean)

    all_sites: list[pd.DataFrame] = []
    all_equipment: list[pd.DataFrame] = []
    all_counters: list[pd.DataFrame] = []
    all_completeness: list[pd.DataFrame] = []

    for index, batch in enumerate(batches, start=1):
        logging.info("-" * 80)
        logging.info(
            "[%s/%s] Traitement du dossier date %s",
            index,
            len(batches),
            batch.folder_date,
        )

        date_token = safe_filename_date(batch.folder_date)

        df_sites, df_equipment_raw = parse_one_date_batch(
            batch=batch,
            source_root=paths.source_root,
            recursive_xml=recursive_xml,
            max_workers=max_workers,
        )

        logging.info(
            "Brut %s | sites=%s | equipment_raw=%s",
            batch.folder_date,
            f"{len(df_sites):,}".replace(",", " "),
            f"{len(df_equipment_raw):,}".replace(",", " "),
        )

        df_equipment = normalize_dataframe(
            build_final_equipment_inventory(df_equipment_raw)
        )
        df_equipment = force_folder_snapshot(
            df_equipment,
            batch.folder_date,
            batch.folder_name,
        )

        df_counters = normalize_dataframe(
            build_equipment_class_counter(df_equipment)
        )
        df_counters = force_folder_snapshot(
            df_counters,
            batch.folder_date,
            batch.folder_name,
        )

        df_completeness = normalize_dataframe(
            build_equipment_completeness_report(df_equipment)
        )
        df_completeness = force_folder_snapshot(
            df_completeness,
            batch.folder_date,
            batch.folder_name,
        )

        export_dataset(
            df_sites,
            paths.sites_lake / f"sites_{date_token}.parquet",
        )

        export_dataset(
            df_equipment,
            paths.equipment_lake / f"equipment_{date_token}.parquet",
        )

        export_dataset(
            df_counters,
            paths.counters_lake / f"counters_{date_token}.parquet",
        )

        export_dataset(
            df_completeness,
            paths.completeness_lake / f"completeness_{date_token}.parquet",
        )

        logging.info(
            "Export %s OK | sites=%s | equipment=%s | counters=%s | completeness=%s",
            batch.folder_date,
            f"{len(df_sites):,}".replace(",", " "),
            f"{len(df_equipment):,}".replace(",", " "),
            f"{len(df_counters):,}".replace(",", " "),
            f"{len(df_completeness):,}".replace(",", " "),
        )

        all_sites.append(df_sites)
        all_equipment.append(df_equipment)
        all_counters.append(df_counters)
        all_completeness.append(df_completeness)

    logging.info("-" * 80)
    logging.info("Consolidation globale")

    df_sites_all = (
        pd.concat(all_sites, ignore_index=True)
        if all_sites
        else pd.DataFrame()
    )

    df_equipment_all = (
        pd.concat(all_equipment, ignore_index=True)
        if all_equipment
        else pd.DataFrame()
    )

    df_counters_all = (
        pd.concat(all_counters, ignore_index=True)
        if all_counters
        else pd.DataFrame()
    )

    df_completeness_all = (
        pd.concat(all_completeness, ignore_index=True)
        if all_completeness
        else pd.DataFrame()
    )

    df_site_changes = build_site_change_report(df_sites_all)
    df_snapshot_summary = build_snapshot_summary(df_sites_all, df_equipment_all)
    df_delta_metrics, df_delta_site_details = build_all_consecutive_deltas(
        df_sites_all,
        df_equipment_all,
    )

    logging.info("Export consolidé CSV + Parquet")

    export_dataset(
        df_sites_all,
        paths.processed / "site_status.parquet",
        paths.processed / "site_status.csv",
    )

    export_dataset(
        df_equipment_all,
        paths.processed / "equipment_inventory.parquet",
        paths.processed / "equipment_inventory.csv",
    )

    export_dataset(
        df_counters_all,
        paths.processed / "equipment_class_counter.parquet",
        paths.processed / "equipment_class_counter.csv",
    )

    export_dataset(
        df_completeness_all,
        paths.processed / "equipment_completeness_report.parquet",
        paths.processed / "equipment_completeness_report.csv",
    )

    export_dataset(
        df_site_changes,
        paths.site_changes_lake / "site_changes.parquet",
        paths.processed / "site_change_report.csv",
    )

    export_dataset(
        df_snapshot_summary,
        paths.delta_lake / "snapshot_summary.parquet",
        paths.processed / "snapshot_summary.csv",
    )

    export_dataset(
        df_delta_metrics,
        paths.delta_lake / "delta_metrics.parquet",
        paths.processed / "delta_metrics.csv",
    )

    export_dataset(
        df_delta_site_details,
        paths.delta_lake / "delta_site_details.parquet",
        paths.processed / "delta_site_details.csv",
    )

    validate_lake(paths)

    elapsed = time.perf_counter() - started

    logging.info("=" * 80)
    logging.info("Pipeline terminé avec succès")
    logging.info("Dossiers dates traités: %s", len(batches))
    logging.info("Fichiers XML traités: %s", f"{total_xml:,}".replace(",", " "))
    logging.info("Sites consolidés: %s", f"{len(df_sites_all):,}".replace(",", " "))
    logging.info("Équipements consolidés: %s", f"{len(df_equipment_all):,}".replace(",", " "))
    logging.info("Durée totale: %.2fs", elapsed)
    logging.info("=" * 80)


# ============================================================
# CLI
# ============================================================

def parse_args(argv: Optional[Iterable[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Pipeline complet DATA.XML qui parse tous les XML disponibles."
    )

    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parent,
        help="Racine du projet. Défaut: dossier contenant main.py",
    )

    parser.add_argument(
        "--source-root",
        type=Path,
        default=None,
        help="Dossier DATA.XML. Défaut: <root>/DATA.XML",
    )

    parser.add_argument(
        "--no-recursive-xml",
        action="store_true",
        help="Désactive la recherche récursive. Par défaut le pipeline lit **/*.xml.",
    )

    parser.add_argument(
        "--max-workers",
        type=int,
        default=None,
        help="Nombre de processus parallèles. Ce n'est pas une limite de fichiers.",
    )

    parser.add_argument(
        "--no-clean",
        action="store_true",
        help="Ne pas supprimer les anciens fichiers du data lake avant traitement.",
    )

    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Activer les logs détaillés.",
    )

    return parser.parse_args(argv)


def main(argv: Optional[Iterable[str]] = None) -> int:
    args = parse_args(argv)
    configure_logging(args.verbose)

    try:
        root = args.root.resolve()
        source_root = args.source_root.resolve() if args.source_root else None

        paths = ProjectPaths.from_root(
            root=root,
            source_root=source_root,
        )

        run_pipeline(
            paths=paths,
            clean=not args.no_clean,
            recursive_xml=not args.no_recursive_xml,
            max_workers=args.max_workers,
        )

        return 0

    except Exception as exc:
        logging.exception("Pipeline échoué: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
