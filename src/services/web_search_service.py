"""Recherche web légère pour enrichir l'assistant IA."""

from __future__ import annotations

import html
import re
import unicodedata
from datetime import datetime, timezone
from difflib import get_close_matches
from typing import Any
from urllib.parse import parse_qs, quote, unquote, urlparse

import requests

from src.services.web_search_providers import web_search_provider_chain

_TELECOM_TYPO_MAP: dict[str, str] = {
    "acssess": "access",
    "accesss": "access",
    "acces": "access",
    "accese": "access",
    "accesss": "access",
    "networkk": "network",
    "netwrok": "network",
    "netowrk": "network",
    "netwrk": "network",
    "netowork": "network",
    "reseau": "réseau",
    "rezeau": "réseau",
    "antenas": "antenna",
    "antenne": "antenne",
    "tehcnologie": "technologie",
    "technolgie": "technologie",
    "equipement": "équipement",
    "equipments": "equipment",
    "replacment": "replacement",
    "remplacement": "remplacement",
    "anomalie": "anomalie",
    "anomali": "anomalie",
    "snapchot": "snapshot",
    "snapchots": "snapshots",
    "inventaire": "inventaire",
    "inventairee": "inventaire",
    "cellule": "cellule",
    "celull": "cellule",
    "serial": "serial",
    "seriel": "serial",
    "serials": "serials",
}

_GLOSSARY: set[str] = {
    "radio",
    "access",
    "network",
    "ran",
    "nokia",
    "huawei",
    "lte",
    "5g",
    "4g",
    "3g",
    "2g",
    "réseau",
    "reseau",
    "antenna",
    "antenne",
    "cellule",
    "cell",
    "site",
    "sites",
    "bbmod",
    "rmod",
    "serial",
    "snapshot",
    "snapshots",
    "equipment",
    "équipement",
    "equipement",
    "inventory",
    "inventaire",
    "anomaly",
    "anomalie",
    "replacement",
    "remplacement",
    "technology",
    "technologie",
    "telecom",
    "télécom",
    "mobile",
    "baseband",
    "antenna",
    "core",
    "noc",
    "patrimoine",
    "spares",
    "delta",
    "guardian",
}


