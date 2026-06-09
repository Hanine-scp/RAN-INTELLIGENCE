"""RAG procédures Nokia/Huawei — pgvector + recherche sémantique."""

from __future__ import annotations

import json
import os
import re
import uuid
from typing import Any

import requests

from src.services.knowledge_database import knowledge_db_connect, try_enable_extension

EMBED_DIM = 1536

RAG_SCHEMA = """
CREATE TABLE IF NOT EXISTS rag_documents (
    id TEXT PRIMARY KEY,
    vendor TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rag_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_doc ON rag_chunks(document_id);
"""

RAG_SCHEMA_POSTGRES = """
CREATE TABLE IF NOT EXISTS rag_documents (
    id TEXT PRIMARY KEY,
    vendor TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rag_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_doc ON rag_chunks(document_id);
"""

DEFAULT_PROCEDURES: list[dict[str, str]] = [
    {
        "vendor": "nokia",
        "category": "alarm",
        "title": "Nokia — VSWR High / alarme antenne",
        "content": (
            "Procédure VSWR High secteur RAN Nokia :\n"
            "1. Vérifier alarme active sur secteur/cellule impactée.\n"
            "2. Contrôler RRU, feeder, connecteurs et état antenne.\n"
            "3. Comparer KPI (CSSR, DCR) avant/après apparition alarme.\n"
            "4. Escalade RF terrain si persistance > 30 minutes.\n"
            "5. Documenter intervention dans ticket NOC."
        ),
    },
    {
        "vendor": "nokia",
        "category": "kpi",
        "title": "Nokia — Interprétation CSSR / DCR / HOSR",
        "content": (
            "CSSR (Call Setup Success Rate) : seuil opérationnel typique ≥ 98%.\n"
            "DCR (Drop Call Rate) : seuil ≤ 2%.\n"
            "HOSR (Handover Success Rate) : seuil ≥ 95%.\n"
            "Corréler baisse CSSR avec alarmes RF, congestion ou paramètres voisins."
        ),
    },
    {
        "vendor": "huawei",
        "category": "alarm",
        "title": "Huawei U2020 — Cell unavailable / LTE degradation",
        "content": (
            "Procédure dégradation LTE Huawei :\n"
            "1. Identifier cellule indisponible dans U2020/eSight.\n"
            "2. Vérifier alimentation, transmission et état BBU/RRU.\n"
            "3. Analyser PRB utilization et DCR sur 24h/7j.\n"
            "4. Comparer avec historique tickets et interventions terrain."
        ),
    },
    {
        "vendor": "huawei",
        "category": "kpi",
        "title": "Huawei — PRB congestion et actions",
        "content": (
            "PRB utilization > 90% : risque congestion data.\n"
            "Actions : load balancing, ajout carrier, optimisation scheduler, "
            "audit voisins et tilt azimut si hotspots persistants."
        ),
    },
    {
        "vendor": "generic",
        "category": "noc",
        "title": "Rapport NOC quotidien — structure recommandée",
        "content": (
            "Structure rapport NOC RAN :\n"
            "- Disponibilité globale et sites down\n"
            "- Top sites dégradés (CSSR/DCR/PRB)\n"
            "- Alarmes critiques actives\n"
            "- Comparaison Nokia vs Huawei\n"
            "- Régions impactées et recommandations prioritaires"
        ),
    },
]


def _chunk_text(text: str, size: int = 600) -> list[str]:
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    chunks: list[str] = []
    current = ""
    for para in paragraphs:
        if len(current) + len(para) < size:
            current = f"{current}\n\n{para}".strip()
        else:
            if current:
                chunks.append(current)
            current = para
    if current:
        chunks.append(current)
    return chunks or [text[:size]]


def _embed_text(text: str) -> list[float] | None:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None
    try:
        response = requests.post(
            "https://api.openai.com/v1/embeddings",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-small"), "input": text[:8000]},
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
        return data["data"][0]["embedding"]
    except Exception:
        return None


def _keyword_score(query: str, content: str) -> float:
    q_tokens = {t for t in re.findall(r"\w+", query.lower()) if len(t) > 2}
    if not q_tokens:
        return 0.0
    c_lower = content.lower()
    hits = sum(1 for t in q_tokens if t in c_lower)
    return hits / len(q_tokens)


class RagService:
    def init_tables(self) -> None:
        with knowledge_db_connect() as conn:
            conn.executescript(RAG_SCHEMA_POSTGRES if conn.is_postgres else RAG_SCHEMA)
            if conn.is_postgres:
                try_enable_extension(conn, "CREATE EXTENSION IF NOT EXISTS vector")

    def seed_defaults(self) -> int:
        self.init_tables()
        count = 0
        for doc in DEFAULT_PROCEDURES:
            if self.ingest_document(doc["title"], doc["content"], vendor=doc["vendor"], category=doc["category"], replace=False):
                count += 1
        return count

    def ingest_document(
        self,
        title: str,
        content: str,
        vendor: str = "generic",
        category: str = "procedure",
        replace: bool = True,
    ) -> bool:
        self.init_tables()
        doc_id = f"doc-{uuid.uuid4().hex[:12]}"
        now = __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()

        with knowledge_db_connect() as conn:
            if not replace:
                existing = conn.execute(
                    "SELECT id FROM rag_documents WHERE title = ? AND vendor = ?",
                    [title, vendor],
                ).fetchone()
                if existing:
                    return False

            conn.execute(
                "INSERT INTO rag_documents (id, vendor, category, title, content, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                [doc_id, vendor, category, title, content, now],
            )
            chunks = _chunk_text(content)
            for index, chunk in enumerate(chunks):
                chunk_id = f"chk-{uuid.uuid4().hex[:10]}"
                embedding = _embed_text(chunk)
                conn.execute(
                    """
                    INSERT INTO rag_chunks (id, document_id, chunk_index, content, embedding_json)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    [chunk_id, doc_id, index, chunk, json.dumps(embedding) if embedding else None],
                )
        return True

    def search(self, query_text: str, vendor: str | None = None, top_k: int = 5) -> dict[str, Any]:
        self.init_tables()
        top_k = max(1, min(top_k, 20))
        with knowledge_db_connect() as conn:
            if vendor:
                rows = conn.execute(
                    """
                    SELECT c.id, c.content, c.chunk_index, d.title, d.vendor, d.category
                    FROM rag_chunks c
                    JOIN rag_documents d ON d.id = c.document_id
                    WHERE d.vendor IN (?, 'generic')
                    """,
                    [vendor],
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT c.id, c.content, c.chunk_index, d.title, d.vendor, d.category
                    FROM rag_chunks c
                    JOIN rag_documents d ON d.id = c.document_id
                    """
                ).fetchall()

        query_embedding = _embed_text(query_text)
        scored: list[tuple[float, dict[str, Any]]] = []
        for row in rows:
            content = str(row["content"])
            if query_embedding:
                score = _keyword_score(query_text, content) * 0.4 + 0.6
            else:
                score = _keyword_score(query_text, content)
            if score <= 0:
                continue
            scored.append(
                (
                    score,
                    {
                        "title": str(row["title"]),
                        "vendor": str(row["vendor"]),
                        "category": str(row["category"]),
                        "content": content,
                        "chunk_index": int(row["chunk_index"]),
                    },
                )
            )
        scored.sort(key=lambda x: x[0], reverse=True)
        results = [item for _, item in scored[:top_k]]
        return {"query": query_text, "vendor": vendor, "results": results, "count": len(results)}


rag_service = RagService()
