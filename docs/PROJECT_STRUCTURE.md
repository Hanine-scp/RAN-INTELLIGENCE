# Project structure — Frontend / Backend / Tests

Guardian Nexus AI is organized as a **monorepo**. **All test code** lives under `tests/`.

```
RAN-INTELLIGENCE/
├── frontend/                 # Next.js UI (production code)
├── backend/                  # Backend index (production code at repo root)
├── tests/                    # ← ALL tests & test tools
│   ├── backend/
│   │   ├── parsers/
│   │   ├── services/
│   │   ├── integration/
│   │   ├── fixtures/
│   │   └── tools/            # audit, manual QA scripts
│   └── frontend/
│       ├── unit/             # Vitest
│       └── e2e/              # Playwright (planned)
├── api/                      # FastAPI (production)
├── src/                      # parsers + services (production)
├── config/
├── pipeline/
└── scripts/                  # ops scripts only (no test_*.py)
```

See [`tests/README.md`](../tests/README.md) for commands.

## Frontend (`frontend/`)

Production Next.js app. Quality gates: `npm run lint`, `npm run build`.

Automated unit tests: `tests/frontend/` (Vitest).

## Backend (production)

| Path | Role |
|------|------|
| `api/` | FastAPI |
| `src/parsers/` | Nokia / Huawei XML |
| `src/services/` | Business logic |
| `config/` | Settings |
| `pipeline/` | Batch XML → Parquet |
| `scripts/` | Ops CLI (ingest, registry, trust) — **not** tests |

## Tests (`tests/`)

| Area | Path | Runner |
|------|------|--------|
| Backend unit/integration | `tests/backend/` | pytest |
| Backend manual tools | `tests/backend/tools/` | `python tests/backend/tools/...` |
| Frontend unit | `tests/frontend/unit/` | Vitest |
| Frontend E2E | `tests/frontend/e2e/` | (planned) |

### Backend pytest

```powershell
python -m pytest tests/backend -q
python -m pytest tests/backend/parsers -m corpus  # needs NOKIA_CORPUS_AUDIT=1
```

### Frontend Vitest

```powershell
cd tests/frontend && npm install && npm test
```

### Nokia corpus audit

```powershell
python tests/backend/tools/audit_nokia_parser.py
```

## CI

| Job | Command |
|-----|---------|
| backend | `pytest tests/backend` |
| frontend | `npm run lint` · `npm run build` |

Optional: add `cd tests/frontend && npm test` to CI when Vitest is wired in.
