"""Agent OpenAI premium — copilote RAN contrôlé via outils backend."""

from __future__ import annotations

import json
import os
import time
from typing import Any

from src.services import llm_client
from src.services.assistant_intelligence_service import BRAND, _flexible_suggestions, _is_french
from src.services.data_service import FilterContext
from src.services.ran_ai_tools import OPENAI_TOOL_DEFINITIONS, execute_ran_tool

MAX_TOOL_ROUNDS = 6
MAX_TOOL_RESULT_CHARS = 12000
# LLM local (Ollama sur CPU) : on borne fortement la boucle agentique et la
# longueur de génération pour éviter des temps de réponse de plusieurs minutes.
LOCAL_MAX_TOOL_ROUNDS = 2
LOCAL_MAX_TOKENS = 700
# Budget de temps global de la boucle agentique. Au-delà, on abandonne le LLM
# et on retombe sur le moteur de règles RAN (réponse instantanée et fondée sur
# les données) afin que l'interface ne reste jamais figée sur « Réflexion… ».
LOCAL_AGENT_BUDGET_SEC = 75.0
CLOUD_AGENT_BUDGET_SEC = 150.0


def _agent_budget_sec() -> float:
    default = LOCAL_AGENT_BUDGET_SEC if llm_client.local_llm_enabled() else CLOUD_AGENT_BUDGET_SEC
    try:
        return float(os.getenv("LLM_AGENT_BUDGET_SEC", "").strip() or default)
    except ValueError:
        return default


def _system_prompt(ctx: FilterContext, web_context: str = "") -> str:
    fr = _is_french(ctx)
    vendor = (ctx.vendor or "nokia").upper()
    dates = sorted(ctx.effective_dates or ctx.selected_dates or [])
    period = f"{dates[0]} → {dates[-1]}" if len(dates) >= 2 else (dates[0] if dates else "tous snapshots")

    web_section = ""
    if web_context.strip():
        cite_fr = (
            "\n- Cite les sources web avec des références inline [1], [2]… alignées sur la liste Sources.\n"
            "- Ne répète jamais les consignes ci-dessous.\n"
            "- Réponds directement à la question (pas de présentation du copilote)."
        )
        cite_en = (
            "\n- Cite web sources with inline references [1], [2]… matching the Sources list.\n"
            "- Never repeat the instructions below.\n"
            "- Answer the question directly (no copilot self-introduction)."
        )
        web_section = (
            f"\n\nContexte web externe vérifié :{cite_fr if fr else cite_en}\n{web_context.strip()}"
        )

    if fr:
        return f"""Tu es **{BRAND}**, le copilot IA premium de la suite **Guardian Nexus AI** pour opérateurs RAN (Nokia/Huawei). Devise : Ask. Analyze. Decide. Trust.

Architecture RAN Guardian (4 moteurs) :
- Data Integrity Engine : vérifie snapshot validé avant toute analyse IA.
- Change Intelligence Engine : change_events J-1/J avec replacement_score.
- Anomaly Intelligence Engine : règles + robust z-score + isolation forest avec preuves.
- Predictive Risk Engine : risques opérationnels J+1/J+3.
- Tu n'accèdes JAMAIS directement au réseau — appelle les outils (verify_snapshot_integrity, compare_snapshots, get_guardian_anomalies, get_risk_predictions, generate_noc_report…).
- Human-in-the-loop : recommande, ne modifie jamais le réseau automatiquement.

Routage intelligent des sources :
- Données réseau INTERNES (sites, anomalies, inventaire, snapshots, KPI, RCA, remplacements) → outils RAN dédiés.
- CONNAISSANCES GÉNÉRALES (définitions, concepts télécom, bonnes pratiques constructeur, actualités) → outil `search_web`.
- Procédures Nokia/Huawei documentées en interne → `search_vendor_procedures` (RAG).
- Tu peux combiner données internes ET web dans une même réponse, en citant clairement chaque source.

Contexte filtre actif : vendor={vendor}, période={period}.

Style de réponse premium (comme NOC expert) :
- Résumé clair en tête
- Impact opérationnel
- Cause probable + niveau de confiance si RCA
- Priorité (Haute/Moyenne/Faible)
- Actions recommandées numérotées
- Markdown lisible, jargon ops NOC/RAN imposé (KPI, RCA, RRU, MO, delta, anomalies, spares, eNB/gNB)

Pour une analyse site, structure :
Résumé / Impact / Cause probable / Priorité / Actions recommandées

Si données insuffisantes, dis-le et propose les filtres ou outils à utiliser.

Règle impérative : ne te présente jamais spontanément (pas de « Je suis Guardian Copilot… »). Réponds directement à la question.{web_section}"""
    return f"""You are **{BRAND}**, the premium AI copilot of the **Guardian Nexus AI** suite for RAN operators (Nokia/Huawei). Motto: Ask. Analyze. Decide. Trust.

Hybrid architecture:
- NEVER access the network directly.
- MUST call provided tools (get_site_status, generate_site_rca, generate_noc_report, etc.).
- A rules engine detects anomalies BEFORE your explanation.

Smart source routing:
- INTERNAL network data (sites, anomalies, inventory, snapshots, KPIs, RCA, replacements) → dedicated RAN tools.
- GENERAL knowledge (definitions, telecom concepts, vendor best practices, news) → `search_web` tool.
- Internal Nokia/Huawei documented procedures → `search_vendor_procedures` (RAG).
- You may combine internal data AND web in a single answer, clearly citing each source.

Active filter context: vendor={vendor}, period={period}.

Premium response style (NOC expert):
- Clear summary first
- Operational impact
- Probable cause + confidence for RCA
- Priority (High/Medium/Low)
- Numbered recommended actions
- Readable markdown, imposed NOC/RAN ops jargon (KPI, RCA, RRU, MO, delta, anomalies, spares, eNB/gNB)

For site analysis use: Summary / Impact / Probable cause / Priority / Recommended actions.

If data is insufficient, state it and suggest filters or tools.

Hard rule: never introduce yourself unprompted (no « I am Guardian Copilot… »). Answer the question directly.{web_section}"""


