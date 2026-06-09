"""Agent OpenAI premium — copilote RAN contrôlé via outils backend."""

from __future__ import annotations

import json
import os
from typing import Any

import requests

from src.services.assistant_intelligence_service import BRAND, _flexible_suggestions, _is_french
from src.services.data_service import FilterContext
from src.services.ran_ai_tools import OPENAI_TOOL_DEFINITIONS, execute_ran_tool

MAX_TOOL_ROUNDS = 6
MAX_TOOL_RESULT_CHARS = 12000


def _system_prompt(ctx: FilterContext) -> str:
    fr = _is_french(ctx)
    vendor = (ctx.vendor or "nokia").upper()
    dates = sorted(ctx.effective_dates or ctx.selected_dates or [])
    period = f"{dates[0]} → {dates[-1]}" if len(dates) >= 2 else (dates[0] if dates else "tous snapshots")

    if fr:
        return f"""Tu es **{BRAND}**, copilote IA premium pour opérateurs RAN (Nokia/Huawei).

Architecture hybride :
- Tu n'accèdes JAMAIS directement au réseau.
- Tu DOIS appeler les outils fournis (get_site_status, generate_site_rca, generate_noc_report, etc.).
- Un moteur de règles détecte les anomalies AVANT ton explication.

Contexte filtre actif : vendor={vendor}, période={period}.

Style de réponse premium (comme NOC expert) :
- Résumé clair en tête
- Impact opérationnel
- Cause probable + niveau de confiance si RCA
- Priorité (Haute/Moyenne/Faible)
- Actions recommandées numérotées
- Markdown lisible, pas de jargon ops rigide

Pour une analyse site, structure :
Résumé / Impact / Cause probable / Priorité / Actions recommandées

Si données insuffisantes, dis-le et propose les filtres ou outils à utiliser."""
    return f"""You are **{BRAND}**, a premium AI copilot for RAN operators (Nokia/Huawei).

Hybrid architecture:
- NEVER access the network directly.
- MUST call provided tools (get_site_status, generate_site_rca, generate_noc_report, etc.).
- A rules engine detects anomalies BEFORE your explanation.

Active filter context: vendor={vendor}, period={period}.

Premium response style (NOC expert):
- Clear summary first
- Operational impact
- Probable cause + confidence for RCA
- Priority (High/Medium/Low)
- Numbered recommended actions
- Readable markdown

For site analysis use: Summary / Impact / Probable cause / Priority / Recommended actions.

If data is insufficient, state it and suggest filters or tools."""


class OpenAIAgentService:
    def __init__(self) -> None:
        self.api_key = os.getenv("OPENAI_API_KEY", "").strip()
        self.model = os.getenv("OPENAI_MODEL", "gpt-4o").strip()
        self.base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        self.timeout = int(os.getenv("OPENAI_TIMEOUT_SEC", "90"))

    def is_enabled(self) -> bool:
        return bool(self.api_key)

    def status(self) -> dict[str, Any]:
        from src.services.claude_agent_service import claude_agent_service

        return {
            "enabled": self.is_enabled(),
            "engine": "openai" if self.is_enabled() else "local",
            "model": self.model if self.is_enabled() else None,
            "brand": BRAND,
            "tools": [t["function"]["name"] for t in OPENAI_TOOL_DEFINITIONS],
            "architecture": "hybrid_openai_tools",
            "claude": claude_agent_service.status(),
            "rag": {"engine": "pgvector", "procedures": "nokia_huawei"},
            "timeseries": {"engine": "timescaledb", "metrics": ["CSSR", "DCR", "HOSR", "PRB_UTIL", "AVAILABILITY"]},
        }

    def _chat(self, messages: list[dict[str, Any]], use_tools: bool = True) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.35,
        }
        if use_tools:
            payload["tools"] = OPENAI_TOOL_DEFINITIONS
            payload["tool_choice"] = "auto"

        response = requests.post(
            f"{self.base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=self.timeout,
        )
        if response.status_code >= 400:
            raise RuntimeError(f"OpenAI API error {response.status_code}: {response.text[:500]}")
        return response.json()

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
    ) -> dict[str, Any] | None:
        if not self.is_enabled():
            return None

        fr = _is_french(ctx)
        messages: list[dict[str, Any]] = [{"role": "system", "content": _system_prompt(ctx)}]

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

        try:
            for _ in range(MAX_TOOL_ROUNDS):
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
