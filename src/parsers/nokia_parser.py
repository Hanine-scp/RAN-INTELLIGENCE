from __future__ import annotations

import os
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from lxml import etree
import pandas as pd


# ============================================================
# CONFIGURATION GÉNÉRALE
# ============================================================

EQUIPMENT_TYPES = {
    "CABINET", "SMOD", "RMOD", "BBMOD", "RETU", "ALD", "ANTL",
    "CABINET_R", "SMOD_R", "RMOD_R", "BBMOD_R", "RETU_R", "ALD_R", "ANTL_R",
}

FINAL_EQUIPMENT_TYPES = {
    "CABINET", "SMOD", "RMOD", "BBMOD", "RETU", "ALD", "ANTL",
}

EQUIPMENT_SORT_ORDER = {
    "CABINET": 10,
    "SMOD": 20,
    "RMOD": 30,
    "BBMOD": 40,
    "RETU": 90,
    "ALD": 91,
    "ANTL": 92,
}

IP_FIELDS = [
    "ipAddress",
    "localIpAddr",
    "oamIpAddress",
    "userLabelIp",
    "omsIpAddress",
    "ipv4Address",
    "ipAddr",
]


# ============================================================
# OUTILS TEXTE / XML
# ============================================================

def safe_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None

    value = str(value).strip()
    return value if value else None


def strip_ns(tag: str) -> str:
    return tag.split("}", 1)[1] if "}" in tag else tag


def normalize_date(value: Optional[str]) -> Optional[str]:
    if not value:
        return None

    value = str(value).strip()
    value = value.replace(".", "-").replace("_", "-")

    # Si date longue type 2025-02-13T10:30:00, on garde YYYY-MM-DD.
    if len(value) >= 10 and value[4] == "-" and value[7] == "-":
        return value[:10]

    return value


def list_xml_files(xml_folder: str | Path, recursive: bool = True) -> List[Path]:
    """
    Liste tous les fichiers XML disponibles dans un dossier.

    recursive=True par défaut:
        dossier/**/*.xml

    Aucun maximum n'est appliqué.
    Si le dossier contient 10, 1 000 ou 100 000 fichiers XML,
    la fonction retourne tous les fichiers trouvés.
    """
    folder = Path(xml_folder)

    if not folder.exists():
        raise FileNotFoundError(f"Dossier XML introuvable : {folder}")

    if not folder.is_dir():
        raise NotADirectoryError(f"Le chemin n'est pas un dossier : {folder}")

    pattern = "**/*.xml" if recursive else "*.xml"

    files = sorted(
        p for p in folder.glob(pattern)
        if p.is_file() and p.suffix.lower() == ".xml"
    )

    if not files:
        raise FileNotFoundError(f"Aucun fichier XML trouvé dans : {folder}")

    return files


def get_params(managed_object) -> Dict[str, Optional[str]]:
    params: Dict[str, Optional[str]] = {}

    for child in managed_object:
        if strip_ns(child.tag) == "p":
            name = child.attrib.get("name")
            if name:
                params[name] = safe_text(child.text)

    return params


def first(params: Dict[str, Optional[str]], keys: Iterable[str]) -> Optional[str]:
    for key in keys:
        value = params.get(key)
        if value not in [None, ""]:
            return value

    return None


def path_relative_to(path: Path, root: Optional[Path]) -> str:
    if root is None:
        return path.name

    try:
        return str(path.relative_to(root))
    except ValueError:
        return path.name


# ============================================================
# IDENTIFICATION SITE
# ============================================================

def extract_mrbts_id(dist_name: Optional[str]) -> Optional[str]:
    """
    Extrait un site_id stable depuis un DN Nokia.

    Exemples:
        PLMN-PLMN/MRBTS-12345          -> 12345
        MRBTS-12345/LNBTS-12345        -> 12345
        PLMN-PLMN/MRBTS-TUN001         -> TUN001

    Si MRBTS n'existe pas, retourne le distName complet.
    """
    if not dist_name:
        return None

    text = str(dist_name).strip()

    for part in text.split("/"):
        if part.upper().startswith("MRBTS-"):
            value = part.split("-", 1)[1].strip()
            return value if value else text

    return text


