"""Moteur conversationnel premium RAN Intelligence — réponses flexibles style assistant IA."""

from __future__ import annotations

import re
from typing import Any

from src.services.data_service import FilterContext, data_service

BRAND = "Guardian Copilot"
SUITE = "Guardian Nexus AI"
TAGLINE = "Ask. Analyze. Decide. Trust."

_GREETING = re.compile(
    r"^(bonjour|bonsoir|salut|coucou|hello|hi|hey|good\s+(morning|afternoon|evening)|bon\s+jour)\b",
    re.I,
)
_THANKS = re.compile(r"\b(merci|thank(s| you)|thx|parfait|super|génial|excellent|ok\s+merci)\b", re.I)
_HELP = re.compile(
    r"\b(aide|help|comment\s+utiliser|que\s+peux|que\s+pouvez|what\s+can\s+you|capabilities|fonctionnalités)\b",
    re.I,
)
_IDENTITY = re.compile(
    r"\b(qui\s+es|who\s+are\s+you|présente|present\s+yourself|ton\s+nom|your\s+name)\b",
    re.I,
)
_IDENTITY_SUBJECT = re.compile(
    r"\b(copilot|assistant|bot|toi|you|ran\s+guardian|guardian\s+copilot|guardian\s+nexus|nexus\s+ai)\b",
    re.I,
)
_DOMAIN_TOPIC = re.compile(
    r"\b(ran|radio|network|réseau|reseau|lte|4g|5g|3g|nokia|huawei|bbmod|rmod|snapshot|"
    r"anomal|cellule|cell|antenna|antenne|baseband|core|telecom|télécom|mobile|"
    r"access|acces|inventory|inventaire|equipment|équipement|equipement)\b",
    re.I,
)
_FOLLOW_UP = re.compile(
    r"^(et\s+|also\s+|plus\s+|encore\s+|continue|explique|détail|detail|pourquoi|why|how\s+about|concernant)",
    re.I,
)
_DATA_OPS = re.compile(
    r"\b(sites?\s+critiques?|anomal|delta|remplacement|qualit|rapport|kpi|rca|noc|inventaire|"
    r"compteur|spares?|snapshot|équipement|equipement|equipment|top\s+\d+|liste\s+des|"
    r"critical\s+sites?|generate\s+a\s+report|weekly|hebdom)\b",
    re.I,
)
_KNOWLEDGE = re.compile(
    r"\b(c'est\s+quoi|qu'est[\-\s]?ce|what\s+is|what\s+are|explain|explique|défin|define|"
    r"comment\s+(fonctionne|marche)|how\s+does|radio\s+access|\bran\b|lte|4g|5g|nokia|huawei|"
    r"telecom|télécom|network|reseau|réseau|bbmod|rmod|vswr|antenne|antenna)\b",
    re.I,
)


def should_auto_web_search(question: str) -> bool:
    q = (question or "").strip()
    if len(q) < 8:
        return False
    if _DATA_OPS.search(q):
        return False
    return bool(_KNOWLEDGE.search(q))


def _is_identity_question(question: str) -> bool:
    q = (question or "").strip()
    if not q:
        return False
    if _IDENTITY.search(q):
        return True
    if re.search(r"\b(c'est\s+quoi|what\s+is|what\s+are)\b", q, re.I):
        if _IDENTITY_SUBJECT.search(q):
            return True
        if _DOMAIN_TOPIC.search(q):
            return False
        return False
    return False


def _is_french(ctx: FilterContext) -> bool:
    return (ctx.language or "Français").lower().startswith("fr")


def _flexible_suggestions(fr: bool) -> list[str]:
    if fr:
        return [
            "Quels sont les sites critiques aujourd'hui ?",
            "Génère un rapport NOC pour la période sélectionnée.",
            "RCA du site — remplace par un site_id réel",
            "Top 10 des sites avec le plus de remplacements.",
            "Résume la qualité réseau et les anomalies actives.",
        ]
    return [
        "Which sites are critical today?",
        "Generate a NOC report for the selected period.",
        "RCA for site — replace with a real site_id",
        "Top 10 sites with the most replacements.",
        "Summarize network quality and active anomalies.",
    ]


