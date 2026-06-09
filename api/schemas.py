from typing import Any

from pydantic import BaseModel, Field


class DeleteSnapshotsPayload(BaseModel):
    snapshot_dates: list[str] = Field(default_factory=list)


class FilterPayload(BaseModel):
    selected_dates: list[str] = Field(default_factory=list)
    selected_files: list[str] = Field(default_factory=list)
    selected_sites: list[str] = Field(default_factory=list)
    selected_file_dates: list[str] = Field(default_factory=list)
    effective_dates: list[str] = Field(default_factory=list)
    site_search: str = ""
    date_search: str = ""
    period_start: str = ""
    period_end: str = ""
    smart_missing_serial: bool = False
    smart_duplicates: bool = False
    smart_critical_quality: bool = False
    language: str = "Français"
    vendor: str = "nokia"


class InventoryPayload(FilterPayload):
    object_types: list[str] = Field(default_factory=list)


class PaginatedPayload(FilterPayload):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=500, ge=50, le=2000)
    search: str = ""
    sort_by: str = ""
    sort_direction: str = "asc"


class InventoryV2Payload(PaginatedPayload):
    object_types: list[str] = Field(default_factory=list)


class AssetDistributionV2Payload(PaginatedPayload):
    object_types: list[str] = Field(default_factory=list)
    unique_serial_only: bool = False


class AssistantQuestion(BaseModel):
    question: str


class AssistantHistoryMessage(BaseModel):
    role: str
    content: str


class AssistantInsightPayload(FilterPayload):
    question: str
    conversation_id: str = ""
    history: list[AssistantHistoryMessage] = Field(default_factory=list)


class ConversationSyncPayload(BaseModel):
    id: str
    title: str = "Nouvelle conversation"
    pinned: bool = False
    messages: list[dict[str, Any]] = Field(default_factory=list)


class CreateConversationPayload(BaseModel):
    title: str = "Nouvelle conversation"


class SiteKpiPayload(FilterPayload):
    site_id: str
    metrics: list[str] = Field(default_factory=list)
    days: int = Field(default=30, ge=1, le=365)


class RagSearchPayload(BaseModel):
    query: str
    vendor: str = "nokia"
    top_k: int = Field(default=5, ge=1, le=20)


class RagIngestPayload(BaseModel):
    title: str
    content: str
    vendor: str = "generic"
    category: str = "procedure"


class AnomalyPayload(FilterPayload):
    replacement_threshold: int = Field(default=3, ge=1, le=50)


class SparesPayload(FilterPayload):
    horizon_days: int = Field(default=90, ge=7, le=365)
    service_level: float = Field(default=0.95, ge=0.5, le=0.999)


class ClusteringPayload(FilterPayload):
    n_clusters: int = Field(default=4, ge=2, le=8)


class DeltaComparePayload(FilterPayload):
    compare_date_1: str
    compare_date_2: str


class SiteInvestigationPayload(FilterPayload):
    site_id: str
    object_type: str = ""


class SerialInvestigationPayload(FilterPayload):
    serial_number: str


class SnapshotInvestigationPayload(FilterPayload):
    snapshot_date: str


class ObjectTypeInvestigationPayload(FilterPayload):
    object_type: str


class ReplacementsPayload(FilterPayload):
    compare_date_1: str = ""
    compare_date_2: str = ""


class SerialPatternsPayload(FilterPayload):
    prefix_length: int = Field(default=6, ge=3, le=12)
    min_occurrences: int = Field(default=3, ge=2, le=100)


class TrustSnapshotPayload(BaseModel):
    snapshot_date: str
    snapshot_path: str = ""


class AdminCreateUserPayload(BaseModel):
    full_name: str
    email: str
    phone: str
    job_profile: str
    department: str
    employee_id: str = ""
    password: str = ""


class AdminVerifyUserPayload(BaseModel):
    email_code: str
    phone_code: str


class ActivateUserPayload(BaseModel):
    email: str
    email_code: str
    phone_code: str


class SignupPayload(BaseModel):
    email: str
    password: str
    full_name: str
    job_profile: str
    signup_access_key: str
    phone: str = ""


class SignupPhonePayload(BaseModel):
    phone: str


class SignupVerifyPayload(BaseModel):
    user_id: int
    email_code: str
    phone_code: str


class UserLoginStep1Payload(BaseModel):
    email: str
    password: str


class UserLoginStep2Payload(BaseModel):
    user_id: int
    channel: str
    code: str = ""
    access_key: str = ""


class AdminLoginStep1Payload(BaseModel):
    email: str
    password: str
    admin_access_key: str


class AdminLoginStep2Payload(BaseModel):
    user_id: int
    email_code: str


class RefreshTokenPayload(BaseModel):
    refresh_token: str


class CreateAccessKeyPayload(BaseModel):
    key_label: str
    key_type: str = "signup"
    max_uses: int = Field(default=10, ge=1, le=10000)


class UserStatusPayload(BaseModel):
    is_active: bool


class ApiEnvelope(BaseModel):
    data: Any
