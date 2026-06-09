import { getAccessToken, getRefreshToken, saveSession, type AuthSession, type AuthUser } from "@/lib/auth";
import type { ApiEnvelope, FilterPayload, PaginatedQuery } from "@/lib/types";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");

function toErrorMessage(path: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `API unreachable for ${path}. Check NEXT_PUBLIC_API_BASE_URL and backend availability. Details: ${message}`;
}

function authHeaders(includeJson = true): HeadersInit {
  const headers: Record<string, string> = {};
  if (includeJson) headers["Content-Type"] = "application/json";
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function formatApiDetail(detail: unknown): string {
  if (!detail) return "";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          const loc = "loc" in item && Array.isArray(item.loc) ? item.loc.join(".") : "";
          return loc ? `${loc}: ${String(item.msg)}` : String(item.msg);
        }
        return JSON.stringify(item);
      })
      .join(" · ");
  }
  if (typeof detail === "object") return JSON.stringify(detail);
  return String(detail);
}

async function parseApiError(response: Response, path: string): Promise<never> {
  let detail = "";
  try {
    const body = (await response.json()) as { detail?: unknown };
    const formatted = formatApiDetail(body.detail);
    detail = formatted ? ` — ${formatted}` : "";
  } catch {
    detail = "";
  }
  throw new Error(`API request failed: ${path} (${response.status})${detail}`);
}

async function postJson<T>(path: string, payload: unknown, auth = true): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: auth ? authHeaders() : { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(toErrorMessage(path, error));
  }

  if (!response.ok) {
    await parseApiError(response, path);
  }

  const envelope = (await response.json()) as ApiEnvelope<T>;
  return envelope.data;
}

async function getJson<T>(path: string, auth = true): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "GET",
      headers: auth ? authHeaders(false) : undefined,
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(toErrorMessage(path, error));
  }
  if (!response.ok) {
    await parseApiError(response, path);
  }
  const envelope = (await response.json()) as ApiEnvelope<T>;
  return envelope.data;
}

async function putJson<T>(path: string, payload: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(toErrorMessage(path, error));
  }
  if (!response.ok) {
    await parseApiError(response, path);
  }
  const envelope = (await response.json()) as ApiEnvelope<T>;
  return envelope.data;
}

async function deleteJson<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "DELETE",
      headers: authHeaders(false),
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(toErrorMessage(path, error));
  }
  if (!response.ok) {
    await parseApiError(response, path);
  }
  const envelope = (await response.json()) as ApiEnvelope<T>;
  return envelope.data;
}

async function patchJson<T>(path: string, payload: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(toErrorMessage(path, error));
  }
  if (!response.ok) {
    await parseApiError(response, path);
  }
  const envelope = (await response.json()) as ApiEnvelope<T>;
  return envelope.data;
}

export function getFilterOptions(payload: FilterPayload) {
  return postJson<{
    date_options: string[];
    file_options: { snapshot_date: string; source_file: string }[];
    site_options: { snapshot_date: string; source_file: string; site_id: string; site_name: string }[];
    total_sites: number;
    total_xml: number;
  }>("/filters/options", payload);
}

export function getDashboard(payload: FilterPayload) {
  return postJson<{
    period: { latest_date: string; oldest_date: string; snapshot_count: number };
    kpis: Record<string, number>;
    summary: Record<string, unknown>[];
    equipment_summary: Record<string, unknown>[];
  }>("/dashboard", payload);
}

export function getSites(payload: FilterPayload) {
  return postJson<Record<string, unknown>[]>("/sites", payload);
}

export function getInventory(payload: FilterPayload, object_types: string[]) {
  return postJson<{
    object_types: string[];
    rows: Record<string, unknown>[];
  }>("/inventory", { ...payload, object_types });
}

export function getInventoryV2(payload: FilterPayload, query: PaginatedQuery, object_types: string[] = []) {
  return postJson<{
    object_types: string[];
    rows: Record<string, unknown>[];
    total_count: number;
    page: number;
    page_size: number;
    summary: Record<string, unknown>;
    charts: {
      by_type: Record<string, unknown>[];
      by_site: Record<string, unknown>[];
    };
  }>("/v2/inventory", { ...payload, ...query, object_types });
}

export function getDelta() {
  return postJson<{
    metrics: Record<string, unknown>[];
    numeric_metrics: Record<string, unknown>[];
    site_changes: Record<string, unknown>[];
    summary: Record<string, number>;
  }>("/delta", {});
}