def _context_line(ctx: FilterContext, fr: bool) -> str:
    dates = sorted(ctx.effective_dates or ctx.selected_dates or [])
    vendor = (ctx.vendor or "nokia").upper()
    if not dates:
        scope = "tous les snapshots disponibles" if fr else "all available snapshots"
    elif len(dates) == 1:
        scope = f"snapshot **{dates[0]}**" if fr else f"snapshot **{dates[0]}**"
    else:
        scope = f"période **{dates[0]} → {dates[-1]}** ({len(dates)} dates)" if fr else (
            f"period **{dates[0]} → {dates[-1]}** ({len(dates)} dates)"
        )
    sites = ctx.selected_sites or []
    if sites:
        site_hint = f" · {len(sites)} site(s) ciblé(s)" if fr else f" · {len(sites)} targeted site(s)"
    else:
        site_hint = ""
    return f"**Contexte actif** : {vendor} · {scope}{site_hint}"


def _history_tail(history: list[dict[str, Any]], limit: int = 8) -> list[dict[str, Any]]:
    cleaned = [m for m in history if m.get("role") in {"user", "assistant"} and str(m.get("content", "")).strip()]
    return cleaned[-limit:]


def _last_user_question(history: list[dict[str, Any]]) -> str:
    for msg in reversed(history):
        if msg.get("role") == "user":
            return str(msg.get("content", "")).strip()
    return ""


def _expand_question(question: str, history: list[dict[str, Any]]) -> str:
    q = question.strip()
    if len(q) > 40 or not history:
        return q
    prev = _last_user_question(history)
    if not prev:
        return q
    if _FOLLOW_UP.search(q) or len(q.split()) <= 4:
        return f"{prev} — {q}"
    return q


def _greeting_response(ctx: FilterContext, question: str) -> dict[str, Any]:
    fr = _is_french(ctx)
    hour_greet = "Bonjour" if fr else "Hello"
    if re.search(r"bonsoir|evening|afternoon", question, re.I):
        hour_greet = "Bonsoir" if fr else "Good evening"

    message = (
        f"{hour_greet} ! Je suis **{BRAND}**, votre assistant intelligent pour l'analyse du réseau d'accès radio.\n\n"
        f"{_context_line(ctx, fr)}\n\n"
        "Je peux vous aider de manière **flexible** :\n"
        "- répondre en langage naturel à vos questions réseau ;\n"
        "- explorer sites, équipements, qualité, delta et tendances ;\n"
        "- analyser des fichiers XML/CSV/images que vous joignez ;\n"
        "- clarifier, reformuler ou approfondir un sujet déjà abordé.\n\n"
        "Dites-moi simplement ce qui vous intéresse — pas besoin de formuler comme une requête technique."
        if fr
        else (
            f"{hour_greet}! I'm **{BRAND}**, your intelligent assistant for radio access network analysis.\n\n"
            f"{_context_line(ctx, fr)}\n\n"
            "I can help **flexibly** by:\n"
            "- answering network questions in natural language;\n"
            "- exploring sites, equipment, quality, delta and trends;\n"
            "- analyzing attached XML/CSV/images;\n"
            "- clarifying or deepening topics from our conversation.\n\n"
            "Tell me what you're interested in — no rigid ops-style query required."
        )
    )
    return {
        "intent": "greeting",
        "message": message,
        "rows": [],
        "details": [],
        "sources": [],
        "suggested_questions": _flexible_suggestions(fr),
        "assistant_brand": BRAND,
    }


def _thanks_response(ctx: FilterContext) -> dict[str, Any]:
    fr = _is_french(ctx)
    message = (
        "Avec plaisir ! N'hésitez pas si vous souhaitez creuser un autre angle ou changer de sujet."
        if fr
        else "You're welcome! Feel free to explore another angle or switch topics anytime."
    )
    return {
        "intent": "thanks",
        "message": message,
        "rows": [],
        "details": [],
        "sources": [],
        "suggested_questions": _flexible_suggestions(fr),
        "assistant_brand": BRAND,
    }


