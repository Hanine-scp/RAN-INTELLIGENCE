import sys
from pathlib import Path
import xml.etree.ElementTree as ET
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(PROJECT_ROOT))

from config.settings import RAW_DATA_PATH, SILVER_PATH


def clean_tag(tag: str):
    return tag.split("}")[-1]


def extract_site_id(dist_name: str):
    if not dist_name:
        return None

    first_part = dist_name.split("/")[0]

    if first_part.startswith("MRBTS-"):
        return first_part.replace("MRBTS-", "")

    return first_part


def parse_one_site(snapshot_date="2026.05.14"):
    folder = RAW_DATA_PATH / snapshot_date
    xml_files = sorted([
        p for p in folder.iterdir()
        if p.is_file() and p.suffix.lower() == ".xml"
    ])

    file_path = xml_files[0]

    tree = ET.parse(file_path)
    root = tree.getroot()

    rows = []

    for elem in root.iter():
        if clean_tag(elem.tag) != "managedObject":
            continue

        object_class = elem.attrib.get("class")
        version = elem.attrib.get("version")
        dist_name = elem.attrib.get("distName")
        operation = elem.attrib.get("operation")

        site_id = extract_site_id(dist_name)

        rows.append({
            "snapshot_date": snapshot_date,
            "source_file": file_path.name,
            "site_id": site_id,
            "object_class": object_class,
            "object_version": version,
            "dist_name": dist_name,
            "operation": operation
        })

    df = pd.DataFrame(rows)

    SILVER_PATH.mkdir(parents=True, exist_ok=True)
    output = SILVER_PATH / f"managed_objects_{snapshot_date}.csv"
    df.to_csv(output, index=False, encoding="utf-8-sig")

    print(df.head(20))
    print(f"\nNombre managedObject: {len(df)}")
    print(f"Saved to: {output}")


if __name__ == "__main__":
    parse_one_site()