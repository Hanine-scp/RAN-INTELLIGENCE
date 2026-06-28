# Stack IA 100 % locale — sécurité des données

Architecture où **aucune donnée RAN ne quitte votre infrastructure** : LLM local (Ollama),
recherche web auto-hébergée (SearXNG), RAG SQLite local, et n8n comme orchestrateur.

```
n8n (Docker)  ──HTTP──►  Backend FastAPI  ──►  Ollama (LLM local)
orchestrateur            "le cerveau"     ──►  SearXNG (web local)
(cron, alertes)          Guardian + RAG + rapports + parser XML
```

Règle d'or : **le cerveau reste dans le backend ; n8n ne fait que déclencher/planifier/notifier
via des appels HTTP au backend.** n8n ne parle jamais directement au LLM.

---

## 1. LLM local — Ollama

### Installation (recommandé : natif Windows pour le GPU)

1. Télécharger et installer Ollama : https://ollama.com/download
2. Télécharger les modèles :
   ```bash
   ollama pull qwen2.5            # agent + tool-calling (recommandé)
   ollama pull nomic-embed-text   # embeddings pour le RAG
   ```
3. Ollama écoute sur `http://localhost:11434` (API OpenAI-compatible sur `/v1`).

> Alternative Docker : `docker compose -f docker-compose.local-ai.yml up -d ollama`
> puis `docker exec -it ran-ollama ollama pull qwen2.5`. Pour le GPU sous Docker,
> décommentez le bloc `deploy` GPU dans le compose (nécessite l'accès GPU WSL2).

### Modèles selon le GPU

| VRAM | Modèle conseillé | Qualité |
|------|------------------|---------|
| ≥ 12 Go | `qwen2.5:14b` ou `qwen2.5` (7B) | Très bonne, tool-calling fiable |
| 6–8 Go | `qwen2.5:7b` quantifié | Bonne |
| CPU only | `qwen2.5:3b` / `llama3.2` | Correcte, plus lente |

La config se fait dans `.env.ai` (`LOCAL_LLM_MODEL`).

---

## 2. Recherche web locale — SearXNG

```bash
docker compose -f docker-compose.local-ai.yml up -d searxng
```

- UI : http://localhost:8888
- Le backend l'utilise via `SEARXNG_URL` (déjà dans `.env.ai`).
- ⚠️ SearXNG agrège des résultats du web (il touche Internet), mais **aucune donnée
  ne transite par une API commerciale** et vous maîtrisez l'egress. L'agent n'envoie
  jamais de données RAN brutes dans une requête (uniquement des questions de connaissance).
- Pensez à changer `secret_key` dans `infra/searxng/settings.yml`.

---

## 3. Configuration backend (`.env.ai`)

Le provider est détecté automatiquement. Pour le mode 100 % local :

```bash
LOCAL_LLM_BASE_URL=http://localhost:11434/v1
LOCAL_LLM_MODEL=qwen2.5
LOCAL_LLM_EMBED_MODEL=nomic-embed-text
SEARXNG_URL=http://localhost:8888
```

Laissez `AZURE_OPENAI_*` et `OPENAI_API_KEY` vides. Redémarrez le backend.
Vérifiez ensuite que le statut indique `data_residency: local_only`.

---

## 4. Orchestration n8n

Les workflows d'exemple sont dans `infra/n8n/workflows/` :
- `daily-noc-report.json` — rapport NOC quotidien (cron 06:00)
- `anomaly-alert.json` — alerte si anomalies ≥ seuil (toutes les heures)
- `signup-access-approval.json` — demandes d'accès utilisateur (inscription + approbation admin)

### Import dans n8n

1. Ouvrir n8n : http://localhost:5678
2. Menu **⋮ → Import from File** → choisir le JSON.
3. Le workflow appelle le backend sur `http://host.docker.internal:8010` (le conteneur
   n8n joint ainsi le backend qui tourne sur l'hôte).

### Authentification n8n → backend

Les endpoints `/guardian/*` exigent un token. Deux options :

- **Token Keycloak (service account)** : le client `ran-api` a les service accounts activés.
  Ajoutez un nœud HTTP Request qui obtient un token via `client_credentials`, puis réutilisez-le.
- **Variable d'environnement n8n** : définissez `RAN_API_TOKEN` (un token admin valide) dans
  l'environnement du conteneur n8n ; les workflows l'injectent via `{{$env.RAN_API_TOKEN}}`.

Pour donner le rôle admin au service account `ran-api`, ajoutez-lui le rôle realm
`ran-admin` dans la console Keycloak (Clients → ran-api → Service account roles).

---

## Récapitulatif sécurité

| Composant | Donnée sensible sort ? |
|-----------|------------------------|
| LLM (Ollama local) | ❌ Jamais |
| RAG (SQLite + embeddings locaux) | ❌ Jamais |
| Parser XML, Guardian, rapports | ❌ Jamais |
| n8n (auto-hébergé) | ❌ Local |
| Recherche web (SearXNG) | ⚠️ Seule la requête de connaissance sort, jamais les données RAN |