export function getDeltaCompare(
  payload: FilterPayload,
  compare_date_1: string,
  compare_date_2: string,
) {
  return postJson<{
    comparison: Record<string, unknown>[];
    details: Record<string, unknown>[];
  }>("/delta/compare", { ...payload, compare_date_1, compare_date_2 });
}

export function getStatistics(payload: FilterPayload) {
  return postJson<Record<string, unknown>[]>("/statistics", payload);
}

export function getPrediction(payload: FilterPayload) {
  return postJson<Record<string, unknown>[]>("/prediction", payload);
}

export function getAnalytics(payload: FilterPayload) {
  return postJson<{
    summary: Record<string, unknown>[];
    equipment: Record<string, unknown>[];
  }>("/analytics", payload);
}

export function getTemporalChanges(payload: FilterPayload) {
  return postJson<{
    rows: Record<string, unknown>[];
    summary: Record<string, unknown>;
  }>("/temporal-changes", payload);
}

export function getAssetDistribution(payload: FilterPayload) {
  return postJson<{
    rows: Record<string, unknown>[];
    summary: Record<string, unknown>;
  }>("/asset-distribution", payload);
}

export function getAssetDistributionV2(payload: FilterPayload, query: PaginatedQuery, object_types: string[] = []) {
  return postJson<{
    rows: Record<string, unknown>[];
    total_count: number;
    page: number;
    page_size: number;
    object_types: string[];
    summary: Record<string, unknown>;
  }>("/v2/asset-distribution", { ...payload, ...query, object_types });
}

export function getAssetProductCodesV2(
  payload: FilterPayload,
  query: PaginatedQuery & { unique_serial_only?: boolean },
  object_types: string[] = [],
) {
  return postJson<{
    rows: Record<string, unknown>[];
    total_count: number;
    page: number;
    page_size: number;
    unique_serial_only: boolean;
  }>("/v2/asset-product-codes", { ...payload, ...query, object_types, unique_serial_only: query.unique_serial_only ?? true });
}

export function getGlobalCounters(payload: FilterPayload) {
  return postJson<{
    rows: Record<string, unknown>[];
    summary: Record<string, unknown>;
  }>("/global-counters", payload);
}

export function getQuality(payload: FilterPayload) {
  return postJson<{
    rows: Record<string, unknown>[];
    summary: Record<string, unknown>;
  }>("/quality", payload);
}

export function investigateSite(payload: FilterPayload, site_id: string, object_type = "") {
  return postJson<{
    site_history: Record<string, unknown>[];
    equipment: Record<string, unknown>[];
  }>("/investigate/site", { ...payload, site_id, object_type });
}

export function investigateSerial(payload: FilterPayload, serial_number: string) {
  return postJson<{
    rows: Record<string, unknown>[];
  }>("/investigate/serial", { ...payload, serial_number });
}

export function investigateObjectType(payload: FilterPayload, object_type: string) {
  return postJson<{
    available: boolean;
    reason?: string;
    object_type?: string;
    summary?: Record<string, number>;
    top_sites?: { site_id: string; equipment_count: number }[];
    signals?: { level: string; fr: string; en: string }[];
    narrative?: { fr: string; en: string };
  }>("/investigate/object-type", { ...payload, object_type });
}

export function investigateAnalyticsSnapshot(payload: FilterPayload, snapshot_date: string) {
  return postJson<{
    available: boolean;
    reason?: string;
    snapshot_date?: string;
    sites?: Record<string, number>;
    cells?: Record<string, number>;
    equipment?: {
      total: number;
      object_type_count: number;
      by_type: { object_type: string; equipment_count: number }[];
    };
    comparison?: Record<string, number | string> | null;
    signals?: { level: string; fr: string; en: string }[];
    narrative?: { fr: string; en: string };
  }>("/investigate/snapshot", { ...payload, snapshot_date });
}

export function askAssistant(question: string) {
  return postJson<{
    message: string;
    intent: string;
    rows: Record<string, unknown>[];
  }>("/assistant", { question });
}

export type AssistantInsightResponse = {
  message: string;
  intent: string;
  status?: string;
  rows: Record<string, unknown>[];
  details?: Record<string, unknown>[];
  sources?: Record<string, unknown>[];
  suggested_questions?: string[];
  sql_guardrails?: Record<string, unknown>;
  file_reports?: Record<string, unknown>[];
  ai_engine?: string;
  ai_model?: string;
  tools_used?: string[];
  architecture?: string;
};

export type AssistantEngineStatus = {
  enabled: boolean;
  engine: "openai" | "local";
  model: string | null;
  brand: string;
  tools: string[];
  architecture: string;
  claude?: { enabled: boolean; model: string | null; role?: string };
  rag?: { engine: string; procedures: string };
  timeseries?: { engine: string; metrics: string[] };
};

