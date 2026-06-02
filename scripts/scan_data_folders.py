import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(PROJECT_ROOT))

from config.settings import RAW_DATA_PATH


def scan_date_folders():
    print("Scanning:", RAW_DATA_PATH)

    if not RAW_DATA_PATH.exists():
        print("ERROR: path does not exist")
        return

    folders = [p for p in RAW_DATA_PATH.iterdir() if p.is_dir()]

    print(f"Nombre de dossiers dates trouvés: {len(folders)}")

    for folder in sorted(folders):
        xml_files = list(folder.glob("*.xml")) + list(folder.glob("*.XML"))
        print(f"- {folder.name}: {len(xml_files)} fichiers XML")


if __name__ == "__main__":
    scan_date_folders()