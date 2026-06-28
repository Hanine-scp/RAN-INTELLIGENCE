"""Client LLM unifié — OpenAI public OU Azure OpenAI (données dans votre tenant).

Le provider est détecté automatiquement via les variables d'environnement :
- Si AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY sont définis → Azure OpenAI.
- Sinon si OPENAI_API_KEY est défini → OpenAI public.
- Sinon → désactivé (l'app retombe sur le moteur local de règles).

Azure et OpenAI exposent la même API "chat/completions" et "embeddings" ; seuls
l'URL et l'en-tête d'authentification diffèrent, ce module masque cette différence.
"""

from __future__ import annotations

import os
from typing import Any

import requests


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def azure_enabled() -> bool:
    return bool(_env("AZURE_OPENAI_ENDPOINT") and _env("AZURE_OPENAI_API_KEY"))


def openai_enabled() -> bool:
    return bool(_env("OPENAI_API_KEY"))


def local_llm_enabled() -> bool:
    """LLM auto-hébergé (Ollama/vLLM) : endpoint OpenAI-compatible non-OpenAI.

    Activé via LOCAL_LLM_BASE_URL, ou via OPENAI_BASE_URL pointant ailleurs
    que api.openai.com (ex. http://localhost:11434/v1).
    """
    if _env("LOCAL_LLM_BASE_URL"):
        return True
    base = _env("OPENAI_BASE_URL")
    return bool(base) and "api.openai.com" not in base


def _is_local_base() -> bool:
    return local_llm_enabled() and not azure_enabled()


def llm_enabled() -> bool:
    return azure_enabled() or openai_enabled() or local_llm_enabled()


def provider_name() -> str:
    if azure_enabled():
        return "azure_openai"
    if _is_local_base():
        return "local_llm"
    if openai_enabled():
        return "openai"
    return "local"


def _openai_base_url() -> str:
    return (_env("LOCAL_LLM_BASE_URL") or _env("OPENAI_BASE_URL", "https://api.openai.com/v1")).rstrip("/")


def _openai_api_key() -> str:
    # Ollama/vLLM acceptent n'importe quelle clé ; "ollama" sert de jeton factice.
    return _env("OPENAI_API_KEY") or ("ollama" if _is_local_base() else "")


def chat_model() -> str:
    """Nom de modèle (OpenAI/local) ou de déploiement (Azure) pour l'affichage/usage."""
    if azure_enabled():
        return _env("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")
    if _is_local_base():
        return _env("LOCAL_LLM_MODEL") or _env("OPENAI_MODEL", "qwen2.5")
    return _env("OPENAI_MODEL", "gpt-4o")


def embed_model() -> str:
    if azure_enabled():
        return _env("AZURE_OPENAI_EMBED_DEPLOYMENT", "text-embedding-3-small")
    if _is_local_base():
        return _env("LOCAL_LLM_EMBED_MODEL") or _env("OPENAI_EMBED_MODEL", "nomic-embed-text")
    return _env("OPENAI_EMBED_MODEL", "text-embedding-3-small")


def _timeout() -> int:
    try:
        return int(_env("OPENAI_TIMEOUT_SEC", "90"))
    except ValueError:
        return 90


def _chat_endpoint() -> tuple[str, dict[str, str], bool]:
    """Retourne (url, headers, is_azure)."""
    if azure_enabled():
        endpoint = _env("AZURE_OPENAI_ENDPOINT").rstrip("/")
        deployment = _env("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")
        api_version = _env("AZURE_OPENAI_API_VERSION", "2024-10-21")
        url = f"{endpoint}/openai/deployments/{deployment}/chat/completions?api-version={api_version}"
        headers = {"api-key": _env("AZURE_OPENAI_API_KEY"), "Content-Type": "application/json"}
        return url, headers, True

    base = _openai_base_url()
    headers = {"Authorization": f"Bearer {_openai_api_key()}", "Content-Type": "application/json"}
    return f"{base}/chat/completions", headers, False


def _embed_endpoint() -> tuple[str, dict[str, str], bool]:
    if azure_enabled():
        endpoint = _env("AZURE_OPENAI_ENDPOINT").rstrip("/")
        deployment = _env("AZURE_OPENAI_EMBED_DEPLOYMENT", "text-embedding-3-small")
        api_version = _env("AZURE_OPENAI_API_VERSION", "2024-10-21")
        url = f"{endpoint}/openai/deployments/{deployment}/embeddings?api-version={api_version}"
        headers = {"api-key": _env("AZURE_OPENAI_API_KEY"), "Content-Type": "application/json"}
        return url, headers, True

    base = _openai_base_url()
    headers = {"Authorization": f"Bearer {_openai_api_key()}", "Content-Type": "application/json"}
    return f"{base}/embeddings", headers, False


def chat_completion(
    messages: list[dict[str, Any]],
    *,
    tools: list[dict[str, Any]] | None = None,
    tool_choice: str | None = None,
    temperature: float = 0.35,
    timeout: int | None = None,
    max_tokens: int | None = None,
) -> dict[str, Any]:
    """Appel chat/completions compatible OpenAI & Azure OpenAI."""
    url, headers, is_azure = _chat_endpoint()
    body: dict[str, Any] = {"messages": messages, "temperature": temperature}
    if tools:
        body["tools"] = tools
        body["tool_choice"] = tool_choice or "auto"
    if max_tokens:
        body["max_tokens"] = max_tokens
    # Azure : le modèle est porté par le déploiement dans l'URL, pas dans le corps.
    if not is_azure:
        body["model"] = chat_model()
    # LLM local (Ollama) : garde le modèle chargé en RAM entre les appels (évite
    # un rechargement coûteux à chaque tour d'outils sur machine sans GPU).
    if _is_local_base():
        body["keep_alive"] = _env("LOCAL_LLM_KEEP_ALIVE", "30m")

    response = requests.post(url, headers=headers, json=body, timeout=timeout or _timeout())
    if response.status_code >= 400:
        raise RuntimeError(f"LLM API error {response.status_code}: {response.text[:500]}")
    return response.json()


def create_embedding(text: str) -> list[float] | None:
    """Embedding compatible OpenAI & Azure OpenAI. None si LLM désactivé/erreur."""
    if not llm_enabled():
        return None
    url, headers, is_azure = _embed_endpoint()
    body: dict[str, Any] = {"input": (text or "")[:8000]}
    if not is_azure:
        body["model"] = embed_model()
    try:
        response = requests.post(url, headers=headers, json=body, timeout=30)
        response.raise_for_status()
        return response.json()["data"][0]["embedding"]
    except Exception:
        return None


def status() -> dict[str, Any]:
    return {
        "enabled": llm_enabled(),
        "provider": provider_name(),
        "model": chat_model() if llm_enabled() else None,
        "embed_model": embed_model() if llm_enabled() else None,
        "data_residency": (
            "tenant_azure" if azure_enabled()
            else "local_only" if _is_local_base()
            else "openai_cloud" if openai_enabled()
            else "local_only"
        ),
    }