def extract_mrbts_dn(dist_name: Optional[str]) -> Optional[str]:
    """
    Retourne le DN jusqu'à MRBTS.
    """
    if not dist_name:
        return None

    parts = []

    for part in str(dist_name).split("/"):
        parts.append(part)
        if part.upper().startswith("MRBTS-"):
            return "/".join(parts)

    return None


# ============================================================
# TABLE 1 — SITES / NETWORK FOOTPRINT
# ============================================================

def infer_site_state(blocking_state: Optional[str]) -> str:
    state = str(blocking_state or "").strip().lower()

    if state == "blocked":
        return "blocked"

    if state in {"maintenance", "locked"}:
        return "maintenance"

    return "active"


def classify_cell(class_name: Optional[str]) -> Optional[str]:
    if not class_name:
        return None

    c = str(class_name).strip()
    c_lower = c.lower()

    if c == "com.nokia.srbts.gsm:GNCEL":
        return "2G"

    if c == "com.nokia.srbts.wcdma:WNCEL":
        return "3G"

    if c == "com.nokia.srbts.nrbts:NRCELL":
        return "5G"

    if c_lower == "noklte:lncel":
        return "LTE_GENERIC"

    if c_lower == "noklte:lncel_fdd":
        return "LTE_FDD"

    if c_lower == "noklte:lncel_tdd":
        return "LTE_TDD"

    return None


def build_site_row(
    xml_path: Path,
    source_root: Optional[Path],
    date_folder: Optional[str],
    snapshot_date: Optional[str],
    xml_snapshot_date: Optional[str],
    site_id: Optional[str],
    site_dn: Optional[str],
    site_name: Optional[str],
    blocking_state: Optional[str],
    sw_version: Optional[str],
    ip_address: Optional[str],
    cells_2g: set,
    cells_3g: set,
    cells_5g: set,
    lte_generic: set,
    lte_fdd: set,
    lte_tdd: set,
) -> Optional[Dict[str, Any]]:
    if not site_id:
        return None

    nb_2g = len(cells_2g)
    nb_3g = len(cells_3g)
    nb_5g = len(cells_5g)

    nb_lte_fdd = len(lte_fdd)
    nb_lte_tdd = len(lte_tdd)
    nb_lte_generic = len(lte_generic)

    if nb_lte_fdd > 0 or nb_lte_tdd > 0:
        nb_lte_4g = nb_lte_fdd + nb_lte_tdd
    else:
        nb_lte_4g = nb_lte_generic

    technologies = []

    if nb_2g > 0:
        technologies.append("2G")
    if nb_3g > 0:
        technologies.append("3G")
    if nb_lte_4g > 0:
        technologies.append("LTE(4G)")
    if nb_5g > 0:
        technologies.append("5G")

    return {
        "source_file": xml_path.name,
        "source_path": path_relative_to(xml_path, source_root),
        "date_folder": date_folder,
        "snapshot_date": snapshot_date,
        "xml_snapshot_date": xml_snapshot_date,
        "site_id": site_id,
        "site_dn": site_dn,
        "site_name": site_name,
        "site_state": infer_site_state(blocking_state),
        "blocking_state": blocking_state,
        "ip_address": ip_address,
        "sw_version": sw_version,
        "nb_cells": nb_2g + nb_3g + nb_lte_4g + nb_5g,
        "nb_cells_2g": nb_2g,
        "nb_cells_3g": nb_3g,
        "nb_cells_lte_4g": nb_lte_4g,
        "nb_cells_lte_fdd": nb_lte_fdd,
        "nb_cells_lte_tdd": nb_lte_tdd,
        "nb_cells_5g": nb_5g,
        "nb_techno": len(technologies),
        "technologies": ", ".join(technologies) if technologies else None,
    }


