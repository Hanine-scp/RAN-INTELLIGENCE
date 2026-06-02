import sys
from pathlib import Path
from datetime import datetime
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(PROJECT_ROOT))

from config.settings import RAW_DATA_PATH, BRONZE_PATH


def build_snapshot_registry():
    rows = []

    for date_folder in sorted(RAW_DATA_PATH.iterdir()):
        if not date_folder.is_dir():
            continue

        xml_files = list({p.resolve() for p in date_folder.iterdir() if p.is_file() and p.suffix.lower() == ".xml"})

        rows.append({
            "snapshot_date": date_folder.name,
            "folder_path": str(date_folder),
            "site_count": len(xml_files),
            "processed_at": datetime.now().isoformat(timespec="seconds"),
            "status": "DISCOVERED"
        })

    BRONZE_PATH.mkdir(parents=True, exist_ok=True)

    df = pd.DataFrame(rows)
    output = BRONZE_PATH / "snapshot_registry.csv"
    df.to_csv(output, index=False, encoding="utf-8-sig")

    print(df)
    print(f"\nRegistry saved to: {output}")


if __name__ == "__main__":
    build_snapshot_registry()