export function getAssistantEngineStatus() {
  return getJson<AssistantEngineStatus>("/assistant/status");
}

export type SiteKpiTimeseries = {
  site_id: string;
  vendor: string;
  metrics: string[];
  series: Record<string, { time: string; value: number }[]>;
  violations: { metric: string; value: number; threshold: number; severity: string; time: string }[];
  thresholds: Record<string, { op: string; value: number; severity: string }>;
};

export function getSiteKpiTimeseries(payload: FilterPayload & { site_id: string; metrics?: string[]; days?: number }) {
  return postJson<SiteKpiTimeseries>("/kpi/site-timeseries", payload);
}

export type AssistantHistoryTurn = { role: "user" | "assistant"; content: string };

export type ServerConversationMeta = {
  id: string;
  title: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  preview: string;
};

export type ServerConversation = ServerConversationMeta & {
  userId: number;
  messages: Record<string, unknown>[];
};

export function askAssistantInsight(
  payload: FilterPayload,
  question: string,
  options?: { conversationId?: string; history?: AssistantHistoryTurn[] },
) {
  return postJson<AssistantInsightResponse>("/assistant/insight", {
    ...payload,
    question,
    conversation_id: options?.conversationId ?? "",
    history: options?.history ?? [],
  });
}

export function listAssistantConversations() {
  return getJson<ServerConversationMeta[]>("/assistant/conversations");
}

export function createAssistantConversation(title = "Nouvelle conversation") {
  return postJson<ServerConversation>("/assistant/conversations", { title });
}

export function getAssistantConversation(id: string) {
  return getJson<ServerConversation>(`/assistant/conversations/${id}`);
}

export function syncAssistantConversation(
  id: string,
  payload: { title: string; pinned: boolean; messages: Record<string, unknown>[] },
) {
  return putJson<ServerConversation>(`/assistant/conversations/${id}`, { id, ...payload });
}

export function deleteAssistantConversation(id: string) {
  return deleteJson<{ deleted: boolean }>(`/assistant/conversations/${id}`);
}

export function toggleAssistantConversationPin(id: string) {
  return patchJson<{ pinned: boolean }>(`/assistant/conversations/${id}/pin`, {});
}

export async function askAssistantInsightWithFiles(
  payload: FilterPayload,
  question: string,
  files: File[],
  webSearch = false,
  options?: { conversationId?: string; history?: AssistantHistoryTurn[] },
): Promise<AssistantInsightResponse> {
  const path = "/assistant/insight-with-files";
  const form = new FormData();
  form.append("question", question);
  form.append(
    "payload_json",
    JSON.stringify({
      ...payload,
      question,
      conversation_id: options?.conversationId ?? "",
      history: options?.history ?? [],
    }),
  );
  form.append("web_search", webSearch ? "true" : "false");
  files.forEach((file) => form.append("files", file));

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: authHeaders(false),
      body: form,
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(toErrorMessage(path, error));
  }

  if (!response.ok) {
    await parseApiError(response, path);
  }

  const envelope = (await response.json()) as ApiEnvelope<AssistantInsightResponse>;
  return envelope.data;
}

export function getAnomalies(payload: FilterPayload, replacement_threshold = 3) {
  return postJson<{
    rows: Record<string, unknown>[];
    site_summary: Record<string, unknown>[];
    summary: {
      total: number;
      critical: number;
      high: number;
      medium: number;
      low: number;
      sites_impacted: number;
    };
    severity_chart: { level: string; count: number }[];
    ml: {
      available: boolean;
      summary: { sites: number; anomalies: number; contamination: number };
      feature_importance: { feature: string; importance: number }[];
      top_sites: Record<string, unknown>[];
      ml_only: Record<string, unknown>[];
    };
    params: { replacement_threshold: number; snapshots: number };
  }>("/anomalies", { ...payload, replacement_threshold });
}

export type AiReportSection = {
  id: string;
  title: { fr: string; en: string };
  lines: { fr: string[]; en: string[] };
};

export type AiReport = {
  generated_at: string;
  period: { start: string; end: string; snapshots: number };
  metrics: Record<string, number>;
  executive: { fr: string; en: string };
  sections: AiReportSection[];
  trend: Record<string, unknown>[];
  top_risks: Record<string, unknown>[];
};

export function getAiReport(payload: FilterPayload) {
  return postJson<AiReport>("/ai-report", payload);
}

