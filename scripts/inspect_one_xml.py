import sys
from pathlib import Path
import xml.etree.ElementTree as ET

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(PROJECT_ROOT))

from config.settings import RAW_DATA_PATH


def inspect_one_xml(snapshot_date="2026.05.14"):
    folder = RAW_DATA_PATH / snapshot_date
    xml_files = sorted([p for p in folder.iterdir() if p.is_file() and p.suffix.lower() == ".xml"])

    file_path = xml_files[0]
    print("Fichier analysé:", file_path.name)

    tree = ET.parse(file_path)
    root = tree.getroot()

    print("\nROOT:")
    print(root.tag, root.attrib)

    print("\nTAGS principaux:")
    tags = {}

    for elem in root.iter():
        tag = elem.tag.split("}")[-1]
        tags[tag] = tags.get(tag, 0) + 1

    for tag, count in sorted(tags.items(), key=lambda x: x[1], reverse=True)[:30]:
        print(tag, count)

    print("\nmanagedObject exemples:")
    count = 0
    for elem in root.iter():
        tag = elem.tag.split("}")[-1]
        if tag == "managedObject":
            print(elem.attrib)
            count += 1
            if count == 10:
                break


if __name__ == "__main__":
    inspect_one_xml()