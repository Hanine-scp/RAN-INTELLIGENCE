import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
RAW_DATA_PATH = Path(os.getenv("DATA_XML_ROOT", str(REPO_ROOT / "DATA.XML")))
BRONZE_PATH = Path("data/bronze")
SILVER_PATH = Path("data/silver")
GOLD_PATH = Path("data/gold")
EXPORT_PATH = Path("exports")