export function getSpares(payload: FilterPayload, horizon_days = 90, service_level = 0.95) {
  return postJson<{
    rows: Record<string, unknown>[];
    summary: {
      product_lines: number;
      total_installed: number;
      total_replacements: number;
      total_recommended: number;
      horizon_days: number;
      period_days: number;
    };
    top_chart: { product_code: string; recommended_spares: number; replacements: number }[];
    params: { horizon_days: number; service_level: number };
  }>("/spares", { ...payload, horizon_days, service_level });
}

export function getClustering(payload: FilterPayload, n_clusters = 4) {
  return postJson<{
    available: boolean;
    points: Record<string, unknown>[];
    clusters: Record<string, unknown>[];
    health_distribution: { band: string; count: number }[];
    summary: { sites: number; clusters: number; explained_variance_pct?: number };
  }>("/clustering", { ...payload, n_clusters });
}

export function getOperationalSummary(payload: FilterPayload) {
  return postJson<Record<string, unknown>>("/ops/summary", payload);
}

export function getQueryMetrics() {
  return getJson<Record<string, unknown>>("/ops/query-metrics");
}

export function getTrustAnchors() {
  return getJson<Record<string, unknown>[]>("/trust/anchors");
}

export function anchorLatestTrust() {
  return postJson<Record<string, unknown>>("/trust/anchor-latest", {});
}

export function getVendors() {
  return getJson<{ vendors: { vendor: string; lake_ready: boolean; snapshot_count: number; phase: string }[] }>("/vendors");
}

export function getReplacements(payload: FilterPayload, compare_date_1 = "", compare_date_2 = "") {
  return postJson<{
    vendor: string;
    reason?: string;
    summary: Record<string, number | string>;
    by_type_between_periods: Record<string, unknown>[];
    timeline_by_type: Record<string, unknown>[];
    top_changes: Record<string, unknown>[];
  }>("/replacements", { ...payload, compare_date_1, compare_date_2 });
}

export function getRiskCards(payload: FilterPayload) {
  return postJson<{
    vendor: string;
    summary: Record<string, number>;
    rows: Record<string, unknown>[];
  }>("/risk-cards", payload);
}

export function getSerialPatterns(payload: FilterPayload, prefix_length = 6, min_occurrences = 3) {
  return postJson<{
    available: boolean;
    reason?: string;
    patterns: Record<string, unknown>[];
    summary: Record<string, unknown>;
    narrative?: { fr: string; en: string };
  }>("/investigate/patterns", { ...payload, prefix_length, min_occurrences });
}

export function getSparesTracking(payload: FilterPayload, horizon_days = 90, service_level = 0.95) {
  return postJson<{
    vendor: string;
    linked: boolean;
    inventory_count: number;
    summary: Record<string, unknown>;
    rows: Record<string, unknown>[];
    alerts: Record<string, unknown>[];
    note: string;
  }>("/spares/tracking", { ...payload, horizon_days, service_level });
}

export async function deleteSnapshots(snapshot_dates: string[]) {
  return postJson<{
    deleted_count: number;
    deleted: {
      snapshot_date: string;
      xml_folder_removed: boolean;
      lake_partitions_removed: string[];
    }[];
    not_found: string[];
    processing_seconds: number;
    total_sites: number;
    total_equipment: number;
    snapshot_count: number;
  }>("/snapshots/delete", { snapshot_dates });
}

export async function uploadXmlSnapshot(snapshot_date: string, files: File[]) {
  const path = "/ingest/xml";
  if (!files.length) {
    throw new Error("No XML files selected.");
  }
  const formData = new FormData();
  formData.append("snapshot_date", snapshot_date);
  files.forEach((file) => formData.append("files", file));

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: authHeaders(false),
      body: formData,
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(toErrorMessage(path, error));
  }

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`API request failed: ${path} (${response.status}) ${details}`);
  }

  const envelope = (await response.json()) as ApiEnvelope<{
    snapshot_date: string;
    target_path: string;
    uploaded_count: number;
    uploaded_files: string[];
    skipped_files: string[];
    processed: boolean;
    processing: {
      snapshot_date: string;
      snapshot_folder: string;
      xml_count: number;
      sites_count: number;
      equipment_count: number;
      counters_count: number;
      completeness_count: number;
      total_sites: number;
      total_equipment: number;
      snapshot_count: number;
      processing_seconds: number;
    } | null;
    processing_error: string | null;
  }>;
  return envelope.data;
}

export function getJobProfiles() {
  return getJson<{ id: string; fr: string; en: string }[]>("/auth/job-profiles", false);
}

