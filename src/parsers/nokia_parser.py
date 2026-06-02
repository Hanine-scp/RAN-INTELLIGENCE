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
# OUTILS XML / TEXTE
# ============================================================

def safe_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None

    value = str(value).strip()
    return value if value else None


def strip_ns(tag: str) -> str:
    return tag.split("}", 1)[1] if "}" in tag else tag


def list_xml_files(xml_folder: str) -> List[Path]:
    folder = Path(xml_folder)

    if not folder.exists():
        raise FileNotFoundError(f"Dossier XML introuvable : {folder}")

    files = sorted(folder.glob("*.xml"))

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


# ============================================================
# TABLE 1 — NETWORK FOOTPRINT / SITES
# ============================================================

def infer_site_state(blocking_state: Optional[str]) -> str:
    return "blocked" if str(blocking_state).strip().lower() == "blocked" else "active"


def classify_cell(class_name: Optional[str]) -> Optional[str]:
    if not class_name:
        return None

    c = str(class_name).strip()

    if c == "com.nokia.srbts.gsm:GNCEL":
        return "2G"

    if c == "com.nokia.srbts.wcdma:WNCEL":
        return "3G"

    if c == "com.nokia.srbts.nrbts:NRCELL":
        return "5G"

    if c == "NOKLTE:LNCEL":
        return "LTE_GENERIC"

    if c.lower() == "noklte:lncel_fdd":
        return "LTE_FDD"

    if c.lower() == "noklte:lncel_tdd":
        return "LTE_TDD"

    return None


def build_site_row(
    xml_path: Path,
    snapshot_date: Optional[str],
    site_id: Optional[str],
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
        "snapshot_date": snapshot_date,
        "site_id": site_id,
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
# TABLE 2 — HARDWARE INVENTORY / ÉQUIPEMENTS
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

    ref_lookup = ref_df[
        [
            "source_file",
            "snapshot_date",
            "site_id",
            "base_object_type",
            "id",
            "serial_number",
            "product_code",
            "product_name",
        ]
    ].drop_duplicates().rename(
        columns={
            "serial_number": "ref_serial_number",
            "product_code": "ref_product_code",
            "product_name": "ref_product_name",
        }
    )

    result = main_df.merge(
        ref_lookup,
        how="left",
        on=["source_file", "snapshot_date", "site_id", "base_object_type", "id"],
    )

    result["serial_number"] = result["serial_number"].fillna(result["ref_serial_number"])
    result["product_code"] = result["product_code"].fillna(result["ref_product_code"])
    result["product_name"] = result["product_name"].fillna(result["ref_product_name"])

    return result.drop(
        columns=["ref_serial_number", "ref_product_code", "ref_product_name"],
        errors="ignore",
    )


def build_final_equipment_inventory(df_equipment: pd.DataFrame) -> pd.DataFrame:
    if df_equipment.empty:
        return pd.DataFrame()

    df = enrich_equipment_with_reference(df_equipment)

    df = df[df["object_type"].isin(FINAL_EQUIPMENT_TYPES)].copy()

    df = (
        df.groupby(
            [
                "snapshot_date",
                "site_id",
                "object_type",
                "id",
                "serial_number",
                "product_code",
                "product_name",
                "class",
                "config_dn",
                "source_file",
            ],
            dropna=False,
        )
        .size()
        .reset_index(name="nb_equipment")
    )

    df["equipment_sort_rank"] = df["object_type"].map(EQUIPMENT_SORT_ORDER).fillna(50).astype(int)

    df = df.sort_values(
        by=[
            "snapshot_date",
            "site_id",
            "equipment_sort_rank",
            "object_type",
            "id",
        ],
        ascending=[True, True, True, True, True],
    ).reset_index(drop=True)

    return df[
        [
            "snapshot_date",
            "site_id",
            "object_type",
            "id",
            "serial_number",
            "product_code",
            "product_name",
            "class",
            "config_dn",
            "source_file",
            "nb_equipment",
        ]
    ]


# ============================================================
# TABLE 3 — COUNTERS / COMPTEURS
# ============================================================

def build_equipment_class_counter(df_equipment: pd.DataFrame) -> pd.DataFrame:
    if df_equipment.empty:
        return pd.DataFrame()

    df = df_equipment.copy()
    df["equipment_sort_rank"] = df["object_type"].map(EQUIPMENT_SORT_ORDER).fillna(50).astype(int)

    result = (
        df.groupby(
            ["snapshot_date", "site_id", "object_type", "equipment_sort_rank"],
            dropna=False,
        )["nb_equipment"]
        .sum()
        .reset_index(name="equipment_count")
        .sort_values(
            ["snapshot_date", "site_id", "equipment_sort_rank", "object_type"],
            ascending=[True, True, True, True],
        )
        .reset_index(drop=True)
    )

    return result[
        [
            "snapshot_date",
            "site_id",
            "object_type",
            "equipment_count",
        ]
    ]


# ============================================================
# TABLE 4 — DATA QUALITY / QUALITÉ DES DONNÉES
# ============================================================

def build_equipment_completeness_report(df_equipment: pd.DataFrame) -> pd.DataFrame:
    if df_equipment.empty:
        return pd.DataFrame(
            columns=[
                "snapshot_date",
                "site_id",
                "object_type",
                "total_rows",
                "serial_filled",
                "serial_missing",
                "product_code_filled",
                "product_code_missing",
                "product_name_filled",
                "product_name_missing",
            ]
        )

    return (
        df_equipment.groupby(["snapshot_date", "site_id", "object_type"], dropna=False)
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
        .sort_values(["snapshot_date", "site_id", "object_type"])
        .reset_index(drop=True)
    )
# ============================================================
# XML PARSER PRINCIPAL
# ============================================================

def parse_xml_file(xml_file: str) -> Dict[str, Any]:
    xml_path = Path(xml_file)

    snapshot_date = None
    site_id = None
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

        if tag == "log" and snapshot_date is None:
            snapshot_date = elem.attrib.get("dateTime")

        elif tag == "managedObject":
            mo_class = elem.attrib.get("class", "")
            dist_name = elem.attrib.get("distName", "")
            version = elem.attrib.get("version", "")
            params = get_params(elem)

            if mo_class == "com.nokia.srbts:MRBTS":
                site_id = dist_name
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

                equipment_rows.append(
                    {
                        "source_file": xml_path.name,
                        "snapshot_date": snapshot_date,
                        "site_id": site_id,
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

    site_row = build_site_row(
        xml_path=xml_path,
        snapshot_date=snapshot_date,
        site_id=site_id,
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
# PARSING PARALLÈLE
# ============================================================

def _worker(xml_file: str) -> Dict[str, Any]:
    return parse_xml_file(xml_file)


def parse_folder_parallel(
    xml_folder: str,
    max_workers: Optional[int] = None,
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    files = list_xml_files(xml_folder)

    if max_workers is None:
        max_workers = max(1, (os.cpu_count() or 4) - 1)

    site_rows: List[Dict[str, Any]] = []
    equipment_rows: List[Dict[str, Any]] = []

    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        for i, result in enumerate(
            executor.map(_worker, [str(f) for f in files]),
            start=1,
        ):
            if result.get("site"):
                site_rows.append(result["site"])

            equipment_rows.extend(result.get("equipment", []))

            if i % 50 == 0 or i == len(files):
                print(f"[PARSE] {i}/{len(files)} fichiers traités")

    return pd.DataFrame(site_rows), pd.DataFrame(equipment_rows)