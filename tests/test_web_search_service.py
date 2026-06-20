from src.services.web_search_service import web_search_service


def test_normalize_query_fixes_typo_and_trailing_quoi():
    normalized = web_search_service._normalize_query("radio acssess network quoi", "Français")
    assert normalized == "radio access network"


def test_normalize_query_fixes_netwrok_typo():
    normalized = web_search_service._normalize_query("netwrok acces radio", "Français")
    assert "network" in normalized
    assert "access" in normalized


def test_search_finds_results_for_ran_question():
    payload = web_search_service.search("radio acssess network quoi", language="Français", max_results=3)
    assert payload["status"] == "ok"
    assert payload.get("results")
    assert payload.get("corrected_query")


def test_format_shows_corrected_query():
    text = web_search_service.format_for_assistant(
        {
            "status": "ok",
            "query": "radio acssess network quoi",
            "corrected_query": "radio access network",
            "abstract": "Test abstract",
            "results": [{"title": "RAN", "url": "https://example.com", "snippet": "Snippet"}],
        },
        language="Français",
    )
    assert "Requête corrigée" in text
    assert "radio access network" in text


def test_format_no_results_message_fr():
    text = web_search_service.format_for_assistant({"status": "no_results"}, language="Français")
    assert "Aucun résultat web pertinent" in text