export function adminCreateUser(payload: {
  full_name: string;
  email: string;
  phone: string;
  job_profile: string;
  department: string;
  employee_id?: string;
  password?: string;
}) {
  return postJson<{
    user_id: number;
    email: string;
    phone: string;
    message: string;
    temporary_password: string;
    personal_access_key: string;
    verification: {
      email_expires_at: string;
      phone_expires_at: string;
      dev_email_code?: string;
      dev_phone_code?: string;
    };
  }>("/auth/users/create", payload);
}

export function adminVerifyUser(userId: number, payload: { email_code: string; phone_code: string }) {
  return postJson<{ user: AuthUser; message: string }>(`/auth/users/${userId}/verify-provision`, payload);
}

export function resendProvisionOtp(userId: number) {
  return postJson<{
    user_id: number;
    verification: {
      email_expires_at: string;
      phone_expires_at: string;
      dev_email_code?: string;
      dev_phone_code?: string;
    };
  }>(`/auth/users/${userId}/resend-provision-otp`, {});
}

export function activateUserAccount(payload: { email: string; email_code: string; phone_code: string }) {
  return postJson<{ user: AuthUser; message: string }>("/auth/activate", payload, false);
}

export function signupUser(payload: {
  email: string;
  phone: string;
  password: string;
  full_name: string;
  job_profile: string;
  signup_access_key: string;
}) {
  return postJson<{
    user_id: number;
    message: string;
    personal_access_key?: string;
    notifications?: { email_otp?: boolean; sms_otp?: boolean; welcome_email?: boolean };
    verification: {
      email_expires_at: string;
      phone_expires_at?: string;
      dev_email_code?: string;
      dev_phone_code?: string;
    };
  }>("/auth/signup", payload, false);
}

export function resendSignupOtp(userId: number) {
  return postJson<{
    user_id: number;
    message: string;
    notifications?: { email_otp?: boolean; sms_otp?: boolean };
    verification: {
      email_expires_at: string;
      phone_expires_at?: string;
      dev_email_code?: string;
      dev_phone_code?: string;
    };
  }>(`/auth/signup/${userId}/resend-otp`, {}, false);
}

export function getNotificationsStatus() {
  return getJson<{ enabled: boolean; email_ready: boolean; sms_ready: boolean }>("/auth/notifications/status", false);
}

export function signupSetPhone(userId: number, phone: string) {
  return postJson<{
    user_id: number;
    phone: string;
    message: string;
    notifications?: { sms_otp?: boolean };
    verification: { phone_expires_at: string; dev_phone_code?: string };
  }>(`/auth/signup/${userId}/phone`, { phone }, false);
}

export function verifySignup(payload: { user_id: number; email_code: string; phone_code: string }) {
  return postJson<AuthSession & { session_access_key?: string }>("/auth/signup/verify", payload, false);
}

export function loginUserStep1(payload: { email: string; password: string }) {
  return postJson<{
    user_id: number;
    mfa_required: boolean;
    channels: string[];
    verification: {
      email_expires_at: string;
      phone_expires_at: string;
      dev_email_code?: string;
      dev_phone_code?: string;
    };
  }>("/auth/login/user", payload, false);
}

export function loginUserStep2(payload: { user_id: number; channel: string; code?: string; access_key?: string }) {
  return postJson<AuthSession & { session_access_key?: string }>("/auth/login/user/mfa", payload, false);
}

export function loginAdminStep1(payload: { email: string; password: string; admin_access_key: string }) {
  return postJson<{
    user_id: number;
    mfa_required: boolean;
    channels: string[];
    verification: { email_expires_at: string; dev_email_code?: string };
  }>("/auth/login/admin", payload, false);
}

export function loginAdminStep2(payload: { user_id: number; email_code: string }) {
  return postJson<AuthSession>("/auth/login/admin/verify", payload, false);
}

export function fetchAuthMe() {
  return getJson<AuthUser>("/auth/me");
}

export async function logoutSession() {
  const refresh = getRefreshToken();
  if (!refresh) return;
  await postJson("/auth/logout", { refresh_token: refresh }, false);
}

export function listAuthUsers() {
  return getJson<Record<string, unknown>[]>("/auth/users");
}

export function createAccessKey(payload: { key_label: string; key_type: string; max_uses: number }) {
  return postJson<{ access_key: string; key_label: string; key_type: string; max_uses: number }>("/auth/access-keys", payload);
}

export function setUserActive(userId: number, is_active: boolean) {
  return patchJson<AuthUser>(`/auth/users/${userId}/status`, { is_active });
}

export async function refreshAuthSession(): Promise<AuthSession | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  const session = await postJson<AuthSession>("/auth/refresh", { refresh_token: refresh }, false);
  saveSession(session);
  return session;
}
