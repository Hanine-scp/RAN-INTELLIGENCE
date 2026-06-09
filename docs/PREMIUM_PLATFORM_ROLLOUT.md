# Premium Platform Rollout

## 1) Data Trust (Blockchain-style integrity)

- Hash each XML file per snapshot (`SHA-256`)
- Compute snapshot batch hash from all XML hashes
- Chain each day with previous chain hash
- Store anchors in `data/trust/trust_audit.db`
- Verify integrity via API

### API
- `POST /trust/anchor-latest`
- `POST /trust/anchor`
- `POST /trust/verify`
- `GET /trust/anchors`

## 2) DevOps

- CI pipeline in `.github/workflows/ci.yml`
- Docker runtime:
  - `Dockerfile.api`
  - `frontend/Dockerfile`
  - `docker-compose.yml`
- Health checks:
  - API `/health`
  - API `/ready`

## 3) AI Assistant

- Rule assistant:
  - `POST /assistant`
- Insight assistant with operations context:
  - `POST /assistant/insight`
- Uses quality, delta and prediction context for recommendations.

## 4) Performance & Quality Observability

- Query timing observability in backend:
  - avg ms
  - p95 ms
  - max ms
- Endpoints:
  - `GET /ops/query-metrics`
  - `POST /ops/summary`

## 5) Frontend Operations Console

- Route: `/ops`
- Shows:
  - operational KPIs
  - query performance
  - trust anchors
  - manual latest anchor action

## 6) Runbook

### Local
- API: `uvicorn api.main:app --host 127.0.0.1 --port 8000`
- Frontend: `cd frontend && npm run dev`

### Docker
- `docker compose up --build`
