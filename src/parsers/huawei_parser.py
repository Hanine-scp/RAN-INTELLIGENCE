"""Huawei RAN XML parser — scaffold for Phase 2 data delivery.

Same contract as Nokia parser; returns empty frames until Huawei exports are available.
"""

from __future__ import annotations

from typing import Any

import pandas as pd


def parse_huawei_snapshot(xml_files: list[str], snapshot_date: str) -> dict[str, pd.DataFrame]:
    """Parse Huawei snapshot XML files into lake-ready frames."""
    _ = xml_files
    _ = snapshot_date
    return {
        "sites": pd.DataFrame(),
        "equipment": pd.DataFrame(),
        "counters": pd.DataFrame(),
        "completeness": pd.DataFrame(),
    }


def huawei_parser_available() -> dict[str, Any]:
    return {
        "vendor": "huawei",
        "available": False,
        "message": "Huawei RAN data feed not connected yet. Platform scaffold is ready.",
    }