def _help_response(ctx: FilterContext, openai_enabled: bool = False) -> dict[str, Any]:
    fr = _is_french(ctx)
    premium_block = (
        "\n\n**Mode premium OpenAI** activé — l'agent appelle des outils backend contrôlés "
        "(RCA site, rapport NOC, anomalies, qualité) sans accès direct au réseau."
        if openai_enabled and fr
        else (
            "\n\n**OpenAI premium mode** enabled — the agent calls controlled backend tools "
            "(site RCA, NOC report, anomalies, quality) without direct network access."
            if openai_enabled
            else ""
        )
    )
    message = (
        f"**{SUITE}** · *{TAGLINE}*\n\n"
        f"**{BRAND}** — modules premium disponibles :\n\n"
        "| Module | Capacité |\n"
        "|--------|----------|\n"
        "| **Web Intelligence** | Recherche web sourcée (normes, doc constructeur, définitions RAN) |\n"
        "| **Nexus Search** | Sites, inventaire, assets, compteurs, anomalies |\n"
        "| **Report Studio AI** | Rapports NOC, qualité, delta, exécutif |\n"
        "| **Risk Intelligence** | Scoring risques & anomalies |\n\n"
        "**Pièces jointes** : XML Nokia, CSV, JSON, captures d'écran, photos — analyse automatique.\n"
        "**Recherche web** : activez le globe via **+** ou posez une question de connaissance (ex. « qu'est-ce qu'un RAN ? »).\n"
        f"{premium_block}\n\n"
        f"{_context_line(ctx, fr)}\n\n"
        "Exemples : *Qu'est-ce qu'un RAN ?* · *Sites critiques cette semaine* · *Rapport NOC période active* · joindre un XML Nokia."
        if fr
        else (
            f"**{SUITE}** · *{TAGLINE}*\n\n"
            f"**{BRAND}** — premium modules:\n\n"
            "| Module | Capability |\n"
            "|--------|------------|\n"
            "| **Web Intelligence** | Sourced web research (standards, vendor docs, RAN definitions) |\n"
            "| **Nexus Search** | Sites, inventory, assets, counters, anomalies |\n"
            "| **Report Studio AI** | NOC, quality, delta, executive reports |\n"
            "| **Risk Intelligence** | Risk & anomaly scoring |\n\n"
            "**Attachments**: Nokia XML, CSV, JSON, screenshots, photos — automatic analysis.\n"
            "**Web search**: enable the globe via **+** or ask a knowledge question (e.g. “what is a RAN?”).\n"
            f"{premium_block}\n\n"
            f"{_context_line(ctx, fr)}\n\n"
            "Examples: *What is a RAN?* · *Critical sites this week* · *NOC report for active period* · attach Nokia XML."
        )
    )
    return {
        "intent": "help",
        "message": message,
        "rows": [],
        "details": [],
        "sources": [],
        "suggested_questions": _flexible_suggestions(fr),
        "assistant_brand": BRAND,
    }


def _identity_response(ctx: FilterContext) -> dict[str, Any]:
    fr = _is_french(ctx)
    message = (
        f"Je suis **{BRAND}**, le copilot IA de la suite **{SUITE}** — *{TAGLINE}*\n\n"
        "Je pilote vos données RAN avec un **jargon ops NOC/RAN imposé** "
        "(eNB/gNB, RRU, KPI, RCA, MO, delta, spares, anomalies) et m'appuie sur les modules de la suite :\n"
        "- **Nexus Search** — recherche intelligente (sites, inventaire, assets, compteurs)\n"
        "- **Web Intelligence** — recherche web sourcée\n"
        "- **Risk Intelligence Engine** — scoring risques & anomalies\n"
        "- **Report Studio AI** — génération de rapports NOC\n"
        "- **Guardian Trust Ledger** — traçabilité blockchain des décisions critiques\n\n"
        f"{_context_line(ctx, fr)}"
        if fr
        else (
            f"I'm **{BRAND}**, the AI copilot of the **{SUITE}** suite — *{TAGLINE}*\n\n"
            "I drive your RAN data with **imposed NOC/RAN ops jargon** "
            "(eNB/gNB, RRU, KPI, RCA, MO, delta, spares, anomalies) and leverage the suite modules:\n"
            "- **Nexus Search** — smart search (sites, inventory, assets, counters)\n"
            "- **Web Intelligence** — sourced web research\n"
            "- **Risk Intelligence Engine** — risk & anomaly scoring\n"
            "- **Report Studio AI** — NOC report generation\n"
            "- **Guardian Trust Ledger** — blockchain traceability of critical decisions\n\n"
            f"{_context_line(ctx, fr)}"
        )
    )
    return {
        "intent": "identity",
        "message": message,
        "rows": [],
        "details": [],
        "sources": [],
        "suggested_questions": _flexible_suggestions(fr),
        "assistant_brand": BRAND,
    }


