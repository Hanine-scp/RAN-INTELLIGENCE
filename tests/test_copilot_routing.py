from src.services.assistant_intelligence_service import (
    AssistantIntelligenceService,
    should_auto_web_search,
)
from src.services.assistant_file_service import assistant_file_service
from src.services.data_service import FilterContext


def test_should_auto_web_search_for_ran_definition():
    assert should_auto_web_search("Qu'est-ce qu'un RAN (radio access network) ?")


def test_should_not_auto_web_for_ops_query():
    assert not should_auto_web_search("Quels sites sont critiques cette semaine ?")


def test_compose_ran_question_uses_web_enriched():
    svc = AssistantIntelligenceService()
    ctx = FilterContext(
        vendor="nokia",
        language="Français",
        selected_dates=[],
        selected_files=[],
        selected_sites=[],
        selected_file_dates=[],
        effective_dates=[],
    )
    result = svc.compose(ctx, "Qu'est-ce qu'un RAN (radio access network) ?")
    assert result["intent"] == "web_enriched"
    assert "Résumé" in result["message"] or "radio" in result["message"].lower()
    assert result.get("sources")


def test_build_insight_auto_web_without_toggle():
    ctx = FilterContext(
        vendor="nokia",
        language="Français",
        selected_dates=[],
        selected_files=[],
        selected_sites=[],
        selected_file_dates=[],
        effective_dates=[],
    )
    result = assistant_file_service.build_insight(
        ctx,
        "Qu'est-ce qu'un RAN (radio access network) ?",
        [],
        web_search=False,
    )
    assert result.get("web_search_enabled") is True
    assert result["intent"] == "web_enriched"
