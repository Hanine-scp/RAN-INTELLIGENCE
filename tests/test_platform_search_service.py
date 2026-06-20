from src.services.platform_search_service import expand_query, normalize_text, platform_search_service
from src.services.data_service import FilterContext


def test_expand_query_adds_synonyms():
    terms = expand_query("compteur performance")
    assert "kpi" in terms or "indicateur" in terms


def test_normalize_text_strips_accents():
    assert normalize_text("Réseau Accès") == "reseau acces"


def test_platform_search_empty_query():
    ctx = FilterContext(
        vendor="nokia",
        language="Français",
        selected_dates=[],
        selected_files=[],
        selected_sites=[],
        selected_file_dates=[],
        effective_dates=[],
    )
    payload = platform_search_service.search(ctx, "")
    assert payload["status"] == "empty"
    assert payload["results"] == []
