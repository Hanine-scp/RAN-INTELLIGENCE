from __future__ import annotations

import logging
import os
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from lxml import etree
import pandas as pd

from src.parsers.cell_classification import classify_cell
from src.parsers.parsed_values import (
    finalize_equipment_field_values,
    is_missing_parsed_value,
    resolve_parsed_value,
)

logger = logging.getLogger(__name__)


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
        "site_name": resolve_parsed_value(site_name),
        "site_state": infer_site_state(blocking_state),
        "blocking_state": resolve_parsed_value(blocking_state),
        "ip_address": resolve_parsed_value(ip_address),
        "sw_version": resolve_parsed_value(sw_version),
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


def extract_parent_dn(dist_name: Optional[str], object_type: str) -> Optional[str]:
    if not dist_name:
        return None

    parts = str(dist_name).split("/")
    if len(parts) < 2:
        return None

    base = base_object_type(object_type)
    parent_segment = parts[-2].upper()

    if base == "RETU" and parent_segment.startswith("ALD"):
        return "/".join(parts[:-1])
    if base == "ANTL" and parent_segment.startswith("RMOD"):
        return "/".join(parts[:-1])
    if base in {"BBMOD", "SMOD"} and parent_segment.startswith("CABINET"):
        return "/".join(parts[:-1])

    return None


def extract_equipment_fields(
    params: Dict[str, Optional[str]],
    object_type: str = "",
) -> Dict[str, Optional[str]]:
    """
    Map Nokia EQM / EQMR params to inventory fields.

    EQM (planned config):
      BBMOD/SMOD/RMOD -> product_code=prodCodePlanned only
      CABINET/ANTL    -> no serial/code/name (filled from *_R or antPortId)

    EQMR (*_R runtime, authoritative when merged):
      BBMOD/SMOD/RMOD/CABINET -> productCode, productName, serialNumber
      RETU -> antSerial, antModel
      ALD  -> serialNumber, productCode, productName|productCode
    """
    object_type = str(object_type or "").upper()
    base_type = base_object_type(object_type)
    is_runtime = object_type.endswith("_R")

    runtime_hw_serial = [
        "serialNumber",
        "coreHwBoardSerialNumber",
        "hwSerialNumber",
        "chassisSerialNumber",
    ]
    runtime_hw_code = [
        "productCode",
        "coreHwBoardProductCode",
        "hwProductCode",
        "chassisProductCode",
    ]
    runtime_hw_name = [
        "productName",
        "coreHwBoardProductName",
        "hwProductName",
    ]

    if base_type == "RETU":
        serial_keys = ["antSerial"]
        code_keys = ["antModel"]
        name_keys = ["antModel"]
    elif base_type == "ALD":
        serial_keys = ["serialNumber"]
        code_keys = ["productCode"]
        name_keys = ["productName", "productCode", "controlProtocol"]
    elif base_type == "ANTL":
        serial_keys = []
        code_keys = []
        name_keys = []
    elif is_runtime and base_type in {"BBMOD", "SMOD", "RMOD", "CABINET"}:
        serial_keys = runtime_hw_serial
        code_keys = runtime_hw_code
        name_keys = runtime_hw_name
    elif not is_runtime and base_type in {"BBMOD", "SMOD", "RMOD"}:
        serial_keys = []
        code_keys = ["prodCodePlanned"]
        name_keys = []
    elif not is_runtime and base_type == "CABINET":
        serial_keys = []
        code_keys = []
        name_keys = []
    else:
        serial_keys = runtime_hw_serial
        code_keys = ["prodCodePlanned", *runtime_hw_code]
        name_keys = runtime_hw_name

    serial_number = first(params, serial_keys) if serial_keys else None
    product_code = first(params, code_keys) if code_keys else None
    product_name = first(params, name_keys) if name_keys else None

    if base_type == "ANTL" and params.get("antPortId"):
        product_name = product_name or f"Port {params['antPortId']}"

    return {
        "serial_number": serial_number,
        "product_code": product_code,
        "product_name": product_name,
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
        "config_dn",
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
        c for c in ["source_file", "snapshot_date", "site_id", "base_object_type", "config_dn"]
        if c in main_df.columns and c in ref_lookup.columns
    ]

    if not merge_cols:
        return main_df

    result = main_df.merge(ref_lookup, how="left", on=merge_cols)

    ref_serial = result.get("ref_serial_number")
    ref_code = result.get("ref_product_code")
    ref_name = result.get("ref_product_name")

    if ref_serial is not None:
        result["serial_number"] = ref_serial.combine_first(result["serial_number"])
    else:
        result["serial_number"] = result["serial_number"].fillna(ref_serial)

    if ref_code is not None:
        # Runtime *_R productCode is authoritative (e.g. 475266A.104 vs planned 475266A).
        result["product_code"] = ref_code.combine_first(result["product_code"])
    else:
        result["product_code"] = result["product_code"].fillna(ref_code)

    if ref_name is not None:
        result["product_name"] = ref_name.combine_first(result["product_name"])
    else:
        result["product_name"] = result["product_name"].fillna(ref_name)

    return result.drop(
        columns=["ref_serial_number", "ref_product_code", "ref_product_name"],
        errors="ignore",
    )