# ============================================================
# TABLE 2 — ÉQUIPEMENTS / HARDWARE INVENTORY
# ============================================================

def object_type_from_class(class_name: str) -> str:
    if not class_name:
        return ""

    return class_name.split(":")[-1].strip().upper() if ":" in class_name else class_name.strip().upper()


def base_object_type(object_type: str) -> str:
    object_type = str(object_type).upper()
    return object_type[:-2] if object_type.endswith("_R") else object_type


def normalize_ref_id(value: Optional[str]) -> Optional[str]:
    if not value:
        return None

    return str(value).replace("_R-", "-")


def extract_id(config_dn: Optional[str]) -> Optional[str]:
    if not config_dn:
        return None

    return normalize_ref_id(str(config_dn).split("/")[-1])


def extract_equipment_fields(params: Dict[str, Optional[str]]) -> Dict[str, Optional[str]]:
    return {
        "serial_number": first(
            params,
            [
                "serialNumber",
                "coreHwBoardSerialNumber",
                "hwSerialNumber",
                "chassisSerialNumber",
                "antSerial",
            ],
        ),
        "product_code": first(
            params,
            [
                "productCode",
                "prodCodePlanned",
                "coreHwBoardProductCode",
                "hwProductCode",
                "chassisProductCode",
            ],
        ),
        "product_name": first(
            params,
            [
                "productName",
                "coreHwBoardProductName",
                "hwProductName",
                "antModel",
            ],
        ),
    }


