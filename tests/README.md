# Tests — Guardian Nexus AI

All automated and manual test assets live under `tests/`, split by stack.

```
tests/
├── pytest.ini              # Backend pytest config
├── conftest.py               # Repo root on PYTHONPATH
├── backend/
│   ├── conftest.py           # Fixtures (XML samples, mini corpus)
│   ├── fixtures/             # Sample Nokia XML
│   ├── parsers/              # Parser unit + corpus tests
│   ├── services/             # AI, search, copilot routing
│   ├── integration/          # API / perf / platform
│   └── tools/                # Manual CLI test scripts
└── frontend/
    ├── unit/                 # Vitest unit tests
    └── e2e/                  # Reserved for Playwright
```

## Backend (Python)

```powershell
# From repo root — all backend tests
python -m pytest tests/backend -q

# Subsets
python -m pytest tests/backend/parsers -q
python -m pytest tests/backend/services -q
python -m pytest tests/backend/integration -q
```

### Manual tools (`tests/backend/tools/`)

| Script | Purpose |
|--------|---------|
| `audit_nokia_parser.py` | Full XML corpus audit + PDF report |
| `test_nokia_parser.py` | Parse one snapshot to CSV (silver) |
| `test_auth_notifications.py` | Live email/SMS smoke test |
| `prepare_real_auth_test.py` | Reset auth DB for manual QA |

```powershell
python tests/backend/tools/audit_nokia_parser.py
python tests/backend/tools/audit_nokia_parser.py --limit 20
```

## Frontend (TypeScript)

```powershell
cd tests/frontend
npm install
npm test
```

UI lint/build (CI) still runs from `frontend/`:

```powershell
cd frontend
npm run lint
npm run build
```
