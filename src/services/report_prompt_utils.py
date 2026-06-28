"""Détection des prompts structurés (rapports page Delta / Import / Guardian)."""

from __future__ import annotations

_REPORT_MARKERS = (
    "rédige un rapport",
    "write one expert",
    "réponds uniquement en markdown",
    "reply only in markdown",
    "genere le rapport",
    "generate the post-import report",
    "rapport expert delta",
    "expert ran delta report",
)


def is_expert_report_prompt(question: str) -> bool:
    q = (question or "").strip().lower()
    if not q:
        return False
    if not any(marker in q for marker in _REPORT_MARKERS):
        return False
    return "rapport" in q or "report" in q or "delta" in q