def reconcile_product_display_fields(df: pd.DataFrame) -> pd.DataFrame:
    """Drop product_name when it duplicates product_code for modules with distinct runtime names."""
    if df.empty or "object_type" not in df.columns:
        return df

    df = df.copy()
    distinct_name_types = {"BBMOD", "SMOD", "RMOD", "CABINET"}
    if "product_name" not in df.columns or "product_code" not in df.columns:
        return df

    name_text = df["product_name"].astype("string").str.strip()
    code_text = df["product_code"].astype("string").str.strip()
    duplicate_name = (
        df["object_type"].isin(distinct_name_types)
        & name_text.notna()
        & code_text.notna()
        & (name_text == code_text)
    )
    df.loc[duplicate_name, "product_name"] = pd.NA
    return df


def build_final_equipment_inventory(df_equipment: pd.DataFrame) -> pd.DataFrame:
    if df_equipment.empty:
        return pd.DataFrame()

    df = enrich_equipment_with_reference(df_equipment)

    df = reconcile_product_display_fields(df)

    df = finalize_equipment_field_values(df)

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
        "parent_dn",
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
        "parent_dn",
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
            serial_filled=("serial_number", lambda s: s.map(lambda v: not is_missing_parsed_value(v)).sum()),
            serial_missing=("serial_number", lambda s: s.map(is_missing_parsed_value).sum()),
            product_code_filled=("product_code", lambda s: s.map(lambda v: not is_missing_parsed_value(v)).sum()),
            product_code_missing=("product_code", lambda s: s.map(is_missing_parsed_value).sum()),
            product_name_filled=("product_name", lambda s: s.map(lambda v: not is_missing_parsed_value(v)).sum()),
            product_name_missing=("product_name", lambda s: s.map(is_missing_parsed_value).sum()),
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
                fields = extract_equipment_fields(params, object_type)

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
                        "parent_dn": extract_parent_dn(dist_name, object_type),
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

