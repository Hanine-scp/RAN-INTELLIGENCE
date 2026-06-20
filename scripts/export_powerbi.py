"""Manual Power BI export sync."""

from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.services.powerbi_export_service import powerbi_export_service


def main() -> int:
    result = powerbi_export_service.sync_export()
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