def _general_discovery(ctx: FilterContext, question: str) -> dict[str, Any]:
    fr = _is_french(ctx)
    q = question.strip()
    intro = (
        f"Voici comment je peux vous aider avec **{BRAND}** sur votre question."
        if fr
        else f"Here's how **{BRAND}** can help with your question."
    )
    if q:
        intro = (
            f"J'ai bien noté : « {q} ».\n\n"
            "Je n'ai pas encore de jeu de données précis pour cette formulation, mais voici des pistes utiles :"
            if fr
            else (
                f"I noted: “{q}”.\n\n"
                "I don't have an exact dataset match for this wording yet, but here are useful directions:"
            )
        )

    message = (
        f"{intro}\n\n"
        f"{_context_line(ctx, fr)}\n\n"
        "**Pistes d'exploration**\n"
        "- État qualité et complétude des inventaires\n"
        "- Évolution entre snapshots (delta)\n"
        "- Sites, technologies (2G/3G/4G/5G), versions logicielles\n"
        "- Remplacements et anomalies serials\n"
        "- Prévisions spares et cartes à risque\n\n"
        "Reformulez en langage NOC/RAN ou joignez un export (XML/CSV) — réponses en jargon ops imposé."
        if fr
        else (
            f"{intro}\n\n"
            f"{_context_line(ctx, fr)}\n\n"
            "**Exploration paths**\n"
            "- Quality state and inventory completeness\n"
            "- Snapshot evolution (delta)\n"
            "- Sites, technologies (2G/3G/4G/5G), software versions\n"
            "- Replacements and serial anomalies\n"
            "- Spares forecasts and risk cards\n\n"
            "Rephrase in NOC/RAN terms or attach an export (XML/CSV) — answers use imposed ops jargon."
        )
    )
    return {
        "intent": "discovery",
        "message": message,
        "rows": [],
        "details": [],
        "sources": [],
        "suggested_questions": _flexible_suggestions(fr),
        "assistant_brand": BRAND,
    }


def _narrate_data_insight(ctx: FilterContext, question: str, raw: dict[str, Any]) -> dict[str, Any]:
    from src.services.report_prompt_utils import is_expert_report_prompt

    existing = str(raw.get("message") or "").strip()
    if is_expert_report_prompt(question) or existing.startswith("## ") or "\n## " in existing:
        result = dict(raw)
        result["message"] = existing if ("## " in existing) else ""
        result["suggested_questions"] = raw.get("suggested_questions") or _flexible_suggestions(_is_french(ctx))
        result["assistant_brand"] = BRAND
        return result

    fr = _is_french(ctx)
    intent = str(raw.get("intent") or "insight")
    rows = raw.get("rows") or []
    row_count = len(rows) if isinstance(rows, list) else 0
    brief = str(raw.get("message") or "").strip()

    parts: list[str] = []

    if question.strip():
        parts.append(
            f"**Votre question** : {question.strip()}" if fr else f"**Your question**: {question.strip()}"
        )

    parts.append(_context_line(ctx, fr))

    if brief and intent not in {"general_ops"}:
        parts.append(f"**Synthèse** : {brief}" if fr else f"**Summary**: {brief}")

    if row_count:
        parts.append(
            f"**Données** : {row_count} ligne(s) extraite(s) du lake pour répondre précisément."
            if fr
            else f"**Data**: {row_count} row(s) pulled from the lake to answer precisely."
        )
        sample = rows[:3] if isinstance(rows, list) else []
        if sample:
            highlights: list[str] = []
            for row in sample:
                if not isinstance(row, dict):
                    continue
                site = row.get("site_id") or row.get("site_name")
                if site:
                    highlights.append(f"- Site **{site}**")
                    continue
                obj = row.get("object_type")
                if obj:
                    highlights.append(f"- Type **{obj}**")
            if highlights:
                parts.append(
                    ("**Aperçu**\n" if fr else "**Preview**\n") + "\n".join(highlights[:3])
                )

    interpretation = _interpret_intent(intent, raw, fr)
    if interpretation:
        parts.append(interpretation)

    parts.append(
        "_Réponse générée par RAN Intelligence à partir des données filtrées. "
        "Affinez avec une question de suivi ou changez les filtres latéraux._"
        if fr
        else "_Response generated by RAN Intelligence from filtered data. "
        "Refine with a follow-up or adjust sidebar filters._"
    )

    result = dict(raw)
    result["message"] = "\n\n".join(parts)
    result["suggested_questions"] = raw.get("suggested_questions") or _flexible_suggestions(fr)
    result["assistant_brand"] = BRAND
    if intent == "general_ops":
        result["intent"] = "discovery"
    return result