class WebSearchService:
    def status(self) -> dict[str, Any]:
        chain = web_search_provider_chain.status()
        return {
            **chain,
            "architecture": "openai_api + proprietary_ui + search_api_chain",
        }

    def search(self, query: str, max_results: int = 6, language: str = "Français") -> dict[str, Any]:
        raw = (query or "").strip()
        if not raw:
            return {"query": "", "abstract": "", "results": [], "status": "empty"}

        normalized = self._normalize_query(raw, language)
        candidates = self._query_candidates(raw, normalized, language)

        for candidate in candidates:
            payload = self._execute_search(candidate, max_results=max_results, language=language)
            if payload.get("status") == "ok":
                payload["query"] = raw
                payload["search_query"] = candidate
                payload["corrected_query"] = candidate if candidate != raw else normalized if normalized != raw else None
                return payload

        return {
            "query": raw,
            "search_query": candidates[0] if candidates else normalized or raw,
            "corrected_query": normalized if normalized != raw else None,
            "abstract": "",
            "results": [],
            "status": "no_results",
        }

    @staticmethod
    def _strip_accents(value: str) -> str:
        normalized = unicodedata.normalize("NFKD", value or "")
        return "".join(ch for ch in normalized if not unicodedata.combining(ch))

    def _normalize_query(self, query: str, language: str) -> str:
        q = re.sub(r"\s+", " ", (query or "").strip())
        q = re.sub(r"[^\w\s\-+'/?.,:;éèêëàâäùûüôöîïçÉÈÊËÀÂÄÙÛÜÔÖÎÏÇ]", " ", q, flags=re.UNICODE)
        q = re.sub(r"\s+", " ", q).strip()

        if language == "Français":
            q = re.sub(
                r"\s+(quoi|qu['’]est[\-\s]ce|c['’]est quoi|c est quoi|s['’]il te plait|stp)\s*[?.!]*\s*$",
                "",
                q,
                flags=re.IGNORECASE,
            )
            q = re.sub(r"^(qu['’]est[\-\s]ce que|c['’]est quoi|c est quoi)\s+", "", q, flags=re.IGNORECASE)
        else:
            q = re.sub(r"\s+(what is it|what is|please)\s*[?.!]*\s*$", "", q, flags=re.IGNORECASE)
            q = re.sub(r"^(what is|what's|tell me about)\s+", "", q, flags=re.IGNORECASE)

        words = []
        for token in q.split():
            lower = token.lower()
            if lower in _TELECOM_TYPO_MAP:
                words.append(_TELECOM_TYPO_MAP[lower])
                continue
            if len(lower) >= 4:
                match = get_close_matches(lower, _GLOSSARY, n=1, cutoff=0.84)
                if match:
                    words.append(match[0])
                    continue
            words.append(token)
        q = " ".join(words)
        q = re.sub(r"\bran\b", "RAN", q, flags=re.IGNORECASE)
        return q.strip(" ?.,!")

    def _query_candidates(self, raw: str, normalized: str, language: str) -> list[str]:
        candidates: list[str] = []

        def add(value: str) -> None:
            cleaned = re.sub(r"\s+", " ", (value or "").strip())
            if cleaned and cleaned not in candidates:
                candidates.append(cleaned)

        add(normalized)
        add(self._strip_accents(normalized))
        add(raw)

        wiki_hint = self._wikipedia_opensearch(normalized or raw, language)
        if wiki_hint:
            add(wiki_hint)

        lower = (normalized or raw).lower()
        if re.search(r"\b(ran|radio|réseau|reseau)\b", lower):
            if "radio access network" not in lower:
                add(f"{normalized} radio access network".strip())
            if language == "Français" and "réseau d'accès radio" not in lower:
                add("réseau d'accès radio RAN")

        return candidates

    @staticmethod
    def _wikipedia_opensearch(query: str, language: str) -> str:
        lang = "fr" if language == "Français" else "en"
        try:
            response = requests.get(
                f"https://{lang}.wikipedia.org/w/api.php",
                params={"action": "opensearch", "search": query, "limit": 1, "namespace": 0, "format": "json"},
                timeout=6,
                headers={"User-Agent": "RAN-Intelligence/1.0 (NOC assistant)"},
            )
            response.raise_for_status()
            titles = response.json()[1] if isinstance(response.json(), list) else []
            return str(titles[0]).strip() if titles else ""
        except Exception:
            return ""

    def _execute_search(self, query: str, max_results: int = 6, language: str = "Français") -> dict[str, Any]:
        q = (query or "").strip()
        if not q:
            return {"query": q, "abstract": "", "results": [], "status": "empty"}

        results: list[dict[str, str]] = []
        abstract = ""
        error: str | None = None
        provider = "wikipedia_duckduckgo"

        api_payload = web_search_provider_chain.search(q, max_results=max_results, language=language)
        if api_payload:
            results = list(api_payload.get("results") or [])
            abstract = str(api_payload.get("abstract") or "").strip()
            provider = str(api_payload.get("provider") or api_payload.get("provider_name") or "search_api")

        if not results:
            wiki_results, wiki_abstract = self._search_wikipedia(q, max_results=max_results, language=language)
            if wiki_results:
                results.extend(wiki_results)
                abstract = abstract or wiki_abstract
                if provider == "wikipedia_duckduckgo":
                    provider = "wikipedia_api"

        if len(results) < max_results:
            html_results, html_abstract = self._search_html(q, max_results=max_results)
            for row in html_results:
                normalized = self._normalize_result_row(row)
                if normalized["url"] and not any(r.get("url") == normalized["url"] for r in results):
                    results.append(normalized)
                if len(results) >= max_results:
                    break
            if not abstract and html_abstract:
                abstract = html_abstract

        if len(results) < max_results or not abstract:
            try:
                response = requests.get(
                    "https://api.duckduckgo.com/",
                    params={"q": q, "format": "json", "no_html": 1, "skip_disambig": 1},
                    timeout=8,
                    headers={"User-Agent": "RAN-Intelligence/1.0"},
                )
                response.raise_for_status()
                data = response.json()
                if not abstract:
                    abstract = str(data.get("AbstractText") or data.get("Answer") or "").strip()
                for row in self._parse_ddg_topics(data.get("RelatedTopics") or [], max_results):
                    normalized = self._normalize_result_row(row)
                    if normalized["url"] and not any(r.get("url") == normalized["url"] for r in results):
                        results.append(normalized)
                    if len(results) >= max_results:
                        break
            except Exception as exc:
                error = str(exc)

        results = results[:max_results]
        if error and not abstract and not results:
            return {"query": q, "abstract": "", "results": [], "status": "error", "error": error}

        return {
            "query": q,
            "abstract": abstract,
            "results": results,
            "provider": provider,
            "status": "ok" if abstract or results else "no_results",
        }

    @staticmethod
    def _parse_ddg_topics(items: list[Any], max_results: int) -> list[dict[str, str]]:
        results: list[dict[str, str]] = []
        for item in items[: max_results * 2]:
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
        return results

    def _search_html(self, query: str, max_results: int = 6) -> tuple[list[dict[str, str]], str]:
        try:
            response = requests.post(
                "https://html.duckduckgo.com/html/",
                data={"q": query, "b": "", "kl": "wt-wt"},
                timeout=10,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                    ),
                    "Accept": "text/html,application/xhtml+xml",
                },
            )
            if response.status_code != 200 or "result__a" not in response.text:
                return [], ""
            page = response.text
        except Exception:
            return [], ""

        results: list[dict[str, str]] = []
        link_pattern = re.compile(r'class="result__a"\s+href="([^"]+)">(.*?)</a>', re.IGNORECASE | re.DOTALL)
        snippet_pattern = re.compile(
            r'class="result__snippet"[^>]*>(.*?)</(?:a|td|div|span)>',
            re.IGNORECASE | re.DOTALL,
        )

        links = link_pattern.findall(page)
        snippets = snippet_pattern.findall(page)

        for idx, (raw_url, raw_title) in enumerate(links):
            if len(results) >= max_results:
                break
            title = self._clean_html(raw_title)
            if not title:
                continue
            url = self._normalize_result_url(raw_url)
            snippet_raw = snippets[idx] if idx < len(snippets) else title
            snippet = self._clean_html(snippet_raw) or title
            results.append({"title": title[:160], "url": url, "snippet": snippet[:280]})

        abstract = results[0]["snippet"] if results else ""
        return results, abstract

    def _search_wikipedia(self, query: str, max_results: int = 6, language: str = "Français") -> tuple[list[dict[str, str]], str]:
        lang = "fr" if language == "Français" else "en"
        try:
            response = requests.get(
                f"https://{lang}.wikipedia.org/w/api.php",
                params={
                    "action": "query",
                    "list": "search",
                    "srsearch": query,
                    "srlimit": max_results,
                    "format": "json",
                    "utf8": 1,
                },
                timeout=10,
                headers={"User-Agent": "RAN-Intelligence/1.0 (NOC assistant)"},
            )
            response.raise_for_status()
            hits = response.json().get("query", {}).get("search") or []
        except Exception:
            return [], ""

        results: list[dict[str, str]] = []
        for item in hits:
            title = str(item.get("title") or "").strip()
            if not title:
                continue
            snippet = self._clean_html(str(item.get("snippet") or ""))
            url = f"https://{lang}.wikipedia.org/wiki/{quote(title.replace(' ', '_'))}"
            results.append({"title": title[:160], "url": url, "snippet": snippet[:280]})

        abstract = ""
        if results:
            abstract = self._fetch_wikipedia_extract(results[0]["title"], lang) or results[0]["snippet"]
        return results, abstract

    @staticmethod
    def _fetch_wikipedia_extract(title: str, lang: str) -> str:
        try:
            response = requests.get(
                f"https://{lang}.wikipedia.org/w/api.php",
                params={
                    "action": "query",
                    "prop": "extracts",
                    "exintro": 1,
                    "explaintext": 1,
                    "titles": title,
                    "format": "json",
                },
                timeout=8,
                headers={"User-Agent": "RAN-Intelligence/1.0 (NOC assistant)"},
            )
            response.raise_for_status()
            pages = response.json().get("query", {}).get("pages") or {}
            for page in pages.values():
                extract = str(page.get("extract") or "").strip()
                if extract:
                    return extract[:480]
        except Exception:
            return ""
        return ""

    @staticmethod
    def _clean_html(value: str) -> str:
        text = re.sub(r"<[^>]+>", " ", value or "")
        return html.unescape(re.sub(r"\s+", " ", text)).strip()

    @staticmethod
    def _upgrade_ddg_topic_url(url: str) -> str:
        parsed = urlparse(url or "")
        if "duckduckgo.com" not in (parsed.netloc or ""):
            return url
        if parsed.path.startswith("/l/"):
            return WebSearchService._normalize_result_url(url)
        topic = parsed.path.strip("/").split("/")[0]
        if topic and topic not in {"l", "html", "c"}:
            return f"https://en.wikipedia.org/wiki/{quote(topic.replace('_', ' '))}"
        return url

    def _normalize_result_row(self, row: dict[str, str]) -> dict[str, str]:
        url = self._upgrade_ddg_topic_url(self._normalize_result_url(str(row.get("url") or "")))
        title = str(row.get("title") or row.get("snippet") or "").strip()
        snippet = str(row.get("snippet") or title).strip()
        return {"title": title[:160], "url": url, "snippet": snippet[:280]}

    @staticmethod
    def _normalize_result_url(raw_url: str) -> str:
        url = (raw_url or "").strip()
        if url.startswith("//"):
            url = f"https:{url}"
        parsed = urlparse(url)
        if "duckduckgo.com" in parsed.netloc and parsed.path.startswith("/l/"):
            target = parse_qs(parsed.query).get("uddg", [""])[0]
            if target:
                return unquote(target)
        return url

    def format_for_assistant(self, payload: dict[str, Any], language: str = "Français") -> str:
        fr = language == "Français"
        if payload.get("status") == "error":
            return "Recherche web indisponible pour le moment." if fr else "Web search unavailable at the moment."
        if payload.get("status") in {"empty", "no_results"}:
            return (
                "Aucun résultat web pertinent trouvé pour cette requête."
                if fr
                else "No relevant web results found for this query."
            )

        corrected = str(payload.get("corrected_query") or payload.get("search_query") or "").strip()
        original = str(payload.get("query") or "").strip()
        lines = [f"**{'Recherche sur le Web' if fr else 'Web search'}** — `{original or corrected}`"]
        if corrected and corrected.lower() != original.lower():
            lines.append(
                f"**{'Requête corrigée' if fr else 'Corrected query'}** : `{corrected}`"
            )

        abstract = str(payload.get("abstract") or "").strip()
        if abstract:
            lines.append(f"\n**{'Synthèse' if fr else 'Summary'}**\n{abstract}")

        results = payload.get("results") or []
        if results:
            lines.append(f"\n**{'Sources' if fr else 'Sources'}**")
            for idx, row in enumerate(results, start=1):
                title = row.get("title") or row.get("snippet") or "—"
                url = row.get("url") or ""
                snippet = str(row.get("snippet") or "").strip()
                bullet = f"{idx}. **{title}**"
                if snippet and snippet != title:
                    bullet += f" — {snippet}"
                if url:
                    bullet += f"\n   {url}"
                lines.append(f"- {bullet}")

        return "\n".join(lines)

    def build_meta(self, payload: dict[str, Any] | None) -> dict[str, Any] | None:
        if not payload:
            return None
        results = payload.get("results") or []
        return {
            "status": payload.get("status"),
            "original_query": payload.get("query"),
            "search_query": payload.get("search_query"),
            "corrected_query": payload.get("corrected_query"),
            "abstract": payload.get("abstract") or "",
            "results": results,
            "provider": payload.get("provider"),
            "source_count": len(results),
            "searched_at": datetime.now(timezone.utc).isoformat(),
        }


web_search_service = WebSearchService()
