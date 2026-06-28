"""Fournisseurs de recherche web via API (usage légal — pas de scraping ChatGPT)."""

from __future__ import annotations

import os
from typing import Any

import requests

USER_AGENT = "RAN-Guardian-Copilot/1.0 (enterprise; +https://ran-intelligence.local)"


def _lang_code(language: str) -> str:
    return "fr" if (language or "").startswith("Fr") else "en"


class SearxngSearchProvider:
    """Métamoteur auto-hébergé (SearXNG) — aucune API tierce, egress maîtrisé."""

    def __init__(self) -> None:
        self.base_url = os.getenv("SEARXNG_URL", "").strip().rstrip("/")

    def is_enabled(self) -> bool:
        return bool(self.base_url)

    def search(self, query: str, max_results: int = 6, language: str = "Français") -> dict[str, Any] | None:
        if not self.is_enabled():
            return None
        try:
            response = requests.get(
                f"{self.base_url}/search",
                params={
                    "q": query,
                    "format": "json",
                    "language": _lang_code(language),
                    "safesearch": 1,
                },
                timeout=12,
                headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            )
            response.raise_for_status()
            data = response.json()
        except Exception:
            return None

        results: list[dict[str, str]] = []
        for row in data.get("results") or []:
            url = str(row.get("url") or "").strip()
            title = str(row.get("title") or "").strip()
            snippet = str(row.get("content") or "").strip()
            if url or title:
                results.append({"title": title[:160], "url": url, "snippet": snippet[:280]})
            if len(results) >= max_results:
                break

        abstract = ""
        answers = data.get("answers") or []
        if isinstance(answers, list) and answers:
            abstract = str(answers[0]).strip()
        if not abstract:
            infoboxes = data.get("infoboxes") or []
            if isinstance(infoboxes, list) and infoboxes and isinstance(infoboxes[0], dict):
                abstract = str(infoboxes[0].get("content") or "").strip()

        if not results and not abstract:
            return None
        return {"results": results, "abstract": abstract, "provider": "searxng_local"}


class TavilySearchProvider:
    def __init__(self) -> None:
        self.api_key = os.getenv("TAVILY_API_KEY", "").strip()

    def is_enabled(self) -> bool:
        return bool(self.api_key)

    def search(self, query: str, max_results: int = 6, language: str = "Français") -> dict[str, Any] | None:
        if not self.is_enabled():
            return None
        try:
            response = requests.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": self.api_key,
                    "query": query,
                    "search_depth": os.getenv("TAVILY_SEARCH_DEPTH", "basic"),
                    "max_results": max_results,
                    "include_answer": True,
                },
                timeout=12,
                headers={"User-Agent": USER_AGENT},
            )
            response.raise_for_status()
            data = response.json()
        except Exception:
            return None

        results: list[dict[str, str]] = []
        for row in data.get("results") or []:
            url = str(row.get("url") or "").strip()
            title = str(row.get("title") or "").strip()
            snippet = str(row.get("content") or row.get("snippet") or "").strip()
            if url or title:
                results.append({"title": title[:160], "url": url, "snippet": snippet[:280]})
            if len(results) >= max_results:
                break

        abstract = str(data.get("answer") or "").strip()
        if not results and not abstract:
            return None
        return {"results": results, "abstract": abstract, "provider": "tavily_api"}


class SerperSearchProvider:
    def __init__(self) -> None:
        self.api_key = os.getenv("SERPER_API_KEY", "").strip()

    def is_enabled(self) -> bool:
        return bool(self.api_key)

    def search(self, query: str, max_results: int = 6, language: str = "Français") -> dict[str, Any] | None:
        if not self.is_enabled():
            return None
        try:
            response = requests.post(
                "https://google.serper.dev/search",
                json={"q": query, "num": max_results, "gl": _lang_code(language), "hl": _lang_code(language)},
                timeout=12,
                headers={"X-API-KEY": self.api_key, "User-Agent": USER_AGENT},
            )
            response.raise_for_status()
            data = response.json()
        except Exception:
            return None

        results: list[dict[str, str]] = []
        for row in data.get("organic") or []:
            results.append(
                {
                    "title": str(row.get("title") or "")[:160],
                    "url": str(row.get("link") or ""),
                    "snippet": str(row.get("snippet") or "")[:280],
                }
            )
            if len(results) >= max_results:
                break

        abstract = ""
        kg = data.get("knowledgeGraph") or {}
        if isinstance(kg, dict):
            abstract = str(kg.get("description") or "").strip()

        if not results and not abstract:
            return None
        return {"results": results, "abstract": abstract, "provider": "serper_api"}


class BraveSearchProvider:
    def __init__(self) -> None:
        self.api_key = os.getenv("BRAVE_SEARCH_API_KEY", "").strip()

    def is_enabled(self) -> bool:
        return bool(self.api_key)

    def search(self, query: str, max_results: int = 6, language: str = "Français") -> dict[str, Any] | None:
        if not self.is_enabled():
            return None
        try:
            response = requests.get(
                "https://api.search.brave.com/res/v1/web/search",
                params={"q": query, "count": max_results, "search_lang": _lang_code(language)},
                timeout=12,
                headers={"X-Subscription-Token": self.api_key, "Accept": "application/json", "User-Agent": USER_AGENT},
            )
            response.raise_for_status()
            data = response.json()
        except Exception:
            return None

        results: list[dict[str, str]] = []
        for row in (data.get("web") or {}).get("results") or []:
            results.append(
                {
                    "title": str(row.get("title") or "")[:160],
                    "url": str(row.get("url") or ""),
                    "snippet": str(row.get("description") or "")[:280],
                }
            )
            if len(results) >= max_results:
                break

        abstract = results[0]["snippet"] if results else ""
        if not results:
            return None
        return {"results": results, "abstract": abstract, "provider": "brave_api"}


class WebSearchProviderChain:
    """Chaîne de moteurs API professionnels, puis repli encyclopédique."""

    def __init__(self) -> None:
        self.mode = os.getenv("WEB_SEARCH_PROVIDER", "auto").strip().lower()
        self.providers: dict[str, Any] = {
            "searxng": SearxngSearchProvider(),
            "tavily": TavilySearchProvider(),
            "serper": SerperSearchProvider(),
            "brave": BraveSearchProvider(),
        }

    def configured_providers(self) -> dict[str, bool]:
        return {name: provider.is_enabled() for name, provider in self.providers.items()}

    def _ordered_names(self) -> list[str]:
        if self.mode in self.providers:
            return [self.mode]
        if self.mode == "fallback":
            return []
        return ["searxng", "tavily", "serper", "brave"]

    def search(self, query: str, max_results: int = 6, language: str = "Français") -> dict[str, Any] | None:
        for name in self._ordered_names():
            provider = self.providers[name]
            if not provider.is_enabled():
                continue
            payload = provider.search(query, max_results=max_results, language=language)
            if payload and (payload.get("results") or payload.get("abstract")):
                payload["provider_name"] = name
                return payload
        return None

    def status(self) -> dict[str, Any]:
        configured = self.configured_providers()
        active = next((name for name, ok in configured.items() if ok), None)
        return {
            "mode": self.mode,
            "api_configured": any(configured.values()),
            "active_api_provider": active,
            "providers": configured,
            "fallback_chain": ["wikipedia", "duckduckgo"],
            "legal_note": "Recherche via APIs tierces autorisées — aucun accès au produit ChatGPT.",
        }


web_search_provider_chain = WebSearchProviderChain()
