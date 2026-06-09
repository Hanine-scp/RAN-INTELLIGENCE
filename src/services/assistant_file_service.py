"""Analyse de fichiers joints pour l'assistant IA RAN."""

from __future__ import annotations

import json
import re
import tempfile
from collections import Counter
from io import BytesIO
from pathlib import Path
from typing import Any

import pandas as pd
from PIL import Image

from src.parsers.nokia_parser import parse_xml_file
from src.services.assistant_intelligence_service import assistant_intelligence_service
from src.services.openai_agent_service import openai_agent_service
from src.services.data_service import FilterContext, data_service
from src.services.web_search_service import web_search_service


def _quality_score(completeness: float, serial_quality: float, duplicate_penalty: int) -> float:
    base = completeness * 0.55 + serial_quality * 0.35
    return round(max(0.0, min(100.0, base - duplicate_penalty * 2)), 1)


def _analyze_nokia_xml(filename: str, content: bytes) -> dict[str, Any]:
    with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        parsed = parse_xml_file(xml_file=tmp_path)
    except Exception as exc:
        return {
            "filename": filename,
            "file_type": "xml",
            "status": "error",
            "error": str(exc),
            "message": f"Impossible de parser le XML Nokia : {exc}",
        }
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    site = parsed.get("site") or {}
    equipment = parsed.get("equipment") or []
    eq_df = pd.DataFrame(equipment) if equipment else pd.DataFrame()

    object_counts: dict[str, int] = {}
    empty_serials = 0
    empty_product = 0
    serials: list[str] = []
    duplicate_serials = 0

    if not eq_df.empty:
        if "object_type" in eq_df.columns:
            object_counts = eq_df["object_type"].fillna("UNKNOWN").astype(str).value_counts().to_dict()
        if "serial_number" in eq_df.columns:
            serial_series = eq_df["serial_number"].fillna("").astype(str).str.strip()
            empty_serials = int((serial_series == "").sum())
            serials = [s for s in serial_series.tolist() if s]
            serial_counts = Counter(serials)
            duplicate_serials = sum(count - 1 for count in serial_counts.values() if count > 1)
        if "product_code" in eq_df.columns:
            empty_product = int(eq_df["product_code"].fillna("").astype(str).str.strip().eq("").sum())

    total_eq = len(equipment)
    unique_serials = len(set(serials))
    serial_quality = round((unique_serials / total_eq) * 100, 1) if total_eq else 100.0
    completeness = round(((total_eq - empty_serials - empty_product) / total_eq) * 100, 1) if total_eq else 0.0
    quality_score = _quality_score(completeness, serial_quality, duplicate_serials)

    site_id = site.get("site_id") or "—"
    site_name = site.get("site_name") or "—"
    snapshot = site.get("snapshot_date") or site.get("xml_snapshot_date") or "—"
    site_state = site.get("site_state") or site.get("blocking_state") or "—"
    sw_version = site.get("sw_version") or "—"

    cells = {
        "2G": site.get("nb_cells_2g", 0),
        "3G": site.get("nb_cells_3g", 0),
        "4G_FDD": site.get("nb_cells_lte_fdd", 0),
        "4G_TDD": site.get("nb_cells_lte_tdd", 0),
        "5G": site.get("nb_cells_5g", 0),
    }

    top_types = sorted(object_counts.items(), key=lambda x: x[1], reverse=True)[:8]
    sample_rows = eq_df.head(12).to_dict(orient="records") if not eq_df.empty else []

    signals: list[str] = []
    if empty_serials > 0:
        signals.append(f"{empty_serials} équipement(s) sans numéro de série")
    if duplicate_serials > 0:
        signals.append(f"{duplicate_serials} serial(s) dupliqué(s) dans le fichier")
    if empty_product > 0:
        signals.append(f"{empty_product} ligne(s) sans product_code")
    if str(site_state).lower() in {"blocked", "bloqué"}:
        signals.append("Site en état bloqué")
    if quality_score < 75:
        signals.append(f"Score qualité fichier faible ({quality_score}/100)")

    narrative = (
        f"**Analyse XML Nokia — {filename}**\n\n"
        f"**Site** : {site_id} ({site_name})\n"
        f"**Snapshot** : {snapshot} · **État** : {site_state} · **SW** : {sw_version}\n\n"
        f"**Parc équipements** : {total_eq} lignes, {len(object_counts)} types distincts.\n"
        f"**Cellules** : 2G={cells['2G']}, 3G={cells['3G']}, 4G FDD={cells['4G_FDD']}, "
        f"4G TDD={cells['4G_TDD']}, 5G={cells['5G']}.\n\n"
        f"**Qualité données**\n"
        f"- Score global : **{quality_score}/100**\n"
        f"- Complétude champs : {completeness}%\n"
        f"- Qualité serials : {serial_quality}% ({unique_serials} uniques / {total_eq})\n"
        f"- Serials vides : {empty_serials} · Dupliqués : {duplicate_serials}\n"
        f"- Product codes manquants : {empty_product}\n\n"
    )
    if top_types:
        narrative += "**Top types équipement**\n" + "\n".join(f"- {t}: {c}" for t, c in top_types) + "\n\n"
    if signals:
        narrative += "**Signaux d'alerte**\n" + "\n".join(f"- ⚠ {s}" for s in signals) + "\n"
    else:
        narrative += "**Signaux** : aucune anomalie majeure détectée sur ce fichier.\n"

    return {
        "filename": filename,
        "file_type": "xml_nokia",
        "status": "ok",
        "vendor": "nokia",
        "site_id": site_id,
        "site_name": site_name,
        "snapshot_date": snapshot,
        "site_state": site_state,
        "sw_version": sw_version,
        "equipment_count": total_eq,
        "object_type_count": len(object_counts),
        "cells": cells,
        "quality_score": quality_score,
        "completeness_percent": completeness,
        "serial_quality_percent": serial_quality,
        "empty_serials": empty_serials,
        "duplicate_serials": duplicate_serials,
        "empty_product_codes": empty_product,
        "top_object_types": [{"object_type": t, "count": c} for t, c in top_types],
        "signals": signals,
        "message": narrative,
        "rows": sample_rows,
        "details": [
            {
                "metric": "quality_score",
                "value": quality_score,
                "level": "critical" if quality_score < 60 else "high" if quality_score < 80 else "ok",
            },
            {"metric": "equipment_count", "value": total_eq},
            {"metric": "duplicate_serials", "value": duplicate_serials},
        ],
    }


