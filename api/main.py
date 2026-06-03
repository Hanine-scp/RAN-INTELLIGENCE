from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.schemas import AssistantQuestion, FilterPayload, InventoryPayload
from src.services.data_service import FilterContext, data_service, lake_ready

app = FastAPI(title="RAN Intelligence API", version="1.0.0")

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
        site_search=payload.site_search,
        date_search=payload.date_search,
        language=payload.language,
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
def ready() -> dict[str, bool]:
    return {"ready": lake_ready()}


@app.post("/filters/options")
def filter_options(payload: FilterPayload) -> dict:
    return {"data": data_service.get_filter_options(_ctx(payload))}


@app.post("/dashboard")
def dashboard(payload: FilterPayload) -> dict:
    return {"data": data_service.get_dashboard(_ctx(payload))}


@app.post("/sites")
def sites(payload: FilterPayload) -> dict:
    return {"data": data_service.get_sites_page(_ctx(payload))}


@app.post("/inventory")
def inventory(payload: InventoryPayload) -> dict:
    return {
        "data": data_service.get_inventory_page(
            _ctx(payload),
            payload.object_types,
        )
    }


@app.post("/delta")
def delta() -> dict:
    return {"data": data_service.get_delta_page()}


@app.post("/statistics")
def statistics(payload: FilterPayload) -> dict:
    return {"data": data_service.get_statistics_page(_ctx(payload))}


@app.post("/prediction")
def prediction(payload: FilterPayload) -> dict:
    return {"data": data_service.get_prediction_page(_ctx(payload))}


@app.post("/analytics")
def analytics(payload: FilterPayload) -> dict:
    return {"data": data_service.get_analytics_page(_ctx(payload))}


@app.post("/assistant")
def assistant(payload: AssistantQuestion) -> dict:
    return {"data": data_service.ask_assistant(payload.question)}
