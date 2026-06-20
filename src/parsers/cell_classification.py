"""Nokia XML managedObject class → radio technology cell bucket."""

from __future__ import annotations

from typing import Optional


def classify_cell(class_name: Optional[str]) -> Optional[str]:
    if not class_name:
        return None

    c = str(class_name).strip()
    c_lower = c.lower()

    if c == "com.nokia.srbts.gsm:GNCEL":
        return "2G"

    if c == "com.nokia.srbts.wcdma:WNCEL":
        return "3G"

    if c == "com.nokia.srbts.nrbts:NRCELL":
        return "5G"

    if c_lower == "noklte:lncel":
        return "LTE_GENERIC"

    if c_lower == "noklte:lncel_fdd":
        return "LTE_FDD"

    if c_lower == "noklte:lncel_tdd":
        return "LTE_TDD"

    return None
