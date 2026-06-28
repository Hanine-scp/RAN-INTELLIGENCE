# Backend — Guardian Nexus AI

Python stack for the RAN Intelligence platform: API, parsers, pipeline, and services.

## Layout (repository root)

| Path | Role |
|------|------|
| `api/` | FastAPI app — routes, auth, schemas, middleware |
| `src/parsers/` | Nokia / Huawei XML parsers |
| `src/services/` | Business logic (lake, AI, trust, search, …) |
| `config/` | Settings, env loading (`RAW_DATA_PATH`, lake paths) |
| `pipeline/` | XML → Parquet batch pipeline |
| `scripts/` | Ops CLI (ingest, registry, trust) — tests are under `tests/backend/tools/` |
| `requirements.txt` | Python dependencies |
| `Dockerfile.api` | API container image |

## Run locally

```powershell
# From repo root
pip install -r requirements.txt
python -m uvicorn api.main:app --host 127.0.0.1 --port 8010 --reload
```

## Tests

All backend tests and manual test scripts: [`tests/README.md`](../tests/README.md).

```powershell
python -m pytest tests/backend -q
python tests/backend/tools/audit_nokia_parser.py --limit 20
```

## Data

- Input XML: `C:\projects\DATA.XML` (override with `DATA_XML_ROOT`)
- Lake output: `data/lake/`
- Exports: `data/exports/`