class OpenAIAgentService:
    @property
    def model(self) -> str:
        return llm_client.chat_model()

    @property
    def provider(self) -> str:
        return llm_client.provider_name()

    def is_enabled(self) -> bool:
        return llm_client.llm_enabled()

    def status(self) -> dict[str, Any]:
        from src.services.claude_agent_service import claude_agent_service
        from src.services.web_search_service import web_search_service

        llm_status = llm_client.status()
        return {
            "enabled": self.is_enabled(),
            "engine": llm_status["provider"] if self.is_enabled() else "local",
            "model": self.model if self.is_enabled() else None,
            "brand": BRAND,
            "tools": [t["function"]["name"] for t in OPENAI_TOOL_DEFINITIONS],
            "architecture": (
                "hybrid_azure_openai_tools" if llm_client.azure_enabled()
                else "hybrid_local_llm_tools" if llm_client.local_llm_enabled()
                else "hybrid_openai_tools"
            ),
            "data_residency": llm_status["data_residency"],
            "claude": claude_agent_service.status(),
            "rag": {"engine": "sqlite_pgvector", "procedures": "nokia_huawei"},
            "timeseries": {"engine": "timescaledb", "metrics": ["CSSR", "DCR", "HOSR", "PRB_UTIL", "AVAILABILITY"]},
            "web_search": web_search_service.status(),
            "compliance": {
                "llm": {
                    "provider": llm_status["provider"],
                    "integration": (
                        "azure_openai_api" if llm_client.azure_enabled()
                        else "local_self_hosted" if llm_client.local_llm_enabled()
                        else "official_chat_completions_api"
                    ),
                    "model": self.model if self.is_enabled() else None,
                    "data_residency": llm_status["data_residency"],
                    "note": (
                        "Azure OpenAI — données traitées dans votre tenant Azure, jamais utilisées pour l'entraînement."
                        if llm_client.azure_enabled()
                        else "LLM auto-hébergé (Ollama) — aucune donnée ne quitte votre infrastructure."
                        if llm_client.local_llm_enabled()
                        else "Aucun code ChatGPT embarqué — communication via clé API OpenAI."
                    ),
                },
                "interface": {
                    "product": "Guardian Nexus AI",
                    "owner": "RAN Intelligence",
                    "note": "Interface propriétaire Next.js — messages affichés par votre plateforme.",
                },
                "web_research": {
                    "integration": "search_api_agents",
                    "note": "Recherche web via APIs (Tavily/Serper/Brave) + repli encyclopédique.",
                },
            },
        }

    def _chat(self, messages: list[dict[str, Any]], use_tools: bool = True) -> dict[str, Any]:
        max_tokens = LOCAL_MAX_TOKENS if llm_client.local_llm_enabled() else None
        return llm_client.chat_completion(
            messages,
            tools=OPENAI_TOOL_DEFINITIONS if use_tools else None,
            tool_choice="auto" if use_tools else None,
            temperature=0.35,
            max_tokens=max_tokens,
        )

    def _serialize_tool_result(self, result: dict[str, Any]) -> str:
        text = json.dumps(result, ensure_ascii=False, default=str)
        if len(text) > MAX_TOOL_RESULT_CHARS:
            text = text[:MAX_TOOL_RESULT_CHARS] + "…[truncated]"
        return text

    def run(
        self,
        ctx: FilterContext,
        question: str,
        history: list[dict[str, Any]] | None = None,
        web_context: str = "",
    ) -> dict[str, Any] | None:
        if not self.is_enabled():
            return None

        fr = _is_french(ctx)
        messages: list[dict[str, Any]] = [{"role": "system", "content": _system_prompt(ctx, web_context=web_context)}]

        for turn in (history or [])[-10:]:
            role = turn.get("role")
            content = str(turn.get("content") or "").strip()
            if role in {"user", "assistant"} and content:
                messages.append({"role": role, "content": content[:4000]})

        messages.append({"role": "user", "content": question.strip()})

        tools_used: list[str] = []
        collected_rows: list[dict[str, Any]] = []
        collected_details: list[dict[str, Any]] = []
        intent = "openai_agent"

        max_rounds = LOCAL_MAX_TOOL_ROUNDS if llm_client.local_llm_enabled() else MAX_TOOL_ROUNDS
        started_at = time.monotonic()
        budget = _agent_budget_sec()

        try:
            for _ in range(max_rounds):
                # Repli rapide si le LLM local est trop lent : on renonce et le
                # service appelant bascule sur le moteur de règles RAN.
                if time.monotonic() - started_at > budget:
                    return None
                data = self._chat(messages, use_tools=True)
                choice = (data.get("choices") or [{}])[0]
                message = choice.get("message") or {}
                tool_calls = message.get("tool_calls") or []

                if not tool_calls:
                    content = str(message.get("content") or "").strip()
                    if not content:
                        return None
                    return {
                        "intent": intent,
                        "message": content,
                        "rows": collected_rows[:30],
                        "details": collected_details[:20],
                        "sources": [{"type": "openai_tool", "tool": name} for name in tools_used],
                        "suggested_questions": _flexible_suggestions(fr),
                        "assistant_brand": BRAND,
                        "ai_engine": "openai",
                        "ai_model": self.model,
                        "tools_used": tools_used,
                        "architecture": "hybrid_openai_tools",
                    }

                messages.append(message)
                for call in tool_calls:
                    fn = call.get("function") or {}
                    tool_name = str(fn.get("name") or "")
                    raw_args = fn.get("arguments") or "{}"
                    tools_used.append(tool_name)
                    intent = f"openai_{tool_name}"

                    result = execute_ran_tool(ctx, tool_name, raw_args)
                    if isinstance(result.get("rows"), list):
                        collected_rows.extend(result["rows"])
                    if isinstance(result.get("comparison"), list):
                        collected_rows.extend(result["comparison"])
                    if tool_name == "generate_site_rca":
                        collected_details.append(result)

                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": call.get("id"),
                            "content": self._serialize_tool_result(result),
                        }
                    )

            # Final synthesis without tools
            data = self._chat(messages, use_tools=False)
            choice = (data.get("choices") or [{}])[0]
            content = str((choice.get("message") or {}).get("content") or "").strip()
            if not content:
                return None
            return {
                "intent": intent,
                "message": content,
                "rows": collected_rows[:30],
                "details": collected_details[:20],
                "sources": [{"type": "openai_tool", "tool": name} for name in tools_used],
                "suggested_questions": _flexible_suggestions(fr),
                "assistant_brand": BRAND,
                "ai_engine": "openai",
                "ai_model": self.model,
                "tools_used": tools_used,
                "architecture": "hybrid_openai_tools",
            }
        except Exception as exc:
            return {
                "intent": "openai_fallback",
                "message": (
                    f"⚠️ OpenAI temporairement indisponible ({exc}). Bascule sur le moteur local RAN Intelligence."
                    if fr
                    else f"⚠️ OpenAI temporarily unavailable ({exc}). Falling back to local RAN Intelligence engine."
                ),
                "rows": [],
                "details": [],
                "sources": [],
                "ai_engine": "openai_error",
                "fallback": True,
            }


openai_agent_service = OpenAIAgentService()
