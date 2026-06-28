from __future__ import annotations

from pathlib import Path

import pandas as pd

from config.settings import RAW_DATA_PATH
from src.parsers.parsed_values import MISSING_VALUE
from src.parsers.nokia_parser import (
    build_equipment_class_counter,
    build_final_equipment_inventory,
    extract_equipment_fields,
    parse_xml_file,
)

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "equipment_seven_types_sample.xml"


def test_retu_maps_ant_model_to_product_code():
    fields = extract_equipment_fields(
        {"antModel": "AE049", "antSerial": "AE049L110027T--Y3"},
        "RETU",
    )
    assert fields["serial_number"] == "AE049L110027T--Y3"
    assert fields["product_code"] == "AE049"
    assert fields["product_name"] == "AE049"


def test_ald_maps_product_and_serial():
    fields = extract_equipment_fields(
        {
            "controlProtocol": "AISG 2.0",
            "productCode": "FlexRET",
            "serialNumber": "AU040K450066T--Y3",
        },
        "ALD",
    )
    assert fields["serial_number"] == "AU040K450066T--Y3"
    assert fields["product_code"] == "FlexRET"
    assert fields["product_name"] == "FlexRET"


def test_bbmod_uses_prod_code_planned():
    fields = extract_equipment_fields({"prodCodePlanned": "473096A"}, "BBMOD")
    assert fields["product_code"] == "473096A"
    assert fields["product_name"] is None


def test_antl_uses_port_label():
    fields = extract_equipment_fields({"antPortId": "1"}, "ANTL")
    assert fields["serial_number"] is None
    assert fields["product_code"] is None
    assert fields["product_name"] == "Port 1"


def test_missing_fields_use_placeholder():
    fields = extract_equipment_fields({}, "BBMOD")
    assert fields["serial_number"] is None
    assert fields["product_code"] is None
    assert fields["product_name"] is None

    final = build_final_equipment_inventory(
        pd.DataFrame(
            [
                {
                    "source_file": "x.xml",
                    "snapshot_date": "2025-06-08",
                    "site_id": "1",
                    "object_type": "BBMOD",
                    "base_object_type": "BBMOD",
                    "id": "BBMOD-1",
                    "config_dn": "MRBTS-1/EQM-1/BBMOD-1",
                    **fields,
                }
            ]
        )
    )
    row = final.iloc[0]
    assert row["serial_number"] == MISSING_VALUE
    assert row["product_code"] == MISSING_VALUE
    assert row["product_name"] == MISSING_VALUE


def test_smod_r_runtime_fields():
    fields = extract_equipment_fields(
        {
            "configDN": "MRBTS-12005/EQM-1/APEQM-1/CABINET-1/SMOD-1",
            "coreHwBoardProductCode": "089596A.204",
            "coreHwBoardSerialNumber": "DH215167043",
            "productCode": "473764A.102",
            "productName": "ASIB AirScale Common",
            "serialNumber": "DH220143685",
        },
        "SMOD_R",
    )
    assert fields["serial_number"] == "DH220143685"
    assert fields["product_code"] == "473764A.102"
    assert fields["product_name"] == "ASIB AirScale Common"


def test_runtime_product_code_overrides_planned():
    xml_path = RAW_DATA_PATH / "2026.05.14" / "MRBTS12012.xml"
    if not xml_path.exists():
        return

    result = parse_xml_file(
        xml_path,
        forced_snapshot_date="2026-05-14",
        source_root=RAW_DATA_PATH,
    )
    final = build_final_equipment_inventory(pd.DataFrame(result["equipment"]))
    bbmod3 = final[(final.object_type == "BBMOD") & (final.id == "BBMOD-3")]
    assert len(bbmod3) == 1
    row = bbmod3.iloc[0]
    assert row["product_code"] == "475266B.102"
    assert row["product_code"] != "475266A"
    assert row["product_name"] == "ABIO AirScale Capacity"


def test_seven_types_fixture_inventory():
    result = parse_xml_file(FIXTURE, forced_snapshot_date="2025-06-08")
    final = build_final_equipment_inventory(pd.DataFrame(result["equipment"]))
    counters = build_equipment_class_counter(final)

    by_type = {
        row["object_type"]: row
        for _, row in final.sort_values(["object_type", "id"]).iterrows()
    }

    assert by_type["BBMOD"]["serial_number"] == "AS173705940"
    assert by_type["BBMOD"]["product_code"] == "473096A"
    assert by_type["BBMOD"]["product_name"] == "Flexi Baseband Module"
    assert by_type["BBMOD"]["nb_equipment"] == 1

    assert by_type["SMOD"]["serial_number"] == "NK155060308"
    assert by_type["SMOD"]["product_code"] == "473095A"
    assert by_type["SMOD"]["product_name"] == "Flexi System Module"
    assert by_type["SMOD"]["nb_equipment"] == 1

    assert by_type["RMOD"]["serial_number"] == "K9204527162"
    assert by_type["RMOD"]["product_code"] == "474840A"
    assert by_type["RMOD"]["product_name"] == "Radio Module ARDA"
    assert by_type["RMOD"]["nb_equipment"] == 1

    assert by_type["CABINET"]["serial_number"] == "NK155060307"
    assert by_type["CABINET"]["product_code"] == "FSMr3"
    assert by_type["CABINET"]["product_name"] == "Flexi Cabinet"

    assert by_type["ALD"]["serial_number"] == "AU040K450066T--Y3"
    assert by_type["ALD"]["product_code"] == "FlexRET"
    assert by_type["ALD"]["nb_equipment"] == 1

    assert by_type["RETU"]["serial_number"] == "AE049L110027T--Y3"
    assert by_type["RETU"]["product_code"] == "AE049"
    assert by_type["RETU"]["parent_dn"] == "MRBTS-12005/EQM-1/APEQM-1/ALD-1"
    assert by_type["RETU"]["nb_equipment"] == 1

    assert by_type["ANTL"]["product_name"] == "Port 1"
    assert by_type["ANTL"]["serial_number"] == MISSING_VALUE
    assert by_type["ANTL"]["product_code"] == MISSING_VALUE
    assert by_type["ANTL"]["parent_dn"] == "MRBTS-12005/EQM-1/APEQM-1/RMOD-1"
    assert by_type["ANTL"]["nb_equipment"] == 1

    assert int(counters["equipment_count"].sum()) == 7
