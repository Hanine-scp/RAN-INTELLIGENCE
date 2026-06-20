"""Canonical placeholders for missing parsed XML field values."""

from __future__ import annotations

from typing import Any

MISSING_VALUE_EN = "Not available"
MISSING_VALUE_FR = "Valeur manquante"
MISSING_VALUE = MISSING_VALUE_EN

MISSING_VALUE_MARKERS: frozenset[str] = frozenset(
    {
        MISSING_VALUE_EN,
        MISSING_VALUE_FR,
        "N/A",
        "n/a",
    }
)


def is_missing_parsed_value(value: Any) -> bool:
    if value is None:
        return True
    try:
        import pandas as pd

        if pd.isna(value):
            return True
    except Exception:
        pass
    text = str(value).strip()
    return not text or text in MISSING_VALUE_MARKERS


def resolve_parsed_value(value: Any) -> str:
    if is_missing_parsed_value(value):
        return MISSING_VALUE
    return str(value).strip()


def duckdb_field_is_missing(column: str) -> str:
    """SQL fragment: true when a parsed text field is empty or a missing marker."""
    trimmed = f"TRIM(CAST({column} AS VARCHAR))"
    parts = [f"{column} IS NULL", f"{trimmed} = ''"]
    for marker in sorted(MISSING_VALUE_MARKERS):
        parts.append(f"{trimmed} = '{marker}'")
    return "(" + " OR ".join(parts) + ")"


def finalize_equipment_field_values(df):
    import pandas as pd

    if df is None or df.empty:
        return df

    df = df.copy()
    for col in ("serial_number", "product_code", "product_name"):
        if col in df.columns:
            df[col] = df[col].map(resolve_parsed_value)
    return df
