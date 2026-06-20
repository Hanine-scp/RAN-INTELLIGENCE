from config.env_loader import load_auth_env

load_auth_env()

from src.services.otel_hooks import init_otel
from src.services.sentry_hooks import init_sentry

init_sentry()

import asyncio
from datetime import datetime
import json
import os
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from api.activity_middleware import PlatformActivityMiddleware
from api.performance_middleware import PerformanceMiddleware
from api.rate_limit import rate_limiter
from api.auth_routes import router as auth_router
from api.dependencies import get_current_user, require_admin
from api.schemas import (
    AnomalyPayload,
    AssetDistributionV2Payload,
    AssistantInsightPayload,
    AssistantQuestion,
    ConversationSyncPayload,
    CreateConversationPayload,
    RagIngestPayload,
    RagSearchPayload,
    SiteKpiPayload,
    ClusteringPayload,
    DeleteSnapshotsPayload,
    ProcessSnapshotsPayload,
    DeltaComparePayload,
    FilterPayload,
    InventoryV2Payload,
    InventoryPayload,
    PaginatedPayload,
    SerialInvestigationPayload,
    SiteInvestigationPayload,
    ObjectTypeInvestigationPayload,
    ReplacementsPayload,
    SerialPatternsPayload,
    SnapshotInvestigationPayload,
    SparesPayload,
    PlatformSearchPayload,
    TrustSnapshotPayload,
)
from config.settings import RAW_DATA_PATH
from pipeline.main_pipeline import delete_snapshots, process_uploaded_snapshot
from src.services.auth_service import AuthUser
from src.services.cache_service import cache_service
from src.services.data_service import FilterContext, data_service, get_query_observability, lake_ready
from src.services.feature_flags import feature_flags
from src.services.metrics_service import metrics_service
from src.services.platform_activity_service import build_filter_context_summary, platform_activity_service
from src.services.replacement_analytics_service import replacement_analytics_service
from src.services.risk_cards_service import risk_cards_service
from src.services.serial_patterns_service import serial_patterns_service
from src.services.spares_tracking_service import spares_tracking_service
from src.services.trust_service import trust_service
from src.services.guardian_orchestrator import guardian_orchestrator
from src.services.integrity_service import integrity_service
from src.services.change_intelligence_service import change_intelligence_service
from src.services.anomaly_intelligence_service import anomaly_intelligence_service
from src.services.predictive_risk_service import predictive_risk_service
from src.services.assistant_file_service import assistant_file_service
from src.services.assistant_intelligence_service import assistant_intelligence_service
from src.services.conversation_history_service import conversation_history_service
from src.services.openai_agent_service import openai_agent_service
from src.services.platform_search_service import platform_search_service
from src.services.rag_service import rag_service
from src.services.ran_anomaly_rules import build_site_rca
from src.services.timeseries_kpi_service import timeseries_kpi_service
from src.services.powerbi_export_service import powerbi_export_service
from src.services.vendor_lake import SUPPORTED_VENDORS, ensure_vendor_scaffold, find_xml_snapshot_folder, vendor_status
from src.services.web_search_service import web_search_service

app = FastAPI(title="RAN Guardian Copilot API", version="2.0.0")
init_otel(app)
app.include_router(auth_router)
app.add_middleware(PlatformActivityMiddleware)
_XML_ROOT = Path(os.getenv("DATA_XML_ROOT", str(RAW_DATA_PATH)))

_allowed_origins = [origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "*").split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(PerformanceMiddleware)


def _ctx(payload: FilterPayload) -> FilterContext:
    return FilterContext.from_inputs(
        selected_dates=payload.selected_dates,
        selected_files=payload.selected_files,
        selected_sites=payload.selected_sites,
        selected_file_dates=payload.selected_file_dates,
        effective_dates=payload.effective_dates,
        site_search=payload.site_search,
        date_search=payload.date_search,
        period_start=payload.period_start,
        period_end=payload.period_end,
        smart_missing_serial=payload.smart_missing_serial,
        smart_duplicates=payload.smart_duplicates,
        smart_critical_quality=payload.smart_critical_quality,
        language=payload.language,
        vendor=payload.vendor,
    )


