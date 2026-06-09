from config.env_loader import load_auth_env

load_auth_env()

import asyncio
from datetime import datetime
import json
import os
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from api.activity_middleware import PlatformActivityMiddleware
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
    TrustSnapshotPayload,
)
from config.settings import RAW_DATA_PATH
from pipeline.main_pipeline import delete_snapshots, process_uploaded_snapshot
from src.services.auth_service import AuthUser
from src.services.data_service import FilterContext, data_service, get_query_observability, lake_ready
from src.services.platform_activity_service import build_filter_context_summary, platform_activity_service
from src.services.replacement_analytics_service import replacement_analytics_service
from src.services.risk_cards_service import risk_cards_service
from src.services.serial_patterns_service import serial_patterns_service
from src.services.spares_tracking_service import spares_tracking_service
from src.services.trust_service import trust_service
from src.services.assistant_file_service import assistant_file_service
from src.services.assistant_intelligence_service import assistant_intelligence_service
from src.services.conversation_history_service import conversation_history_service
from src.services.openai_agent_service import openai_agent_service
from src.services.rag_service import rag_service
from src.services.ran_anomaly_rules import build_site_rca
from src.services.timeseries_kpi_service import timeseries_kpi_service
from src.services.vendor_lake import SUPPORTED_VENDORS, ensure_vendor_scaffold, vendor_status

app = FastAPI(title="RAN Intelligence API", version="1.0.0")
app.include_router(auth_router)
app.add_middleware(PlatformActivityMiddleware)
_XML_ROOT = Path(os.getenv("DATA_XML_ROOT", str(RAW_DATA_PATH)))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    return {"data": result}


@app.post("/filters/options")
def filter_options(payload: FilterPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": data_service.get_filter_options(_ctx(payload))}


@app.post("/dashboard")
def dashboard(payload: FilterPayload, _: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": data_service.get_dashboard(_ctx(payload))}


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
    result = assistant_intelligence_service.compose(ctx, payload.question, _history_from_payload(payload))
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
