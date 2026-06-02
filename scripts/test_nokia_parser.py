import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(PROJECT_ROOT))

from config.settings import RAW_DATA_PATH, SILVER_PATH
from src.parsers.nokia_parser import (
    parse_folder_parallel,
    build_final_equipment_inventory,
    build_equipment_class_counter,
    build_equipment_completeness_report,
)


def main():
    snapshot_date = "2026.05.14"
    xml_folder = RAW_DATA_PATH / snapshot_date

    df_sites, df_equipment_raw = parse_folder_parallel(
        xml_folder=xml_folder,
        max_workers=2,
        forced_snapshot_date=snapshot_date,
        date_folder=snapshot_date,
        recursive=False,
        source_root=RAW_DATA_PATH,
    )

    df_equipment = build_final_equipment_inventory(df_equipment_raw)
    df_counters = build_equipment_class_counter(df_equipment)
    df_completeness = build_equipment_completeness_report(df_equipment)

    SILVER_PATH.mkdir(parents=True, exist_ok=True)

    df_sites.to_csv(SILVER_PATH / f"test_sites_{snapshot_date}.csv", index=False, encoding="utf-8-sig")
    df_equipment.to_csv(SILVER_PATH / f"test_equipment_{snapshot_date}.csv", index=False, encoding="utf-8-sig")
    df_counters.to_csv(SILVER_PATH / f"test_counters_{snapshot_date}.csv", index=False, encoding="utf-8-sig")
    df_completeness.to_csv(SILVER_PATH / f"test_completeness_{snapshot_date}.csv", index=False, encoding="utf-8-sig")

    print("\n===== SITES =====")
    print(df_sites.head())
    print(df_sites.shape)

    print("\n===== EQUIPMENT =====")
    print(df_equipment.head())
    print(df_equipment.shape)

    print("\n===== COUNTERS =====")
    print(df_counters.head())
    print(df_counters.shape)

    print("\n===== COMPLETENESS =====")
    print(df_completeness.head())
    print(df_completeness.shape)

    print("\nExports saved in:", SILVER_PATH)


if __name__ == "__main__":
    main()