def _analyze_csv(filename: str, content: bytes) -> dict[str, Any]:
    try:
        df = pd.read_csv(BytesIO(content), nrows=5000)
    except Exception as exc:
        return {
            "filename": filename,
            "file_type": "csv",
            "status": "error",
            "error": str(exc),
            "message": f"CSV illisible : {exc}",
        }

    rows, cols = df.shape
    null_rates = (df.isna().mean() * 100).round(1).to_dict()
    high_null = {k: v for k, v in null_rates.items() if v > 20}
    dtypes = {col: str(dtype) for col, dtype in df.dtypes.items()}
    sample = df.head(10).to_dict(orient="records")

    narrative = (
        f"**Analyse CSV — {filename}**\n\n"
        f"**Dimensions** : {rows} lignes × {cols} colonnes.\n\n"
        f"**Colonnes** : {', '.join(df.columns.astype(str).tolist()[:20])}"
        f"{'…' if cols > 20 else ''}\n\n"
    )
    if high_null:
        narrative += "**Colonnes avec >20 % de valeurs manquantes**\n"
        narrative += "\n".join(f"- {k}: {v}%" for k, v in sorted(high_null.items(), key=lambda x: -x[1])[:10]) + "\n\n"
    else:
        narrative += "**Complétude** : bonne — aucune colonne critique au-dessus de 20 % de nulls.\n\n"

    return {
        "filename": filename,
        "file_type": "csv",
        "status": "ok",
        "row_count": rows,
        "column_count": cols,
        "null_rates": null_rates,
        "dtypes": dtypes,
        "message": narrative,
        "rows": sample,
        "details": [{"column": k, "null_pct": v} for k, v in sorted(null_rates.items(), key=lambda x: -x[1])[:15]],
    }