def _interpret_intent(intent: str, raw: dict[str, Any], fr: bool) -> str:
    summary = raw.get("summary") if isinstance(raw.get("summary"), dict) else {}
    if intent == "quality_summary":
        score = summary.get("network_quality_score", raw.get("status"))
        if fr:
            return (
                f"**Interprétation** : le score qualité reflète complétude et cohérence des inventaires. "
                f"Un score ≥ 90 est sain ; entre 75 et 90, surveillance renforcée ; en dessous, action corrective."
            )
        return (
            "**Interpretation**: the quality score reflects inventory completeness and consistency. "
            "≥ 90 is healthy; 75–90 warrants monitoring; below that, corrective action."
        )
    if intent == "delta_compare":
        if fr:
            return "**Interprétation** : le delta met en évidence ce qui a bougé entre deux snapshots — utile pour prioriser les visites site ou audits."
        return "**Interpretation**: delta highlights what changed between snapshots — useful to prioritize site visits or audits."
    if intent.startswith("ops_"):
        if fr:
            return "**Interprétation** : ces résultats proviennent d'agrégations sur le lake RAN. Vous pouvez demander un zoom sur un site ou une autre région."
        return "**Interpretation**: these results come from RAN lake aggregations. Ask for a zoom on a site or another region."
    return ""


