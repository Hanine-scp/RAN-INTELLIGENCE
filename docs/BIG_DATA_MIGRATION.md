# Big Data Migration Playbook

This project already works with local DuckDB + Parquet.  
Use this guide to prepare a safe migration path to a big-data runtime without breaking the current app.

## 1) Start the big-data foundation

1. Copy environment template:
   - `copy .env.bigdata.example .env.bigdata`
2. Start infrastructure:
   - `docker compose -f docker-compose.bigdata.yml --env-file .env.bigdata up -d`
3. Open service UIs:
   - MinIO console: `http://127.0.0.1:9001`
   - Spark master UI: `http://127.0.0.1:8081`
   - Spark worker UI: `http://127.0.0.1:8082`

## 2) Data layout for scale

Keep medallion zones:
- `ran-bronze`: raw XML or parsed raw records
- `ran-silver`: cleaned normalized tables (sites, equipment, counters)
- `ran-gold`: serving-ready aggregated tables

Daily ingestion contract (J-1):
- every day, one folder arrives with XML files for `day-1`
- folder name must be the snapshot date (example: `2026-06-04`)
- ingestion job must read that folder as one immutable snapshot batch

Write Parquet partitioned by:
- `snapshot_date` (mandatory)
- optional: `object_type` (for equipment-heavy reads)

For your flow, always partition with `snapshot_date = J-1` from incoming folder.

## 3) API strategy (important)

For very large datasets, never send all rows to the browser in one response.

Implement these endpoint patterns:
- `POST /inventory/query` with filters + sort + cursor + page_size
- `POST /inventory/count` for total row count
- `POST /inventory/export` to trigger full export file

Recommended page size:
- 200 to 1000 rows per request

## 4) Frontend strategy

Use:
- virtualized table rendering
- server-side pagination/sorting/filtering
- full export button for complete dataset download

This keeps UI responsive while still giving full data access.

## 5) Compute engine migration path

Phase A (now):
- keep DuckDB for serving API
- move raw/silver/gold storage to MinIO-compatible object store

Phase B:
- build Spark jobs for heavy transforms (daily J-1 batch)
- write curated Parquet to silver/gold

Phase C:
- API reads gold tables (DuckDB external scan or Spark SQL endpoint)
- keep one API contract for frontend (no UI rewrite needed)

## 6) Performance checklist

- Partition pruning on `snapshot_date`
- Avoid `SELECT *` on wide tables
- Push filters to SQL
- Add cache for repeated queries (Redis)
- Track p95 and p99 latency by endpoint

## 6.1) J-1 orchestration rules (recommended)

- Run one scheduled pipeline per day (after source delivery window).
- Input path pattern:
  - `DATA.XML/YYYY-MM-DD/*.xml`
- Watermark table in Postgres:
  - fields: `snapshot_date`, `ingested_at`, `status`, `row_count`, `batch_hash`
- Idempotency:
  - if `snapshot_date` already ingested with same hash, skip reprocessing
  - if same date but different hash, mark as revision and alert
- Data trust:
  - anchor hash per snapshot date after successful silver write
- Backfill:
  - allow manual replay for a date range without changing frontend contracts

## 7) Production hardening checklist

- Add object storage lifecycle policy
- Back up Postgres metadata DB
- Add API timeouts and circuit breakers
- Add retry policy for Spark job writes
- Add data quality gates before writing `gold`

## 8) Suggested next implementation tasks

1. Add paginated API contracts for `inventory`, `assets`, `quality`
2. Add virtualized table component in frontend
3. Add async export job endpoint
4. Add Spark batch job template for daily J-1 XML -> bronze -> silver
5. Add observability dashboard (query latency, row volume, cache hit rate)