def _analyze_json(filename: str, content: bytes) -> dict[str, Any]:
    try:
        payload = json.loads(content.decode("utf-8", errors="replace"))
    except Exception as exc:
        return {
            "filename": filename,
            "file_type": "json",
            "status": "error",
            "error": str(exc),
            "message": f"JSON invalide : {exc}",
        }

    def _describe(obj: Any, depth: int = 0) -> str:
        if depth > 2:
            return type(obj).__name__
        if isinstance(obj, dict):
            keys = list(obj.keys())[:12]
            return "{" + ", ".join(f"{k}: {_describe(obj[k], depth + 1)}" for k in keys) + ("…" if len(obj) > 12 else "") + "}"
        if isinstance(obj, list):
            return f"list[{len(obj)}]"
        return type(obj).__name__

    narrative = f"**Analyse JSON — {filename}**\n\n**Structure** : {_describe(payload)}\n"
    rows: list[dict[str, Any]] = []
    if isinstance(payload, list) and payload and isinstance(payload[0], dict):
        rows = payload[:10]
    elif isinstance(payload, dict):
        rows = [payload]

    return {
        "filename": filename,
        "file_type": "json",
        "status": "ok",
        "message": narrative,
        "rows": rows[:10],
        "details": [],
    }


def _analyze_text(filename: str, content: bytes) -> dict[str, Any]:
    text = content.decode("utf-8", errors="replace")
    lines = text.splitlines()
    words = re.findall(r"\w+", text, flags=re.UNICODE)
    narrative = (
        f"**Analyse texte — {filename}**\n\n"
        f"**Volume** : {len(lines)} lignes, {len(words)} mots, {len(text)} caractères.\n"
    )
    preview = "\n".join(lines[:8])
    if preview:
        narrative += f"\n**Aperçu**\n```\n{preview}\n```\n"

    return {
        "filename": filename,
        "file_type": "text",
        "status": "ok",
        "line_count": len(lines),
        "word_count": len(words),
        "message": narrative,
        "rows": [],
        "details": [{"preview_line": line} for line in lines[:5]],
    }


def _analyze_image(filename: str, content: bytes, source_kind: str = "image") -> dict[str, Any]:
    try:
        img = Image.open(BytesIO(content))
        width, height = img.size
        mode = img.mode
        fmt = img.format or "UNKNOWN"
        megapixels = round((width * height) / 1_000_000, 2)
    except Exception as exc:
        return {
            "filename": filename,
            "file_type": source_kind,
            "status": "error",
            "error": str(exc),
            "message": f"Image illisible : {exc}",
        }

    kind_label = {
        "screenshot": "Capture d'écran",
        "camera": "Photo caméra",
        "image": "Image",
    }.get(source_kind, "Image")

    narrative = (
        f"**Analyse {kind_label} — {filename}**\n\n"
        f"**Résolution** : {width}×{height} px ({megapixels} Mpx)\n"
        f"**Format** : {fmt} · Mode couleur : {mode}\n"
        f"**Taille fichier** : {len(content) / 1024:.1f} KB\n\n"
        "Cette capture peut documenter un état réseau, un ticket, un dashboard ou un équipement.\n"
        "Croisez-la avec les données lake pour validation opérationnelle."
    )

    return {
        "filename": filename,
        "file_type": source_kind,
        "status": "ok",
        "width": width,
        "height": height,
        "format": fmt,
        "color_mode": mode,
        "message": narrative,
        "rows": [{"width": width, "height": height, "format": fmt, "size_kb": round(len(content) / 1024, 1)}],
        "details": [{"metric": "megapixels", "value": megapixels}],
    }


def analyze_uploaded_file(filename: str, content: bytes, vendor: str = "nokia") -> dict[str, Any]:
    name = (filename or "upload").lower()
    if name.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif")):
        source_kind = "screenshot" if "capture-ecran" in name else "camera" if name.startswith("photo-") else "image"
        return _analyze_image(filename, content, source_kind=source_kind)
    if name.endswith(".xml"):
        if vendor == "huawei":
            return {
                "filename": filename,
                "file_type": "xml_huawei",
                "status": "scaffold",
                "message": (
                    f"**Fichier Huawei — {filename}**\n\n"
                    "Le parser Huawei n'est pas encore connecté. "
                    "Le fichier est reçu ; l'analyse détaillée sera disponible à la livraison du flux Huawei."
                ),
                "rows": [],
                "details": [],
            }
        return _analyze_nokia_xml(filename, content)
    if name.endswith(".csv"):
        return _analyze_csv(filename, content)
    if name.endswith(".json"):
        return _analyze_json(filename, content)
    if name.endswith((".txt", ".log", ".md")):
        return _analyze_text(filename, content)
    return {
        "filename": filename,
        "file_type": "unknown",
        "status": "unsupported",
        "message": (
            f"**{filename}** — format non supporté pour l'analyse automatique. "
            "Formats acceptés : XML (Nokia), CSV, JSON, TXT."
        ),
        "rows": [],
        "details": [],
    }


