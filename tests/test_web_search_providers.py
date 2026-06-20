from src.services.web_search_providers import WebSearchProviderChain
from src.services.web_search_service import web_search_service


def test_web_search_status_exposes_compliance_architecture():
    status = web_search_service.status()
    assert "architecture" in status
    assert "providers" in status
    assert "fallback_chain" in status


def test_build_meta_includes_provider():
    meta = web_search_service.build_meta(
        {
            "status": "ok",
            "query": "ran",
            "provider": "wikipedia_api",
            "results": [{"title": "RAN", "url": "https://example.com", "snippet": "x"}],
        }
    )
    assert meta["provider"] == "wikipedia_api"
    assert meta["source_count"] == 1
    assert meta.get("searched_at")


def test_provider_chain_respects_mode(monkeypatch):
    chain = WebSearchProviderChain()
    chain.mode = "fallback"
    assert chain._ordered_names() == []
    chain.mode = "tavily"
    assert chain._ordered_names() == ["tavily"]