def format_duration(seconds: float) -> str:
    total = max(0, int(seconds))
    hours, rem = divmod(total, 3600)
    minutes, secs = divmod(rem, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def _empty_parse_stats() -> Dict[str, int]:
    return {
        "sites": 0,
        "equipment": 0,
        "cells_total": 0,
        "cells_2g": 0,
        "cells_3g": 0,
        "cells_lte_4g": 0,
        "cells_lte_fdd": 0,
        "cells_lte_tdd": 0,
        "cells_5g": 0,
    }


def _accumulate_site_stats(stats: Dict[str, int], site: Dict[str, Any]) -> None:
    stats["sites"] += 1
    stats["cells_2g"] += int(site.get("nb_cells_2g") or 0)
    stats["cells_3g"] += int(site.get("nb_cells_3g") or 0)
    stats["cells_lte_4g"] += int(site.get("nb_cells_lte_4g") or 0)
    stats["cells_lte_fdd"] += int(site.get("nb_cells_lte_fdd") or 0)
    stats["cells_lte_tdd"] += int(site.get("nb_cells_lte_tdd") or 0)
    stats["cells_5g"] += int(site.get("nb_cells_5g") or 0)
    stats["cells_total"] += int(site.get("nb_cells") or 0)


def _emit_parse_progress(
    *,
    index: int,
    total_files: int,
    started_at: float,
    stats: Dict[str, int],
    snapshot_date: Optional[str],
    workers: int,
    final: bool = False,
) -> None:
    elapsed = time.perf_counter() - started_at
    percent = round((index / total_files) * 100, 1) if total_files else 100.0
    rate = index / elapsed if elapsed > 0 else 0.0
    remaining = total_files - index
    eta_seconds = remaining / rate if rate > 0 else 0.0

    label = "TERMINÉ" if final else "PROGRESSION"
    message = (
        f"[PARSE {label}] {index:,}/{total_files:,} XML ({percent}%) | "
        f"temps écoulé {format_duration(elapsed)}"
        + (f" | ETA {format_duration(eta_seconds)}" if not final and remaining > 0 else "")
        + f" | workers={workers}"
        + (f" | snapshot={snapshot_date}" if snapshot_date else "")
        + f" | sites={stats['sites']:,} | équipements={stats['equipment']:,}"
        + f" | cellules 2G={stats['cells_2g']:,} 3G={stats['cells_3g']:,}"
        + f" 4G={stats['cells_lte_4g']:,} (FDD={stats['cells_lte_fdd']:,} TDD={stats['cells_lte_tdd']:,})"
        + f" 5G={stats['cells_5g']:,} | total={stats['cells_total']:,}"
        + (f" | débit {rate:.1f} XML/s" if rate > 0 else "")
    )
    print(message, flush=True)
    logger.info(message)


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
    stats = _empty_parse_stats()
    started_at = time.perf_counter()
    worker_count = max_workers if max_workers not in (None, 0) else 1

    print(
        f"[PARSE DÉMARRAGE] dossier={xml_folder} | fichiers XML={total_files:,}"
        f" | snapshot={forced_snapshot_date or date_folder or 'auto'}"
        f" | workers={worker_count if max_workers != 0 else 'séquentiel'}",
        flush=True,
    )
    logger.info("Démarrage parsing Nokia: %s fichiers dans %s", total_files, xml_folder)

    def consume_result(i: int, result: Dict[str, Any]) -> None:
        site = result.get("site")
        if site:
            site_rows.append(site)
            _accumulate_site_stats(stats, site)
        equipment_rows.extend(result.get("equipment", []))
        stats["equipment"] = len(equipment_rows)

        if i % 50 == 0 or i == total_files:
            _emit_parse_progress(
                index=i,
                total_files=total_files,
                started_at=started_at,
                stats=stats,
                snapshot_date=forced_snapshot_date or date_folder,
                workers=worker_count if max_workers != 0 else 1,
                final=i == total_files,
            )

    # max_workers=0: sequential mode (stable when called from FastAPI on Windows)
    if max_workers == 0:
        for i, task in enumerate(tasks, start=1):
            consume_result(i, _worker(task))
        return pd.DataFrame(site_rows), pd.DataFrame(equipment_rows)

    if max_workers is None:
        max_workers = max(1, (os.cpu_count() or 4) - 1)
        worker_count = max_workers

    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        for i, result in enumerate(executor.map(_worker, tasks), start=1):
            consume_result(i, result)

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

    if not sites.empty:
        cell_preview = sites[
            [
                c
                for c in [
                    "site_id",
                    "nb_cells",
                    "nb_cells_2g",
                    "nb_cells_3g",
                    "nb_cells_lte_4g",
                    "nb_cells_lte_fdd",
                    "nb_cells_lte_tdd",
                    "nb_cells_5g",
                    "technologies",
                ]
                if c in sites.columns
            ]
        ].head(5)
        print("\nAperçu cellules (5 premiers sites):")
        print(cell_preview.to_string(index=False))

    print("=" * 80)
    print(f"Sites: {len(sites):,}")
    print(f"Équipements bruts: {len(equipment):,}")
    if not sites.empty:
        print(
            "Totaux cellules — "
            f"2G={int(sites['nb_cells_2g'].sum()):,} | "
            f"3G={int(sites['nb_cells_3g'].sum()):,} | "
            f"4G={int(sites['nb_cells_lte_4g'].sum()):,} | "
            f"5G={int(sites['nb_cells_5g'].sum()):,} | "
            f"total={int(sites['nb_cells'].sum()):,}"
        )
    print("=" * 80)
