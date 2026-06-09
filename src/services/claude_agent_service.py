"""Claude API — analyse de documents techniques longs (complément OpenAI)."""

from __future__ import annotations

import os
from typing import Any

import requests

BRAND = "RAN Intelligence"


class ClaudeAgentService:
    def __init__(self) -> None:
        self.api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
        self.model = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514").strip()
        self.base_url = os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com").rstrip("/")
        self.timeout = int(os.getenv("CLAUDE_TIMEOUT_SEC", "120"))
        self.long_doc_threshold = int(os.getenv("CLAUDE_LONG_DOC_CHARS", "3500"))

    def is_enabled(self) -> bool:
        return bool(self.api_key)

    def status(self) -> dict[str, Any]:
        return {
            "enabled": self.is_enabled(),
            "model": self.model if self.is_enabled() else None,
            "role": "long_document_analysis",
        }

    def should_use_for_content(self, content: str) -> bool:
        return self.is_enabled() and len(content or "") >= self.long_doc_threshold

    def analyze_long_document(
        self,
        document_text: str,
        question: str,
        language: str = "Français",
    ) -> str | None:
        if not self.is_enabled():
            return None

        fr = language.lower().startswith("fr")
        system = (
            f"Tu es {BRAND}, expert RAN Nokia/Huawei. Analyse ce document technique long "
            "et réponds de façon structurée : Résumé, Points clés, Risques, Actions recommandées."
            if fr
            else f"You are {BRAND}, Nokia/Huawei RAN expert. Analyze this long technical document "
            "with: Summary, Key points, Risks, Recommended actions."
        )
        user_content = (
            f"**Question** : {question}\n\n**Document** :\n{document_text[:120000]}"
            if fr
            else f"**Question**: {question}\n\n**Document**:\n{document_text[:120000]}"
        )

        try:
            response = requests.post(
                f"{self.base_url}/v1/messages",
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "max_tokens": 4096,
                    "system": system,
                    "messages": [{"role": "user", "content": user_content}],
                },
                timeout=self.timeout,
            )
            response.raise_for_status()
            payload = response.json()
            blocks = payload.get("content") or []
            texts = [str(b.get("text", "")) for b in blocks if b.get("type") == "text"]
            return "\n".join(texts).strip() or None
        except Exception:
            return None

    def synthesize_rag_context(
        self,
        rag_results: list[dict[str, Any]],
        question: str,
        language: str = "Français",
    ) -> str | None:
        if not rag_results:
            return None
        combined = "\n\n---\n\n".join(
            f"**{r.get('title')}** ({r.get('vendor')})\n{r.get('content')}" for r in rag_results[:8]
        )
        if not self.should_use_for_content(combined):
            return None
        return self.analyze_long_document(combined, question, language)


claude_agent_service = ClaudeAgentService()
