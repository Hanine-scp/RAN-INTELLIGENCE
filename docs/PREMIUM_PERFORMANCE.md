# Premium Performance Playbook

Approche **mesurer → prioriser → optimiser → tester → déployer → surveiller**.

## 1. Monitoring installé

### Backend
| Capacité | Endpoint / fichier |
|----------|-------------------|
| `request_id` sur chaque requête | Header `X-Request-ID` — `api/performance_middleware.py` |
| Logs JSON structurés | Logger `ran.api` — `STRUCTURED_LOGS_ENABLED=true` |
| Latence HTTP p50/p95/p99 | `GET /ops/http-metrics` (admin) |
| Prometheus | `GET /metrics` |
| Latence SQL DuckDB + labels | `GET /ops/query-metrics` |
| Cache hit rate | `GET /ops/cache-stats` |
| Feature flags | `GET /ops/feature-flags` |
| Web Vitals frontend | `POST /ops/client-vitals` |

### Frontend
| Capacité | Fichier |
|----------|---------|
| Retry réseau (502/503/504/429) | `frontend/lib/fetch-client.ts` |
| Timeout configurable | `NEXT_PUBLIC_API_TIMEOUT_MS` |
| Web Vitals (LCP, FCP, CLS…) | `frontend/components/web-vitals.tsx` |
| Skeleton loaders premium | `frontend/components/skeleton.tsx` |
| Cache assets statiques | `frontend/next.config.ts` |

## 2. Cache

- **Mémoire** par défaut (`CACHE_ENABLED=true`)
- **Redis** optionnel via `REDIS_URL`
- Endpoints mis en cache :
  - `POST /filters/options` (TTL 180s)
  - `POST /dashboard` (TTL 60s)
- Invalidation automatique après ingest/suppression snapshot

## 3. Backend optimisé

- Connexion DuckDB **réutilisée** (thread-safe lock)
- Métriques SQL **par label** (`slowest_labels`)
- Emails auth en **BackgroundTasks** (`BACKGROUND_EMAIL_ENABLED`)
- **Rate limiting** sur `/auth/register`, `/auth/login`, `/auth/forgot-password`

## 4. Variables d'environnement

Copier `.env.performance.example` vers `.env.auth` ou `.env`.

```env
METRICS_ENABLED=true
CACHE_ENABLED=true
RATE_LIMIT_ENABLED=true
STRUCTURED_LOGS_ENABLED=true
BACKGROUND_EMAIL_ENABLED=true
NEXT_PUBLIC_API_RETRY_COUNT=2
```

## 5. Tests & CI

```bash
pip install pytest httpx
pytest tests/ -q
```

La CI GitHub exécute `pytest` après le smoke import backend.

## 6. Phase 2 (implémentée)

| Item | Détail |
|------|--------|
| **Redis** | `docker-compose.cache.yml` — `docker compose -f docker-compose.yml -f docker-compose.cache.yml up -d` |
| **Virtualisation tables** | `DataTable` + `@tanstack/react-virtual` (seuil 80 lignes) |
| **Sites paginé** | Page `/sites` → `POST /v2/sites` (500 lignes/page, recherche serveur) |
| **Sentry** | `SENTRY_DSN` backend (`sentry_hooks.py`) + error boundary frontend |
| **Budget CI** | `tests/test_perf_budget.py` — health/ready/metrics < 200–500 ms |
| **Erreurs client** | `POST /ops/client-errors` + `ClientErrorBoundary` |

## 7. Phase 3 (implémentée)

| Item | Détail |
|------|--------|
| **OpenTelemetry** | `src/services/otel_hooks.py` — actif si `OTEL_EXPORTER_OTLP_ENDPOINT` est défini |
| **Collector local** | `docker-compose.observability.yml` + `ops/otel-collector-config.yaml` |
| **SWR dashboard** | `frontend/lib/use-dashboard.ts` — cache partagé home + top-bar (dedup 30s) |
| **Uvicorn workers** | `scripts/run_api.py` + `Dockerfile.api` (`UVICORN_WORKERS=2`) |
| **Inventaire full load** | `/inventaire` → `page_size=0` + virtualisation `DataTable` |
| **Budget CI dashboard** | `tests/test_dashboard_perf.py` — contexte vide + lake si disponible |

```bash
# Stack observabilité locale
docker compose -f docker-compose.yml -f docker-compose.cache.yml -f docker-compose.observability.yml up -d

# API production (multi-workers)
UVICORN_WORKERS=4 python scripts/run_api.py

# Tests perf dashboard
pytest tests/test_dashboard_perf.py -v
```

## 8. Commandes utiles

```bash
# API avec logs structurés
python -m uvicorn api.main:app --host 127.0.0.1 --port 8010 --reload

# Métriques
curl http://127.0.0.1:8010/metrics
curl -H "Authorization: Bearer <admin_token>" http://127.0.0.1:8010/ops/http-metrics

# Tests
pytest tests/test_premium_platform.py -v
```
