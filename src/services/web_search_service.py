"""Recherche web légère pour enrichir l'assistant IA."""

from __future__ import annotations

from typing import Any

import requests


class WebSearchService:
    def search(self, query: str, max_results: int = 6) -> dict[str, Any]:
        q = (query or "").strip()
        if not q:
            return {"query": "", "abstract": "", "results": [], "status": "empty"}

        abstract = ""
        results: list[dict[str, str]] = []

        try:
            response = requests.get(
                "https://api.duckduckgo.com/",
                params={
                    "q": q,
                    "format": "json",
                    "no_html": 1,
                    "skip_disambig": 1,
                },
                timeout=10,
                headers={"User-Agent": "RAN-Intelligence/1.0"},
            )
            response.raise_for_status()
            data = response.json()
            abstract = str(data.get("AbstractText") or data.get("Answer") or "").strip()

            for item in data.get("RelatedTopics", [])[: max_results * 2]:
                if len(results) >= max_results:
                    break
                if isinstance(item, dict) and item.get("Text"):
                    results.append(
                        {
                            "title": str(item.get("Text", ""))[:160],
                            "url": str(item.get("FirstURL") or ""),
                            "snippet": str(item.get("Text", ""))[:280],
                        }
                    )
                elif isinstance(item, dict) and isinstance(item.get("Topics"), list):
                    for sub in item["Topics"]:
                        if len(results) >= max_results:
                            break
                        if isinstance(sub, dict) and sub.get("Text"):
                            results.append(
                                {
                                    "title": str(sub.get("Text", ""))[:160],
                                    "url": str(sub.get("FirstURL") or ""),
                                    "snippet": str(sub.get("Text", ""))[:280],
                                }
                            )
        except Exception as exc:
            return {"query": q, "abstract": "", "results": [], "status": "error", "error": str(exc)}

        return {
            "query": q,
            "abstract": abstract,
            "results": results,
            "status": "ok" if abstract or results else "no_results",
        }

    def format_for_assistant(self, payload: dict[str, Any], language: str = "Français") -> str:
        fr = language == "Français"
        if payload.get("status") == "error":
            return (
                "Recherche web indisponible pour le moment."
                if fr
                else "Web search unavailable at the moment."
            )
        if payload.get("status") in {"empty", "no_results"}:
            return (
                "Aucun résultat web pertinent trouvé pour cette requête."
                if fr
                else "No relevant web results found for this query."
            )

        lines = [
            f"**{'Recherche sur le Web' if fr else 'Web search'}** — `{payload.get('query', '')}`",
        ]
        abstract = str(payload.get("abstract") or "").strip()
        if abstract:
            lines.append(f"\n**{'Synthèse' if fr else 'Summary'}**\n{abstract}")

        results = payload.get("results") or []
        if results:
            lines.append(f"\n**{'Sources' if fr else 'Sources'}**")
            for idx, row in enumerate(results, start=1):
                title = row.get("title") or row.get("snippet") or "—"
                url = row.get("url") or ""
                bullet = f"{idx}. {title}"
                if url:
                    bullet += f" ({url})"
                lines.append(f"- {bullet}")

        return "\n".join(lines)


web_search_service = WebSearchService()