def enrich_equipment_with_reference(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df

    df = df.copy()

    df["object_type"] = df["object_type"].astype(str).str.upper()
    df["base_object_type"] = df["base_object_type"].astype(str).str.upper()
    df["id"] = df["id"].astype(str).str.replace("_R-", "-", regex=False)

    main_df = df[~df["object_type"].str.endswith("_R", na=False)].copy()
    ref_df = df[df["object_type"].str.endswith("_R", na=False)].copy()

    if ref_df.empty:
        return main_df

    ref_lookup_cols = [
        "source_file",
        "snapshot_date",
        "site_id",
        "base_object_type",
        "id",
        "serial_number",
        "product_code",
        "product_name",
    ]

    ref_lookup = (
        ref_df[[c for c in ref_lookup_cols if c in ref_df.columns]]
        .drop_duplicates()
        .rename(
            columns={
                "serial_number": "ref_serial_number",
                "product_code": "ref_product_code",
                "product_name": "ref_product_name",
            }
        )
    )

    merge_cols = [
        c for c in ["source_file", "snapshot_date", "site_id", "base_object_type", "id"]
        if c in main_df.columns and c in ref_lookup.columns
    ]

    if not merge_cols:
        return main_df

    result = main_df.merge(ref_lookup, how="left", on=merge_cols)

    result["serial_number"] = result["serial_number"].fillna(result.get("ref_serial_number"))
    result["product_code"] = result["product_code"].fillna(result.get("ref_product_code"))
    result["product_name"] = result["product_name"].fillna(result.get("ref_product_name"))

    return result.drop(
        columns=["ref_serial_number", "ref_product_code", "ref_product_name"],
        errors="ignore",
    )


def build_final_equipment_inventory(df_equipment: pd.DataFrame) -> pd.DataFrame:
    if df_equipment.empty:
        return pd.DataFrame()

    df = enrich_equipment_with_reference(df_equipment)

    df = df[df["object_type"].isin(FINAL_EQUIPMENT_TYPES)].copy()

    group_cols = [
        "snapshot_date",
        "date_folder",
        "site_id",
        "site_dn",
        "object_type",
        "id",
        "serial_number",
        "product_code",
        "product_name",
        "class",
        "config_dn",
        "source_file",
        "source_path",
    ]

    existing_group_cols = [c for c in group_cols if c in df.columns]

    df = (
        df.groupby(existing_group_cols, dropna=False)
        .size()
        .reset_index(name="nb_equipment")
    )

    df["equipment_sort_rank"] = (
        df["object_type"]
        .map(EQUIPMENT_SORT_ORDER)
        .fillna(50)
        .astype(int)
    )

    sort_cols = [
        c for c in ["snapshot_date", "site_id", "equipment_sort_rank", "object_type", "id"]
        if c in df.columns
    ]

    if sort_cols:
        df = df.sort_values(sort_cols).reset_index(drop=True)

    final_cols = [
        "snapshot_date",
        "date_folder",
        "site_id",
        "site_dn",
        "object_type",
        "id",
        "serial_number",
        "product_code",
        "product_name",
        "class",
        "config_dn",
        "source_file",
        "source_path",
        "nb_equipment",
    ]

    return df[[c for c in final_cols if c in df.columns]]


# ============================================================
# TABLE 3 — COMPTEURS
# ============================================================

def build_equipment_class_counter(df_equipment: pd.DataFrame) -> pd.DataFrame:
    if df_equipment.empty:
        return pd.DataFrame()

    df = df_equipment.copy()

    df["equipment_sort_rank"] = (
        df["object_type"]
        .map(EQUIPMENT_SORT_ORDER)
        .fillna(50)
        .astype(int)
    )

    group_cols = [
        "snapshot_date",
        "date_folder",
        "site_id",
        "object_type",
        "equipment_sort_rank",
    ]

    existing_group_cols = [c for c in group_cols if c in df.columns]

    result = (
        df.groupby(existing_group_cols, dropna=False)["nb_equipment"]
        .sum()
        .reset_index(name="equipment_count")
    )

    sort_cols = [
        c for c in ["snapshot_date", "site_id", "equipment_sort_rank", "object_type"]
        if c in result.columns
    ]

    if sort_cols:
        result = result.sort_values(sort_cols).reset_index(drop=True)

    final_cols = [
        "snapshot_date",
        "date_folder",
        "site_id",
        "object_type",
        "equipment_count",
    ]

    return result[[c for c in final_cols if c in result.columns]]


# ============================================================
# TABLE 4 — QUALITÉ DES DONNÉES
# ============================================================

def build_equipment_completeness_report(df_equipment: pd.DataFrame) -> pd.DataFrame:
    if df_equipment.empty:
        return pd.DataFrame(
            columns=[
                "snapshot_date",
                "date_folder",
                "site_id",
                "object_type",
                "total_rows",
                "serial_filled",
                "serial_missing",
                "product_code_filled",
                "product_code_missing",
                "product_name_filled",
                "product_name_missing",
                "completeness_percent",
            ]
        )

    group_cols = ["snapshot_date", "date_folder", "site_id", "object_type"]
    existing_group_cols = [c for c in group_cols if c in df_equipment.columns]

    result = (
        df_equipment.groupby(existing_group_cols, dropna=False)
        .agg(
            total_rows=("object_type", "size"),
            serial_filled=("serial_number", lambda s: s.notna().sum()),
            serial_missing=("serial_number", lambda s: s.isna().sum()),
            product_code_filled=("product_code", lambda s: s.notna().sum()),
            product_code_missing=("product_code", lambda s: s.isna().sum()),
            product_name_filled=("product_name", lambda s: s.notna().sum()),
            product_name_missing=("product_name", lambda s: s.isna().sum()),
        )
        .reset_index()
    )

    filled = (
        result["serial_filled"]
        + result["product_code_filled"]
        + result["product_name_filled"]
    )

    total = result["total_rows"] * 3

    result["completeness_percent"] = (
        ((filled / total) * 100)
        .round(2)
        .fillna(0)
    )

    sort_cols = [
        c for c in ["snapshot_date", "site_id", "object_type"]
        if c in result.columns
    ]

    if sort_cols:
        result = result.sort_values(sort_cols).reset_index(drop=True)

    return result


# ============================================================
# PARSER XML PRINCIPAL
# ============================================================

def parse_xml_file(
    xml_file: str | Path,
    forced_snapshot_date: Optional[str] = None,
    date_folder: Optional[str] = None,
    source_root: Optional[str | Path] = None,
) -> Dict[str, Any]:
    xml_path = Path(xml_file)
    source_root_path = Path(source_root) if source_root else None

    xml_snapshot_date = None

    site_id = None
    site_dn = None
    site_name = None
    blocking_state = None
    sw_version = None

    cells_2g = set()
    cells_3g = set()
    cells_5g = set()
    lte_generic = set()
    lte_fdd = set()
    lte_tdd = set()

    ipif_labels: Dict[str, Optional[str]] = {}
    ip_candidates: List[Tuple[str, str]] = []

    equipment_rows: List[Dict[str, Any]] = []

    context = etree.iterparse(
        str(xml_path),
        events=("end",),
        recover=True,
        huge_tree=True,
    )

    for _, elem in context:
        tag = strip_ns(elem.tag)

        if tag == "log" and xml_snapshot_date is None:
            xml_snapshot_date = normalize_date(elem.attrib.get("dateTime"))

        elif tag == "managedObject":
            mo_class = elem.attrib.get("class", "")
            dist_name = elem.attrib.get("distName", "")
            version = elem.attrib.get("version", "")
            params = get_params(elem)

            current_site_id = extract_mrbts_id(dist_name)
            current_site_dn = extract_mrbts_dn(dist_name)

            if mo_class == "com.nokia.srbts:MRBTS":
                site_id = current_site_id
                site_dn = dist_name
                site_name = params.get("btsName")
                blocking_state = params.get("blockingState")
                sw_version = version

            cell_type = classify_cell(mo_class)

            if cell_type == "2G":
                cells_2g.add(dist_name)
            elif cell_type == "3G":
                cells_3g.add(dist_name)
            elif cell_type == "5G":
                cells_5g.add(dist_name)
            elif cell_type == "LTE_GENERIC":
                lte_generic.add(dist_name)
            elif cell_type == "LTE_FDD":
                lte_fdd.add(dist_name)
            elif cell_type == "LTE_TDD":
                lte_tdd.add(dist_name)

            if mo_class == "com.nokia.srbts.tnl:IPIF":
                ipif_labels[dist_name] = params.get("userLabel")

            if mo_class == "com.nokia.srbts.tnl:IPADDRESSV4":
                ip = first(params, IP_FIELDS)
                if ip:
                    parent = "/".join(dist_name.split("/")[:-1])
                    ip_candidates.append((parent, ip))

            object_type = object_type_from_class(mo_class)

            if object_type in EQUIPMENT_TYPES:
                config_dn = first(params, ["configDN"]) or dist_name
                fields = extract_equipment_fields(params)

                row_site_id = site_id or current_site_id
                row_site_dn = site_dn or current_site_dn

                equipment_rows.append(
                    {
                        "source_file": xml_path.name,
                        "source_path": path_relative_to(xml_path, source_root_path),
                        "date_folder": date_folder,
                        "snapshot_date": normalize_date(forced_snapshot_date) or xml_snapshot_date,
                        "xml_snapshot_date": xml_snapshot_date,
                        "site_id": row_site_id,
                        "site_dn": row_site_dn,
                        "class": mo_class,
                        "config_dn": config_dn,
                        "id": extract_id(config_dn),
                        "object_type": object_type,
                        "base_object_type": base_object_type(object_type),
                        "serial_number": fields["serial_number"],
                        "product_code": fields["product_code"],
                        "product_name": fields["product_name"],
                    }
                )

            elem.clear()

    preferred_ip = None

    for parent, ip in ip_candidates:
        if ipif_labels.get(parent) == "MP":
            preferred_ip = ip
            break

    ip_address = preferred_ip if preferred_ip else (
        ip_candidates[0][1] if ip_candidates else None
    )

    final_snapshot_date = normalize_date(forced_snapshot_date) or xml_snapshot_date

    site_row = build_site_row(
        xml_path=xml_path,
        source_root=source_root_path,
        date_folder=date_folder,
        snapshot_date=final_snapshot_date,
        xml_snapshot_date=xml_snapshot_date,
        site_id=site_id,
        site_dn=site_dn,
        site_name=site_name,
        blocking_state=blocking_state,
        sw_version=sw_version,
        ip_address=ip_address,
        cells_2g=cells_2g,
        cells_3g=cells_3g,
        cells_5g=cells_5g,
        lte_generic=lte_generic,
        lte_fdd=lte_fdd,
        lte_tdd=lte_tdd,
    )

    return {
        "site": site_row,
        "equipment": equipment_rows,
    }


# ============================================================
# PARSING PARALLÈLE DE TOUT LE DOSSIER
# ============================================================

def _worker(args: Tuple[str, Optional[str], Optional[str], Optional[str]]) -> Dict[str, Any]:
    xml_file, forced_snapshot_date, date_folder, source_root = args

    return parse_xml_file(
        xml_file=xml_file,
        forced_snapshot_date=forced_snapshot_date,
        date_folder=date_folder,
        source_root=source_root,
    )


def parse_folder_parallel(
    xml_folder: str | Path,
    max_workers: Optional[int] = None,
    forced_snapshot_date: Optional[str] = None,
    date_folder: Optional[str] = None,
    recursive: bool = True,
    source_root: Optional[str | Path] = None,
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Parse tous les XML disponibles dans un dossier.

    Paramètres importants:
        xml_folder:
            Dossier à parser.

        recursive=True:
            Parse tous les fichiers:
                xml_folder/**/*.xml

        forced_snapshot_date:
            Date imposée depuis le grand dossier DATA.XML/2025.02.13.
            C'est cette date qui sera utilisée par le dashboard et le delta.

        date_folder:
            Même logique que forced_snapshot_date, gardée pour audit.

        max_workers:
            Nombre de processus parallèles.
            Ce n'est PAS une limite de fichiers.

    Retour:
        df_sites, df_equipment_raw
    """
    files = list_xml_files(xml_folder, recursive=recursive)

    if max_workers is None:
        max_workers = max(1, (os.cpu_count() or 4) - 1)

    source_root_str = str(source_root or xml_folder)

    site_rows: List[Dict[str, Any]] = []
    equipment_rows: List[Dict[str, Any]] = []

    tasks = [
        (
            str(xml_file),
            forced_snapshot_date,
            date_folder,
            source_root_str,
        )
        for xml_file in files
    ]

    total_files = len(tasks)

    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        for i, result in enumerate(executor.map(_worker, tasks), start=1):
            if result.get("site"):
                site_rows.append(result["site"])

            equipment_rows.extend(result.get("equipment", []))

            if i % 50 == 0 or i == total_files:
                print(f"[PARSE] {i}/{total_files} fichiers XML traités")

    return pd.DataFrame(site_rows), pd.DataFrame(equipment_rows)


# ============================================================
# TEST LOCAL OPTIONNEL
# ============================================================

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Parser Nokia XML — parse tous les XML d'un dossier."
    )

    parser.add_argument(
        "xml_folder",
        type=Path,
        help="Dossier contenant les XML à parser.",
    )

    parser.add_argument(
        "--date",
        type=str,
        default=None,
        help="Date forcée, exemple: 2025-02-13.",
    )

    parser.add_argument(
        "--no-recursive",
        action="store_true",
        help="Désactive la recherche récursive.",
    )

    parser.add_argument(
        "--max-workers",
        type=int,
        default=None,
        help="Nombre de workers parallèles.",
    )

    args = parser.parse_args()

    sites, equipment = parse_folder_parallel(
        xml_folder=args.xml_folder,
        forced_snapshot_date=args.date,
        date_folder=args.date,
        recursive=not args.no_recursive,
        source_root=args.xml_folder,
        max_workers=args.max_workers,
    )

    print("=" * 80)
    print(f"Sites: {len(sites)}")
    print(f"Équipements bruts: {len(equipment)}")
    print("=" * 80)