class AssistantFileService:
    def build_insight(
        self,
        ctx: FilterContext,
        question: str,
        files: list[tuple[str, bytes]],
        web_search: bool = False,
        history: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        reports = [analyze_uploaded_file(name, data, vendor=ctx.vendor) for name, data in files]
        file_messages = [r.get("message", "") for r in reports if r.get("message")]
        all_rows: list[dict[str, Any]] = []
        all_details: list[dict[str, Any]] = []
        sources: list[dict[str, Any]] = []

        for report in reports:
            all_rows.extend(report.get("rows") or [])
            all_details.extend(report.get("details") or [])
            sources.append(
                {
                    "filename": report.get("filename"),
                    "file_type": report.get("file_type"),
                    "status": report.get("status"),
                    "quality_score": report.get("quality_score"),
                    "equipment_count": report.get("equipment_count"),
                }
            )

        q = (question or "").strip()
        if not q:
            q = "Analyse détaillée des fichiers joints avec focus qualité réseau."

        enriched_question = q
        if file_messages:
            enriched_question = f"{q}\n\n**Fichiers analysés :**\n" + "\n\n---\n\n".join(file_messages[:3])

        if openai_agent_service.is_enabled():
            premium = openai_agent_service.run(ctx, enriched_question, history)
            lake_insight = (
                premium
                if premium and not premium.get("fallback")
                else assistant_intelligence_service.compose(ctx, q, history)
            )
        else:
            lake_insight = assistant_intelligence_service.compose(ctx, q, history)

        combined_message = ""
        if file_messages and lake_insight.get("ai_engine") != "openai":
            combined_message = "\n\n---\n\n".join(file_messages)

        web_sources: list[dict[str, Any]] = []
        if web_search:
            web_payload = web_search_service.search(q)
            web_block = web_search_service.format_for_assistant(web_payload, language=ctx.language)
            if web_block:
                combined_message = f"{combined_message}\n\n---\n\n{web_block}" if combined_message else web_block
            web_sources = [{"type": "web", **row} for row in web_payload.get("results") or []]

        lake_msg = str(lake_insight.get("message") or "")
        if lake_insight.get("ai_engine") == "openai":
            combined_message = lake_msg
        elif lake_msg and lake_insight.get("intent") not in {"discovery", "greeting", "help", "thanks", "identity"}:
            combined_message = (
                f"{combined_message}\n\n---\n\n**Analyse réseau (filtres actifs)**\n{lake_msg}"
                if combined_message
                else lake_msg
            )
        elif not combined_message:
            combined_message = lake_msg or "Analyse terminée."

        merged_rows = (lake_insight.get("rows") or [])[:20] + all_rows[:30]
        merged_details = (lake_insight.get("details") or []) + all_details

        intent = lake_insight.get("intent", "discovery")
        if files:
            intent = "file_analysis"
        if web_search:
            intent = "web_enriched" if intent == "discovery" else f"{intent}+web"

        return {
            "intent": intent,
            "message": combined_message,
            "status": "ok" if all(r.get("status") != "error" for r in reports) else "warning",
            "rows": merged_rows,
            "details": merged_details,
            "sources": sources + web_sources + (lake_insight.get("sources") or []),
            "web_search_enabled": web_search,
            "file_reports": reports,
            "suggested_questions": lake_insight.get("suggested_questions") or [],
            "sql_guardrails": lake_insight.get("sql_guardrails"),
            "ai_engine": lake_insight.get("ai_engine"),
            "ai_model": lake_insight.get("ai_model"),
            "tools_used": lake_insight.get("tools_used") or [],
            "architecture": lake_insight.get("architecture"),
        }


assistant_file_service = AssistantFileService()
