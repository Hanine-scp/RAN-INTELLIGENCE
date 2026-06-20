from src.services.assistant_file_service import (
    _is_boilerplate_intro,
    _resolve_web_research_insight,
)
from src.services.data_service import FilterContext
from src.services.web_search_service import web_search_service


def test_boilerplate_intro_detects_identity():
    text = "Je suis **RAN Guardian Copilot**, l'assistant IA intégré à la plateforme d'analyse RAN."
    assert _is_boilerplate_intro(text)


def test_web_mode_never_returns_identity_template():
    ctx = FilterContext(
        vendor="nokia",
        language="Français",
        selected_dates=[],
        selected_files=[],
        selected_sites=[],
        selected_file_dates=[],
        effective_dates=[],
    )
    question = "explique moi c'est quoi ran radio access network"
    payload = web_search_service.search(question, language="Français", max_results=3)
    block = web_search_service.format_for_assistant(payload, language="Français")
    insight = _resolve_web_research_insight(ctx, question, [], payload, block)
    assert insight["intent"] == "web_enriched"
    assert not _is_boilerplate_intro(insight["message"])
    assert "Résumé" in insight["message"] or "radio" in insight["message"].lower()
