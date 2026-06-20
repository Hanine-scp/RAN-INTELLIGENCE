import os
from pathlib import Path

RAW_DATA_PATH = Path(os.getenv("DATA_XML_ROOT", r"C:\projects\DATA.XML"))
BRONZE_PATH = Path("data/bronze")
SILVER_PATH = Path("data/silver")
GOLD_PATH = Path("data/gold")
EXPORT_PATH = Path("exports")