class AssistantIntelligenceService:
    def classify(self, question: str, history: list[dict[str, Any]] | None = None) -> str:
        q = (question or "").strip()
        if not q:
            return "help"
        if _GREETING.search(q):
            return "greeting"
        if _THANKS.search(q) and len(q.split()) <= 8:
            return "thanks"
        if _is_identity_question(q):
            return "identity"
        if _HELP.search(q):
            return "help"
        if history and (_FOLLOW_UP.search(q) or len(q) < 25):
            return "follow_up"
        return "data"

    def compose(
        self,
        ctx: FilterContext,
        question: str,
        history: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        from src.services.openai_agent_service import openai_agent_service

        history = _history_tail(history or [])
        q = (question or "").strip()
        kind = self.classify(q, history)

        if kind == "greeting":
            result = _greeting_response(ctx, q)
            return self._attach_engine_meta(result, openai_agent_service)
        if kind == "thanks":
            result = _thanks_response(ctx)
            return self._attach_engine_meta(result, openai_agent_service)
        if kind == "identity":
            result = _identity_response(ctx)
            return self._attach_engine_meta(result, openai_agent_service)
        if kind == "help" or not q:
            result = _help_response(ctx, openai_agent_service.is_enabled())
            return self._attach_engine_meta(result, openai_agent_service)

        effective_question = _expand_question(q, history) if kind == "follow_up" else q

        if should_auto_web_search(effective_question):
            knowledge = self._try_web_knowledge(ctx, effective_question)
            if knowledge:
                return self._attach_engine_meta(knowledge, openai_agent_service)

        claude_result = self._try_claude_rag(ctx, effective_question)
        if claude_result:
            return self._attach_engine_meta(claude_result, openai_agent_service)

        if openai_agent_service.is_enabled():
            premium = openai_agent_service.run(ctx, effective_question, history)
            if premium and not premium.get("fallback"):
                return premium

        raw = data_service.get_assistant_insight(ctx, effective_question)

        if raw.get("intent") == "general_ops" and kind != "follow_up":
            knowledge = self._try_web_knowledge(ctx, effective_question)
            if knowledge:
                return self._attach_engine_meta(knowledge, openai_agent_service)
            result = _general_discovery(ctx, q)
            return self._attach_engine_meta(result, openai_agent_service)

        result = _narrate_data_insight(ctx, effective_question, raw)
        return self._attach_engine_meta(result, openai_agent_service)

    def _try_web_knowledge(self, ctx: FilterContext, question: str) -> dict[str, Any] | None:
        """Answer general-knowledge questions with a sourced, ChatGPT-style synthesis."""
        from src.services.web_search_service import web_search_service

        q = (question or "").strip()
        if len(q) < 4:
            return None

        try:
            payload = web_search_service.search(q, language=ctx.language or "Français")
        except Exception:
            return None

        if not payload or payload.get("status") != "ok":
            return None

        results = payload.get("results") or []
        abstract = str(payload.get("abstract") or "").strip()
        if not abstract and not results:
            return None

        fr = _is_french(ctx)
        corrected = str(payload.get("corrected_query") or payload.get("search_query") or q).strip()
        original = str(payload.get("query") or q).strip()
        topic = corrected or q

        bullets: list[str] = []
        for index, row in enumerate(results[:5], start=1):
            snippet = str(row.get("snippet") or row.get("title") or "").strip()
            if snippet:
                bullets.append(f"- **[{index}]** {snippet[:200]}")

        if fr:
            parts = [
                "## Résumé\n"
                + (abstract or f"Synthèse sur **{topic}** d’après les sources consultées.")
            ]
            if bullets:
                parts.append("## Points clés\n" + "\n".join(bullets))
            if corrected and corrected.lower() != original.lower():
                parts.append(f"*Requête corrigée : {corrected}*")
            parts.append("Sources vérifiables listées ci-dessous.")
        else:
            parts = [
                "## Summary\n"
                + (abstract or f"Summary about **{topic}** from consulted sources.")
            ]
            if bullets:
                parts.append("## Key points\n" + "\n".join(bullets))
            if corrected and corrected.lower() != original.lower():
                parts.append(f"*Corrected query: {corrected}*")
            parts.append("Verifiable sources listed below.")

        return {
            "intent": "web_enriched",
            "message": "\n\n".join(parts),
            "rows": [],
            "details": [],
            "sources": [{"type": "web", **row} for row in results],
            "web_search_enabled": True,
            "web_search_meta": web_search_service.build_meta(payload),
            "suggested_questions": _flexible_suggestions(fr),
            "assistant_brand": BRAND,
            "ai_engine": "web_local",
            "architecture": "web_research_fallback",
        }

    def _try_claude_rag(self, ctx: FilterContext, question: str) -> dict[str, Any] | None:
        from src.services.claude_agent_service import claude_agent_service
        from src.services.rag_service import rag_service

        if not claude_agent_service.is_enabled():
            return None
        q_lower = question.lower()
        if not any(
            token in q_lower
            for token in ("procédure", "procedure", "document", "huawei", "nokia", "vswr", "alarme", "alarm", "noc", "rapport")
        ):
            return None

        rag_service.seed_defaults()
        hits = rag_service.search(question, vendor=ctx.vendor or "nokia", top_k=6).get("results") or []
        if not hits:
            return None

        answer = claude_agent_service.synthesize_rag_context(hits, question, ctx.language or "Français")
        if not answer:
            return None

        fr = _is_french(ctx)
        return {
            "intent": "claude_rag_procedures",
            "message": answer,
            "rows": [],
            "details": hits,
            "sources": [{"type": "rag", **h} for h in hits],
            "suggested_questions": _flexible_suggestions(fr),
            "assistant_brand": BRAND,
            "ai_engine": "claude",
            "ai_model": claude_agent_service.model,
            "architecture": "claude_rag_pgvector",
        }

    def _attach_engine_meta(self, result: dict[str, Any], openai_agent_service: Any) -> dict[str, Any]:
        if result.get("ai_engine"):
            return result
        status = openai_agent_service.status()
        result["ai_engine"] = status.get("engine", "local")
        result["architecture"] = status.get("architecture", "local_rules")
        if status.get("enabled"):
            result["ai_model_available"] = status.get("model")
        return result


assistant_intelligence_service = AssistantIntelligenceService()