def _validate_snapshot_date(snapshot_date: str) -> str:
    value = snapshot_date.strip()
    try:
        datetime.strptime(value, "%Y.%m.%d")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="snapshot_date must use format YYYY.MM.DD") from exc
    return value


@app.get("/")
def api_root() -> dict[str, object]:
    frontend = os.getenv("APP_FRONTEND_URL", os.getenv("FRONTEND_URL", "http://localhost:3000")).rstrip("/")
    return {
        "service": "RAN Intelligence API",
        "status": "ok",
        "docs": "/docs",
        "health": "/health",
        "frontend": {
            "admin_setup": f"{frontend}/admin/setup",
            "login": f"{frontend}/login",
            "signup": f"{frontend}/signup",
        },
        "hint": "Ouvrez l'interface sur le frontend (port 3000), pas sur ce port API.",
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
def ready() -> dict[str, bool]:
    return {"ready": lake_ready()}


@app.post("/ingest/xml")
async def ingest_xml(
    snapshot_date: str = Form(...),
    files: list[UploadFile] = File(...),
    process: str = Form("true"),
    _: AuthUser = Depends(require_admin),
) -> dict:
    validated_date = _validate_snapshot_date(snapshot_date)
    if not files:
        raise HTTPException(status_code=400, detail="At least one XML file is required.")

    target_dir = _XML_ROOT / validated_date
    target_dir.mkdir(parents=True, exist_ok=True)
    saved_files: list[str] = []
    skipped_files: list[str] = []

    for upload in files:
        filename = Path(upload.filename or "").name
        if not filename.lower().endswith(".xml"):
            skipped_files.append(filename or "unknown")
            await upload.close()
            continue
        destination = target_dir / filename
        content = await upload.read()
        destination.write_bytes(content)
        saved_files.append(filename)
        await upload.close()

    if not saved_files:
        raise HTTPException(status_code=400, detail="No valid .xml file provided.")

    should_process = process.strip().lower() not in {"0", "false", "no", "off"}
    processing: dict | None = None
    processing_error: str | None = None

    if should_process:
        try:
            processing = await asyncio.to_thread(
                process_uploaded_snapshot,
                validated_date,
                source_root=_XML_ROOT,
                max_workers=0,
            )
        except Exception as exc:
            processing_error = str(exc)

    cache_service.invalidate_prefix("ran:dashboard:")
    cache_service.invalidate_prefix("ran:filters_options:")
    return {
        "data": {
            "snapshot_date": validated_date,
            "target_path": str(target_dir),
            "uploaded_count": len(saved_files),
            "uploaded_files": saved_files,
            "skipped_files": skipped_files,
            "processed": processing is not None,
            "processing": processing,
            "processing_error": processing_error,
        }
    }


@app.post("/snapshots/delete")
async def remove_snapshots(payload: DeleteSnapshotsPayload, _: AuthUser = Depends(require_admin)) -> dict:
    if not payload.snapshot_dates:
        raise HTTPException(status_code=400, detail="At least one snapshot_date is required.")
    try:
        result = await asyncio.to_thread(
            delete_snapshots,
            payload.snapshot_dates,
            source_root=_XML_ROOT,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    cache_service.invalidate_prefix("ran:dashboard:")
    cache_service.invalidate_prefix("ran:filters_options:")
    return {"data": result}


@app.post("/snapshots/process")
async def process_snapshots(payload: ProcessSnapshotsPayload, _: AuthUser = Depends(require_admin)) -> dict:
    if not payload.snapshot_dates:
        raise HTTPException(status_code=400, detail="At least one snapshot_date is required.")
    processed: list[dict] = []
    errors: list[dict[str, str]] = []
    for snapshot_date in payload.snapshot_dates:
        validated = _validate_snapshot_date(snapshot_date.replace("-", "."))
        folder = find_xml_snapshot_folder(_XML_ROOT, validated)
        if folder is None:
            errors.append({"snapshot_date": snapshot_date, "error": "XML folder not found"})
            continue
        try:
            result = await asyncio.to_thread(
                process_uploaded_snapshot,
                folder.name,
                source_root=_XML_ROOT,
                max_workers=0,
            )
            processed.append(result)
        except Exception as exc:
            errors.append({"snapshot_date": snapshot_date, "error": str(exc)})
    if not processed and errors:
        raise HTTPException(status_code=400, detail=errors)
    return {"data": {"processed": processed, "errors": errors}}


@app.post("/filters/options")
def filter_options(payload: FilterPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    ctx = _ctx(payload)
    cache_key = cache_service.make_key(
        "filters_options",
        {"vendor": ctx.vendor, "dates": ctx.selected_dates, "files": ctx.selected_files},
    )
    ttl = int(os.getenv("CACHE_FILTER_OPTIONS_TTL_SECONDS", "180"))
    data = cache_service.get_or_set(cache_key, lambda: data_service.get_filter_options(ctx), ttl=ttl)
    return {"data": data}


@app.post("/dashboard")
def dashboard(payload: FilterPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    ctx = _ctx(payload)
    cache_key = cache_service.make_key(
        "dashboard",
        {
            "vendor": ctx.vendor,
            "effective_dates": ctx.effective_dates,
            "sites": ctx.selected_sites,
            "smart": (
                ctx.smart_missing_serial,
                ctx.smart_duplicates,
                ctx.smart_critical_quality,
            ),
        },
    )
    ttl = int(os.getenv("CACHE_DASHBOARD_TTL_SECONDS", "60"))
    data = cache_service.get_or_set(cache_key, lambda: data_service.get_dashboard(ctx), ttl=ttl)
    return {"data": data}


@app.post("/sites")
def sites(payload: FilterPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": data_service.get_sites_page(_ctx(payload))}


@app.post("/v2/sites")
def sites_v2(payload: PaginatedPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": data_service.get_sites_page_v2(_ctx(payload), page=payload.page, page_size=payload.page_size, search=payload.search)}


@app.post("/inventory")
def inventory(payload: InventoryPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {
        "data": data_service.get_inventory_page(
            _ctx(payload),
            payload.object_types,
        )
    }


@app.post("/v2/inventory")
def inventory_v2(payload: InventoryV2Payload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {
        "data": data_service.get_inventory_page_v2(
            _ctx(payload),
            object_types=payload.object_types,
            page=payload.page,
            page_size=payload.page_size,
            search=payload.search,
        )
    }


@app.post("/delta")
def delta(_: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": data_service.get_delta_page()}


@app.post("/delta/compare")
def delta_compare(payload: DeltaComparePayload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": data_service.get_delta_comparison(_ctx(payload), payload.compare_date_1, payload.compare_date_2)}


@app.post("/statistics")
def statistics(payload: FilterPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": data_service.get_statistics_page(_ctx(payload))}


@app.post("/prediction")
def prediction(payload: FilterPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": data_service.get_prediction_page(_ctx(payload))}


@app.post("/analytics")
def analytics(payload: FilterPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": data_service.get_analytics_page(_ctx(payload))}


@app.post("/temporal-changes")
def temporal_changes(payload: FilterPayload, _: AuthUser = Depends(require_admin)) -> dict:
    return {"data": data_service.get_temporal_changes_page(_ctx(payload))}


@app.post("/asset-distribution")
def asset_distribution(payload: FilterPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": data_service.get_asset_distribution_page(_ctx(payload))}


@app.post("/v2/asset-distribution")
def asset_distribution_v2(payload: AssetDistributionV2Payload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {
        "data": data_service.get_asset_distribution_page_v2(
            _ctx(payload),
            object_types=payload.object_types,
            page=payload.page,
            page_size=payload.page_size,
            search=payload.search,
            unique_serial_only=payload.unique_serial_only,
        )
    }


@app.post("/v2/asset-product-codes")
def asset_product_codes_v2(payload: AssetDistributionV2Payload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {
        "data": data_service.get_asset_product_codes_page_v2(
            _ctx(payload),
            object_types=payload.object_types,
            page=payload.page,
            page_size=payload.page_size,
            search=payload.search,
            unique_serial_only=payload.unique_serial_only,
            pivot_product_code=payload.pivot_product_code,
        )
    }


@app.post("/global-counters")
def global_counters(payload: FilterPayload, _: AuthUser = Depends(require_admin)) -> dict:
    return {"data": data_service.get_global_counters_page(_ctx(payload))}


@app.post("/quality")
def quality(payload: FilterPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": data_service.get_quality_page(_ctx(payload))}


@app.post("/investigate/site")
def investigate_site(payload: SiteInvestigationPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": data_service.get_site_investigation(_ctx(payload), payload.site_id, payload.object_type)}


@app.post("/investigate/serial")
def investigate_serial(payload: SerialInvestigationPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": data_service.get_serial_investigation(payload.serial_number)}


@app.post("/investigate/snapshot")
def investigate_snapshot(payload: SnapshotInvestigationPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": data_service.get_analytics_snapshot_investigation(_ctx(payload), payload.snapshot_date)}


@app.post("/investigate/object-type")
def investigate_object_type(payload: ObjectTypeInvestigationPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": data_service.get_statistics_object_type_investigation(_ctx(payload), payload.object_type)}


@app.get("/vendors")
def vendors(_: AuthUser = Depends(get_current_user)) -> dict:
    for name in SUPPORTED_VENDORS:
        ensure_vendor_scaffold(name)
    return {"data": {"vendors": [vendor_status(v) for v in SUPPORTED_VENDORS]}}


@app.post("/replacements")
def replacements(payload: ReplacementsPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {
        "data": replacement_analytics_service.get_page(
            _ctx(payload), payload.compare_date_1, payload.compare_date_2
        )
    }


@app.post("/risk-cards")
def risk_cards(payload: FilterPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": risk_cards_service.get_page(_ctx(payload))}


@app.post("/investigate/patterns")
def investigate_patterns(payload: SerialPatternsPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {
        "data": serial_patterns_service.investigate(
            _ctx(payload), payload.prefix_length, payload.min_occurrences
        )
    }


@app.post("/spares/tracking")
def spares_tracking(payload: SparesPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": spares_tracking_service.get_dashboard(_ctx(payload), payload.horizon_days)}


@app.get("/assistant/status")
def assistant_status(_: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": openai_agent_service.status()}


@app.post("/search/platform")
def search_platform(payload: PlatformSearchPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    query = (payload.query or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")
    return {"data": platform_search_service.search(_ctx(payload), query)}


@app.get("/search/web")
def search_web(
    q: str = "",
    language: str = "Français",
    max_results: int = 8,
    _: AuthUser = Depends(get_current_user),
) -> dict:
    query = (q or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="q is required")
    payload = web_search_service.search(query, language=language, max_results=max_results)
    return {
        "data": {
            **web_search_service.build_meta(payload),
            "results": [
                {
                    "title": row.get("title"),
                    "snippet": row.get("snippet"),
                    "url": row.get("url"),
                }
                for row in (payload.get("results") or [])
            ],
        }
    }


@app.post("/kpi/site-timeseries")
def site_kpi_timeseries(payload: SiteKpiPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    ctx = _ctx(payload)
    timeseries_kpi_service.ingest_from_lake(ctx, limit_sites=2000)
    return {
        "data": timeseries_kpi_service.get_site_series(
            payload.site_id,
            ctx.vendor or "nokia",
            payload.metrics or None,
            payload.days,
        )
    }


@app.post("/kpi/ingest")
def kpi_ingest(payload: FilterPayload, _: AuthUser = Depends(require_admin)) -> dict:
    return {"data": timeseries_kpi_service.ingest_from_lake(_ctx(payload))}


@app.post("/kpi/critical-sites")
def kpi_critical_sites(payload: FilterPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    ctx = _ctx(payload)
    timeseries_kpi_service.ingest_from_lake(ctx, limit_sites=2000)
    return {"data": timeseries_kpi_service.get_critical_sites(ctx.vendor or "nokia")}


@app.post("/rag/search")
def rag_search(payload: RagSearchPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    rag_service.seed_defaults()
    return {"data": rag_service.search(payload.query, vendor=payload.vendor, top_k=payload.top_k)}


@app.post("/rag/ingest")
def rag_ingest(payload: RagIngestPayload, _: AuthUser = Depends(require_admin)) -> dict:
    ok = rag_service.ingest_document(payload.title, payload.content, payload.vendor, payload.category)
    return {"data": {"ingested": ok}}


@app.post("/rag/seed")
def rag_seed(_: AuthUser = Depends(require_admin)) -> dict:
    return {"data": {"seeded": rag_service.seed_defaults()}}


@app.post("/investigate/site/ai-rca")
def investigate_site_ai_rca(payload: SiteInvestigationPayload, user: AuthUser = Depends(get_current_user)) -> dict:
    ctx = _ctx(payload)
    platform_activity_service.log_assistant_query(user_id=user.id, question=f"RCA site {payload.site_id}")
    rca = build_site_rca(ctx, payload.site_id)
    insight = assistant_intelligence_service.compose(
        ctx,
        f"RCA complète et analyse premium du site {payload.site_id}",
        [],
    )
    return {"data": {"rca": rca, "narrative": insight}}


@app.post("/assistant")
def assistant(payload: AssistantQuestion, user: AuthUser = Depends(get_current_user)) -> dict:
    platform_activity_service.log_assistant_query(user_id=user.id, question=payload.question)
    return {"data": data_service.ask_assistant(payload.question)}


def _history_from_payload(payload: AssistantInsightPayload) -> list[dict]:
    return [{"role": m.role, "content": m.content} for m in (payload.history or [])]


@app.post("/assistant/insight")
def assistant_insight(payload: AssistantInsightPayload, user: AuthUser = Depends(get_current_user)) -> dict:
    ctx = _ctx(payload)
    platform_activity_service.log_assistant_query(
        user_id=user.id,
        question=payload.question,
        context_summary=build_filter_context_summary(ctx),
    )
    result = assistant_file_service.build_insight(
        ctx,
        payload.question,
        [],
        web_search=False,
        history=_history_from_payload(payload),
    )
    if payload.conversation_id:
        result["conversation_id"] = payload.conversation_id
    return {"data": result}


@app.get("/assistant/conversations")
def list_assistant_conversations(user: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": conversation_history_service.list_conversations(user.id)}


@app.post("/assistant/conversations")
def create_assistant_conversation(
    payload: CreateConversationPayload,
    user: AuthUser = Depends(get_current_user),
) -> dict:
    return {"data": conversation_history_service.create_conversation(user.id, payload.title)}


@app.get("/assistant/conversations/{conversation_id}")
def get_assistant_conversation(conversation_id: str, user: AuthUser = Depends(get_current_user)) -> dict:
    conversation = conversation_history_service.get_conversation(user.id, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"data": conversation}


@app.put("/assistant/conversations/{conversation_id}")
def sync_assistant_conversation(
    conversation_id: str,
    payload: ConversationSyncPayload,
    user: AuthUser = Depends(get_current_user),
) -> dict:
    data = payload.model_dump()
    data["id"] = conversation_id
    return {"data": conversation_history_service.sync_conversation(user.id, data)}


@app.delete("/assistant/conversations/{conversation_id}")
def delete_assistant_conversation(conversation_id: str, user: AuthUser = Depends(get_current_user)) -> dict:
    deleted = conversation_history_service.delete_conversation(user.id, conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"data": {"deleted": True}}


@app.patch("/assistant/conversations/{conversation_id}/pin")
def pin_assistant_conversation(conversation_id: str, user: AuthUser = Depends(get_current_user)) -> dict:
    if not conversation_history_service.toggle_pin(user.id, conversation_id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"data": {"pinned": True}}


@app.post("/assistant/insight-with-files")
async def assistant_insight_with_files(
    question: str = Form(""),
    payload_json: str = Form(...),
    files: list[UploadFile] = File(default=[]),
    web_search: str = Form("false"),
    user: AuthUser = Depends(get_current_user),
) -> dict:
    try:
        payload_data = json.loads(payload_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid payload_json: {exc}") from exc

    payload = AssistantInsightPayload(**payload_data)
    ctx = _ctx(payload)
    platform_activity_service.log_assistant_query(
        user_id=user.id,
        question=question or payload.question,
        context_summary=build_filter_context_summary(ctx),
    )

    file_pairs: list[tuple[str, bytes]] = []
    for upload in files:
        name = Path(upload.filename or "upload").name
        content = await upload.read()
        if content:
            file_pairs.append((name, content))
        await upload.close()

    if not file_pairs and not (question or payload.question).strip():
        raise HTTPException(status_code=400, detail="Question or at least one file is required.")

    web_search_enabled = web_search.strip().lower() in {"1", "true", "yes", "on"}
    history = _history_from_payload(payload)
    result = assistant_file_service.build_insight(
        ctx,
        question or payload.question,
        file_pairs,
        web_search=web_search_enabled,
        history=history,
    )
    if payload.conversation_id:
        result["conversation_id"] = payload.conversation_id
    return {"data": result}


@app.post("/anomalies")
def anomalies(payload: AnomalyPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": data_service.get_anomaly_alerts(_ctx(payload), replacement_threshold=payload.replacement_threshold)}


@app.post("/ai-report")
def ai_report(payload: FilterPayload, _: AuthUser = Depends(require_admin)) -> dict:
    return {"data": data_service.get_ai_report(_ctx(payload))}


@app.post("/spares")
def spares(payload: SparesPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {
        "data": data_service.get_spares_dimensioning(
            _ctx(payload), horizon_days=payload.horizon_days, service_level=payload.service_level
        )
    }


@app.post("/clustering")
def clustering(payload: ClusteringPayload, _: AuthUser = Depends(require_admin)) -> dict:
    return {"data": data_service.get_site_clustering(_ctx(payload), n_clusters=payload.n_clusters)}


@app.post("/ops/summary")
def ops_summary(payload: FilterPayload, _: AuthUser = Depends(require_admin)) -> dict:
    return {"data": data_service.get_operational_summary(_ctx(payload))}


@app.get("/ops/query-metrics")
def ops_query_metrics(_: AuthUser = Depends(require_admin)) -> dict:
    return {"data": get_query_observability()}


@app.get("/ops/http-metrics")
def ops_http_metrics(_: AuthUser = Depends(require_admin)) -> dict:
    return {"data": metrics_service.http_summary()}


@app.get("/ops/cache-stats")
def ops_cache_stats(_: AuthUser = Depends(require_admin)) -> dict:
    return {"data": cache_service.stats()}


@app.get("/ops/feature-flags")
def ops_feature_flags(_: AuthUser = Depends(require_admin)) -> dict:
    return {"data": feature_flags.as_dict()}


@app.get("/metrics")
def prometheus_metrics():
    from starlette.responses import PlainTextResponse

    return PlainTextResponse(metrics_service.prometheus_text(), media_type="text/plain; version=0.0.4")


@app.post("/ops/client-vitals")
async def client_vitals(request: Request, payload: dict) -> dict:
    import logging

    rate_limiter.check(request, namespace="client_vitals", max_requests=120)
    logging.getLogger("ran.vitals").info(json.dumps({"event": "client_vitals", **payload}))
    return {"data": {"ok": True}}


@app.post("/ops/client-errors")
async def client_errors(request: Request, payload: dict) -> dict:
    import logging

    rate_limiter.check(request, namespace="client_errors", max_requests=60)
    logging.getLogger("ran.errors").error(json.dumps({"event": "client_error", **payload}))
    return {"data": {"ok": True}}


@app.get("/trust/anchors")
def trust_anchors(_: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": trust_service.list_anchors()}


@app.post("/trust/anchor")
def trust_anchor(payload: TrustSnapshotPayload, _: AuthUser = Depends(require_admin)) -> dict:
    return {"data": trust_service.anchor_snapshot(payload.snapshot_date, payload.snapshot_path or None)}


@app.post("/trust/anchor-latest")
def trust_anchor_latest(_: AuthUser = Depends(require_admin)) -> dict:
    return {"data": trust_service.anchor_latest_snapshot()}


@app.post("/trust/verify")
def trust_verify(payload: TrustSnapshotPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": trust_service.verify_snapshot(payload.snapshot_date, payload.snapshot_path or None)}


@app.post("/guardian/overview")
def guardian_overview(payload: FilterPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": guardian_orchestrator.get_guardian_overview(_ctx(payload))}


@app.post("/guardian/integrity")
def guardian_integrity(payload: TrustSnapshotPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": integrity_service.get_snapshot_health(payload.snapshot_date)}


@app.post("/guardian/verify")
def guardian_verify(payload: TrustSnapshotPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": integrity_service.verify_snapshot_integrity(payload.snapshot_date)}


@app.post("/guardian/changes")
def guardian_changes(payload: DeltaComparePayload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {
        "data": change_intelligence_service.compare_snapshots(
            payload.compare_date_1,
            payload.compare_date_2,
            vendor=payload.vendor,
        )
    }


@app.post("/guardian/anomalies")
def guardian_anomalies(payload: FilterPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    ctx = _ctx(payload)
    dates = sorted(ctx.effective_dates or ctx.selected_dates or [])
    target = dates[-1] if dates else None
    rows = anomaly_intelligence_service.detect_anomalies(ctx, snapshot_date=target, persist=True) if target else []
    return {"data": {"snapshot_date": target, "count": len(rows), "rows": rows[:100]}}


@app.post("/guardian/risks")
def guardian_risks(payload: FilterPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    ctx = _ctx(payload)
    dates = sorted(ctx.effective_dates or ctx.selected_dates or [])
    target = dates[-1] if dates else None
    rows = predictive_risk_service.compute_risk_predictions(ctx, snapshot_date=target, persist=True) if target else []
    return {"data": {"snapshot_date": target, "count": len(rows), "rows": rows[:50]}}


@app.post("/guardian/run")
async def guardian_run(payload: ProcessSnapshotsPayload, _: AuthUser = Depends(require_admin)) -> dict:
    results = []
    for snapshot_date in payload.snapshot_dates:
        try:
            result = await asyncio.to_thread(
                guardian_orchestrator.run_after_ingest,
                snapshot_date,
                vendor="nokia",
            )
            results.append(result)
        except Exception as exc:
            results.append({"snapshot_date": snapshot_date, "error": str(exc)})
    return {"data": results}


@app.get("/integrations/powerbi/status")
def powerbi_status(_: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": powerbi_export_service.status()}


@app.post("/integrations/powerbi/sync")
async def powerbi_sync(_: AuthUser = Depends(require_admin)) -> dict:
    result = await asyncio.to_thread(powerbi_export_service.sync_export)
    return {"data": result}


@app.get("/integrations/powerbi/status")
def powerbi_status(_: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": powerbi_export_service.status()}


@app.post("/integrations/powerbi/sync")
async def powerbi_sync(_: AuthUser = Depends(require_admin)) -> dict:
    result = await asyncio.to_thread(powerbi_export_service.sync_export)
    return {"data": result}
