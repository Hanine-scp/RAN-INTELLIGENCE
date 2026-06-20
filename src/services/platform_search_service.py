"""Recherche intelligente locale — Sites, Assets, Compteurs, Inventaire."""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from src.services.data_service import FilterContext, data_service

_SYNONYMS: dict[str, list[str]] = {
    "site": ["emplacement", "station", "ran", "radio", "cellule", "cell"],
    "inventaire": ["liste", "catalogue", "referentiel", "stock", "equipements", "inventory"],
    "asset": ["actif", "ressource", "patrimoine", "equipement", "distribution"],
    "compteur": ["kpi", "indicateur", "mesure", "performance", "statistique", "counter"],
    "anomalie": ["incident", "erreur", "defaut", "probleme", "alerte"],
    "risque": ["criticite", "danger", "impact", "priorite"],
    "serial": ["serie", "sn", "numero"],
    "bbmod": ["baseband", "carte"],
    "rmod": ["radio", "remote"],
}

_TYPE_SYNONYMS: dict[str, list[str]] = {
    "Site": ["site", "station", "ran", "radio", "cellule"],
    "Asset": ["asset", "actif", "patrimoine", "equipement", "distribution"],
    "Compteur": ["compteur", "counter", "kpi", "indicateur", "performance"],
    "Inventaire": ["inventaire", "inventory", "liste", "detail", "serial"],
}


def normalize_text(text: str) -> str:
    value = unicodedata.normalize("NFD", (text or "").lower())
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = re.sub(r"[^\w\s]", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def expand_query(query: str) -> list[str]:
    words = [w for w in normalize_text(query).split() if w]
    expanded: set[str] = set(words)
    for word in words:
        if word in _SYNONYMS:
            expanded.update(_SYNONYMS[word])
        for key, synonyms in _SYNONYMS.items():
            if word in synonyms or word == key:
                expanded.add(key)
                expanded.update(synonyms)
    return sorted(expanded)


def _score_item(
    type_label: str,
    title: str,
    description: str,
    keywords: list[str],
    query_words: list[str],
) -> int:
    searchable = normalize_text(f"{type_label} {title} {description} {' '.join(keywords)}")
    score = 0
    for word in query_words:
        if not word:
            continue
        if word in normalize_text(type_label):
            score += 25
        if word in normalize_text(title):
            score += 20
        if word in searchable:
            score += 10
        for keyword in keywords:
            normalized_keyword = normalize_text(keyword)
            if word in normalized_keyword or normalized_keyword in word:
                score += 15
    return score


def _type_matches(type_label: str, query_words: list[str]) -> bool:
    synonyms = _TYPE_SYNONYMS.get(type_label, [])
    normalized_type = normalize_text(type_label)
    return any(word in normalized_type or word in synonyms for word in query_words)


class PlatformSearchService:
    def search(self, ctx: FilterContext, query: str, *, max_results: int = 12) -> dict[str, Any]:
        raw = (query or "").strip()
        if not raw:
            return {"query": raw, "expanded_terms": [], "results": [], "status": "empty"}

        query_words = expand_query(raw)
        candidates: list[dict[str, Any]] = []

        site_page = data_service.get_sites_page_v2(ctx, page=1, page_size=20, search=raw)
        for row in site_page.get("rows") or []:
            site_id = str(row.get("site_id") or "—")
            site_name = str(row.get("site_name") or "—")
            title = f"{site_id} · {site_name}"
            description = (
                f"Snapshot {row.get('snapshot_date')} · État {row.get('site_state')} · "
                f"{row.get('technologies') or 'technologies N/A'}"
            )
            keywords = [site_id, site_name, "site", "ran", str(row.get("technologies") or "")]
            score = _score_item("Site", title, description, keywords, query_words)
            if score > 0 or _type_matches("Site", query_words):
                candidates.append(
                    {
                        "type": "Site",
                        "title": title,
                        "description": description,
                        "score": score or 5,
                        "href": "/?view=sites",
                        "meta": {"site_id": site_id, "snapshot_date": row.get("snapshot_date")},
                    }
                )

        inventory = data_service.get_inventory_page_v2(ctx, page=1, page_size=20, search=raw)
        for row in inventory.get("rows") or []:
            site_id = str(row.get("site_id") or "—")
            object_type = str(row.get("object_type") or "—")
            serial = str(row.get("serial_number") or "—")
            title = f"{object_type} · {site_id}"
            description = (
                f"Série {serial} · Code {row.get('product_code') or '—'} · "
                f"{row.get('product_name') or '—'}"
            )
            keywords = [site_id, object_type, serial, str(row.get("product_code") or ""), "inventaire"]
            score = _score_item("Inventaire", title, description, keywords, query_words)
            if score > 0 or _type_matches("Inventaire", query_words):
                candidates.append(
                    {
                        "type": "Inventaire",
                        "title": title,
                        "description": description,
                        "score": score or 5,
                        "href": "/?view=inventaire",
                        "meta": {"site_id": site_id, "object_type": object_type},
                    }
                )

        assets = data_service.get_asset_distribution_page_v2(ctx, page=1, page_size=20, search=raw)
        for row in assets.get("rows") or []:
            site_id = str(row.get("site_id") or "—")
            object_type = str(row.get("object_type") or "—")
            count = row.get("equipment_count") or row.get("nb_equipment") or 0
            title = f"{object_type} · {site_id}"
            description = f"Patrimoine asset · {count} unité(s) sur le site"
            keywords = [site_id, object_type, "asset", "patrimoine", "distribution"]
            score = _score_item("Asset", title, description, keywords, query_words)
            if score > 0 or _type_matches("Asset", query_words):
                candidates.append(
                    {
                        "type": "Asset",
                        "title": title,
                        "description": description,
                        "score": score or 5,
                        "href": "/?view=assets",
                        "meta": {"site_id": site_id, "object_type": object_type},
                    }
                )

        counters = data_service.get_global_counters_page(ctx)
        for row in counters.get("rows") or []:
            object_type = str(row.get("object_type") or "—")
            if raw and normalize_text(raw) not in normalize_text(object_type):
                if not any(word in normalize_text(object_type) for word in query_words):
                    continue
            raw_records = int(row.get("raw_records") or 0)
            quality = row.get("quality_rate")
            title = f"Compteur {object_type}"
            description = f"{raw_records} enregistrements · Qualité série {quality}%"
            keywords = [object_type, "compteur", "counter", "kpi", "performance"]
            score = _score_item("Compteur", title, description, keywords, query_words)
            if score > 0 or _type_matches("Compteur", query_words):
                candidates.append(
                    {
                        "type": "Compteur",
                        "title": title,
                        "description": description,
                        "score": score or 5,
                        "href": "/?view=compteurs",
                        "meta": {"object_type": object_type},
                    }
                )

        ranked = sorted(candidates, key=lambda item: int(item.get("score") or 0), reverse=True)
        unique: list[dict[str, Any]] = []
        seen: set[str] = set()
        for item in ranked:
            key = f"{item['type']}|{item['title']}"
            if key in seen:
                continue
            seen.add(key)
            unique.append({k: v for k, v in item.items() if k != "score"})
            if len(unique) >= max_results:
                break

        return {
            "query": raw,
            "expanded_terms": query_words,
            "results": unique,
            "status": "ok" if unique else "no_results",
        }


platform_search_service = PlatformSearchService()
