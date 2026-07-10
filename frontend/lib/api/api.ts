import { getAccessToken, getRefreshToken, saveSession, type AuthSession, type AuthUser } from "@/lib/auth";
import { fetchWithRetry, type FetchWithRetryOptions } from "@/lib/api/fetch-client";
import type { ApiEnvelope, FilterPayload, PaginatedQuery } from "@/lib/types";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8010").replace(/\/+$/, "");
const ACCESS_REFRESH_INTERVAL_MS = 20 * 60 * 1000;

let refreshInFlight: Promise<AuthSession | null> | null = null;

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
  if (typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    if (typeof record.code === "string") {
      return String(record.message ?? record.code);
    }
    return JSON.stringify(detail);
  }
  return String(detail);
}

export class ApiFlowError extends Error {
  code: string;
  data: Record<string, unknown>;

  constructor(code: string, message: string, data: Record<string, unknown>) {
    super(message);
    this.name = "ApiFlowError";
    this.code = code;
    this.data = data;
  }
}

async function parseApiError(response: Response, path: string): Promise<never> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (body.detail && typeof body.detail === "object" && !Array.isArray(body.detail)) {
      const detail = body.detail as Record<string, unknown>;
      if (typeof detail.code === "string") {
        throw new ApiFlowError(
          detail.code,
          String(detail.message ?? detail.code),
          detail,
        );
      }
    }
    const formatted = formatApiDetail(body.detail);
    const detail = formatted ? ` — ${formatted}` : "";
    throw new Error(`API request failed: ${path} (${response.status})${detail}`);
  } catch (error) {
    if (error instanceof ApiFlowError || error instanceof Error) {
      throw error;
    }
    throw new Error(`API request failed: ${path} (${response.status})`);
  }
}

export async function refreshAuthSession(): Promise<AuthSession | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const envelope = (await response.json()) as ApiEnvelope<AuthSession>;
    saveSession(envelope.data);
    return envelope.data;
  } catch {
    return null;
  }
}

async function refreshSessionDeduped(): Promise<AuthSession | null> {
  if (!refreshInFlight) {
    refreshInFlight = refreshAuthSession().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function fetchApi(path: string, init: RequestInit = {}, auth = true, options: FetchWithRetryOptions = {}): Promise<Response> {
  const buildInit = (useAuth: boolean): RequestInit => {
    const headers = new Headers(init.headers);
    if (useAuth) {
      const token = getAccessToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }
    if (init.body != null && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return { ...init, headers, cache: "no-store" };
  };

  let response: Response;
  try {
    response = await fetchWithRetry(`${API_BASE_URL}${path}`, buildInit(auth), {
      requestId: crypto.randomUUID(),
      ...options,
    });
  } catch (error) {
    throw new Error(toErrorMessage(path, error));
  }

  if (auth && response.status === 401 && getRefreshToken()) {
    const session = await refreshSessionDeduped();
    if (session) {
      try {
        response = await fetchWithRetry(`${API_BASE_URL}${path}`, buildInit(true), {
          requestId: crypto.randomUUID(),
        });
      } catch (error) {
        throw new Error(toErrorMessage(path, error));
      }
    }
  }

  return response;
}

async function readJsonEnvelope<T>(response: Response, path: string): Promise<T> {
  if (!response.ok) {
    await parseApiError(response, path);
  }
  const envelope = (await response.json()) as ApiEnvelope<T>;
  return envelope.data;
}

async function postJson<T>(path: string, payload: unknown, auth = true, options: FetchWithRetryOptions = {}): Promise<T> {
  const response = await fetchApi(path, { method: "POST", body: JSON.stringify(payload) }, auth, options);
  return readJsonEnvelope<T>(response, path);
}

async function getJson<T>(path: string, auth = true): Promise<T> {
  const response = await fetchApi(path, { method: "GET" }, auth);
  return readJsonEnvelope<T>(response, path);
}

async function putJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetchApi(path, { method: "PUT", body: JSON.stringify(payload) });
  return readJsonEnvelope<T>(response, path);
}

async function deleteJson<T>(path: string): Promise<T> {
  const response = await fetchApi(path, { method: "DELETE" });
  return readJsonEnvelope<T>(response, path);
}

async function patchJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetchApi(path, { method: "PATCH", body: JSON.stringify(payload) });
  return readJsonEnvelope<T>(response, path);
}

export function getFilterOptions(payload: FilterPayload) {
  return postJson<{
    date_options: string[];
    file_options: { snapshot_date: string; source_file: string }[];
    site_options: { snapshot_date: string; source_file: string; site_id: string; site_name: string }[];
    total_sites: number;
    total_xml: number;
    lake_ready?: boolean;
    processed_dates?: string[];
    xml_snapshots?: { snapshot_date: string; folder_name: string; xml_count: number; processed_in_lake: boolean }[];
  }>("/filters/options", payload);
}

export async function processSnapshots(snapshot_dates: string[]) {
  return postJson<{
    processed: { snapshot_date: string; xml_count: number; processing_seconds: number }[];
    errors: { snapshot_date: string; error: string }[];
  }>("/snapshots/process", { snapshot_dates });
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

export function getSitesV2(payload: FilterPayload, query: PaginatedQuery) {
  return postJson<{
    rows: Record<string, unknown>[];
    total_count: number;
    page: number;
    page_size: number;
    effective_dates: string[];
  }>("/v2/sites", { ...payload, ...query });
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

export function getGuardianOverview(payload: FilterPayload) {
  return postJson<Record<string, unknown>>("/guardian/overview", payload);
}

export function getGuardianChanges(payload: FilterPayload, compare_date_1: string, compare_date_2: string) {
  return postJson<{
    date_from: string;
    date_to: string;
    summary: Record<string, number>;
    events: Record<string, unknown>[];
  }>("/guardian/changes", { ...payload, compare_date_1, compare_date_2 });
}

export function getGuardianAnomalies(payload: FilterPayload) {
  return postJson<{ snapshot_date: string; count: number; rows: Record<string, unknown>[] }>("/guardian/anomalies", payload);
}

export function getGuardianRisks(payload: FilterPayload) {
  return postJson<{ snapshot_date: string; count: number; rows: Record<string, unknown>[] }>("/guardian/risks", payload);
}

export function getDeltaCompare(
  payload: FilterPayload,
  compare_date_1: string,
  compare_date_2: string,
) {
  return postJson<{
    comparison: Record<string, unknown>[];
    details: Record<string, unknown>[];
    equipment_changes: Record<string, unknown>[];
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
  query: PaginatedQuery & { unique_serial_only?: boolean; pivot_product_code?: boolean },
  object_types: string[] = [],
) {
  return postJson<{
    rows: Record<string, unknown>[];
    total_count: number;
    page: number;
    page_size: number;
    unique_serial_only: boolean;
    pivot_product_code?: boolean;
  }>("/v2/asset-product-codes", {
    ...payload,
    ...query,
    object_types,
    unique_serial_only: query.unique_serial_only ?? true,
    pivot_product_code: query.pivot_product_code ?? false,
  });
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

export type WebSearchMeta = {
  status?: string;
  original_query?: string;
  search_query?: string;
  corrected_query?: string | null;
  abstract?: string;
  provider?: string;
  source_count?: number;
  searched_at?: string;
  results?: Array<{ title?: string; url?: string; snippet?: string }>;
};

export type AssistantInsightResponse = {
  message: string;
  intent: string;
  status?: string;
  rows: Record<string, unknown>[];
  details?: Record<string, unknown>[];
  sources?: Record<string, unknown>[];
  web_search_enabled?: boolean;
  web_search_meta?: WebSearchMeta | null;
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
  web_search?: {
    mode?: string;
    api_configured?: boolean;
    active_api_provider?: string | null;
    providers?: Record<string, boolean>;
    fallback_chain?: string[];
  };
  compliance?: {
    llm?: { provider?: string; integration?: string; model?: string | null; note?: string };
    interface?: { product?: string; owner?: string; note?: string };
    web_research?: { integration?: string; note?: string };
  };
};

export function getAssistantEngineStatus() {
  return getJson<AssistantEngineStatus>("/assistant/status");
}

export type GuardianSearchResult = {
  type: string;
  title: string;
  description: string;
  href?: string;
  url?: string;
  meta?: Record<string, unknown>;
};

export type PlatformSearchResponse = {
  query: string;
  expanded_terms: string[];
  results: GuardianSearchResult[];
  status: string;
};

export type WebSearchApiResponse = {
  results: Array<{ title?: string; snippet?: string; url?: string }>;
  corrected_query?: string | null;
  original_query?: string;
  provider?: string;
  status?: string;
  abstract?: string;
  source_count?: number;
};

export function searchPlatform(payload: FilterPayload, query: string) {
  return postJson<PlatformSearchResponse>("/search/platform", { ...payload, query });
}

export function searchWeb(query: string, language: string, maxResults = 8) {
  const params = new URLSearchParams({
    q: query,
    language,
    max_results: String(maxResults),
  });
  return getJson<WebSearchApiResponse>(`/search/web?${params.toString()}`);
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

export type AiReportDecision = {
  priority: string;
  category: string;
  fr: string;
  en: string;
};

export type AiReportFinding = {
  severity: string;
  fr: string;
  en: string;
};

export type AiReport = {
  generated_at: string;
  period: { start: string; end: string; snapshots: number };
  metrics: Record<string, number>;
  executive: { fr: string; en: string };
  sections: AiReportSection[];
  trend: Record<string, unknown>[];
  top_risks: Record<string, unknown>[];
  decisions?: AiReportDecision[];
  critical_findings?: AiReportFinding[];
  risk_index?: number;
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
    reason?: string;
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

export function getHttpMetrics() {
  return getJson<Record<string, unknown>>("/ops/http-metrics");
}

export function getCacheStats() {
  return getJson<Record<string, unknown>>("/ops/cache-stats");
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
  send_email_otp?: boolean;
  send_sms_otp?: boolean;
  force_password_change?: boolean;
  allowed_regions?: string;
  allowed_vendors?: string;
}) {
  return postJson<{
    user_id: number;
    email: string;
    phone: string;
    message: string;
    temporary_password: string;
    personal_access_key: string;
    must_change_password?: boolean;
    notifications?: { email_otp?: boolean; sms_otp?: boolean; welcome_email?: boolean };
    verification: {
      email_expires_at: string | null;
      phone_expires_at: string | null;
      dev_email_code?: string;
      dev_phone_code?: string;
      requires_sms?: boolean;
    };
  }>("/auth/users/create", payload);
}

export function adminVerifyUser(userId: number, payload: { email_code: string; phone_code: string }) {
  return postJson<{ user: AuthUser; message: string }>(`/auth/users/${userId}/verify-provision`, payload);
}

export function resendProvisionOtp(userId: number) {
  return postJson<{
    user_id: number;
    message?: string;
    notifications?: { email_otp?: boolean; sms_otp?: boolean };
    verification: {
      email_expires_at: string;
      phone_expires_at: string;
      dev_email_code?: string;
      dev_phone_code?: string;
    };
  }>(`/auth/users/${userId}/resend-provision-otp`, {});
}

export function registerAccount(payload: {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  job_profile: string;
  department?: string;
  employee_id?: string;
}) {
  return postJson<{
    user_id: number;
    email: string;
    message: string;
    pending_admin_approval?: boolean;
  }>("/auth/register", payload, false);
}

export function approveUserAccess(userId: number) {
  return postJson<{ user_id: number; message: string; email_sent: boolean }>(`/auth/users/${userId}/approve-access`, {});
}

export function rejectUserAccess(userId: number) {
  return postJson<{ user_id: number; message: string }>(`/auth/users/${userId}/reject-access`, {});
}

export function loginAuth(payload: { email: string; password: string }) {
  return postJson<AuthSession & { must_change_password?: boolean }>("/auth/login", payload, false);
}

export function verifyLoginSecurity(payload: { user_id: number; email_code: string }) {
  return postJson<{ message: string; cleared: boolean }>("/auth/login/security/verify", payload, false);
}

export function resendLoginSecurityOtp(userId: number) {
  return postJson<{
    user_id: number;
    message?: string;
    verification: {
      email_expires_at: string;
      dev_email_code?: string;
      contact?: { email_masked?: string; phone_masked?: string };
      resend_after_seconds?: number;
      otp_expires_minutes?: number;
    };
  }>("/auth/login/security/resend", { user_id: userId }, false);
}

export function forgotPassword(payload: { email: string; channel?: "email" | "sms"; recovery_email?: string }) {
  return postJson<{
    message: string;
    email_sent: boolean;
    sms_sent?: boolean;
    reset_url?: string;
    dev_reset_token?: string;
    dev_sms_code?: string;
  }>("/auth/forgot-password", payload, false);
}

export function resetPassword(payload: {
  token?: string;
  new_password: string;
  email?: string;
  sms_code?: string;
}) {
  return postJson<{ message: string }>("/auth/reset-password", payload, false);
}

export function verifyEmailToken(token: string) {
  return getJson<{
    message: string;
    already_verified: boolean;
    user: AuthUser;
  }>(`/auth/verify-email?token=${encodeURIComponent(token)}`, false);
}

export function resendVerificationEmail(payload: { email: string }) {
  return postJson<{
    message: string;
    email_sent: boolean;
    already_verified?: boolean;
    verify_url?: string;
    dev_verify_token?: string;
  }>("/auth/resend-verification", payload, false);
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
  return getJson<{
    enabled: boolean;
    dev_mode?: boolean;
    email_ready: boolean;
    sms_ready: boolean;
    email_otp_ready?: boolean;
    sms_otp_ready?: boolean;
    sms_provider?: string;
    vonage_verify_ready?: boolean;
    twilio_verify_ready?: boolean;
  }>("/auth/notifications/status", false);
}

export { getBootstrapStatus, bootstrapAdminSignup, resendBootstrapAdminOtp, verifyBootstrapAdmin } from "@/lib/auth/auth-api";

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
    requires_sms?: boolean;
    channels: string[];
    message?: string;
    verification: {
      email_expires_at: string;
      phone_expires_at: string;
      dev_email_code?: string;
      dev_phone_code?: string;
    };
  }>("/auth/login/user", payload, false);
}

export function loginUserStep2(payload: { user_id: number; email_code: string; phone_code: string }) {
  return postJson<AuthSession & { session_access_key?: string; must_change_password?: boolean }>(
    "/auth/login/user/mfa",
    payload,
    false,
  );
}

export function resendLoginUserMfa(userId: number) {
  return postJson<{
    user_id: number;
    message?: string;
    requires_sms?: boolean;
    verification: {
      email_expires_at: string;
      phone_expires_at?: string;
      dev_email_code?: string;
      dev_phone_code?: string;
      contact?: { email_masked?: string; phone_masked?: string };
      resend_after_seconds?: number;
      otp_expires_minutes?: number;
    };
  }>("/auth/login/user/mfa/resend", { user_id: userId }, false);
}

export function loginAdminStep1(payload: { email: string; password: string; master_key: string }) {
  return postJson<{
    user_id: number;
    mfa_required: boolean;
    channels: string[];
    message?: string;
    notifications?: { email_otp?: boolean; sms_otp?: boolean };
    verification: {
      email_expires_at: string;
      phone_expires_at: string;
      dev_email_code?: string;
      dev_phone_code?: string;
    };
  }>("/auth/login/admin", payload, false);
}

export function loginAdminStep2(payload: { user_id: number; email_code: string; phone_code: string }) {
  return postJson<AuthSession>("/auth/login/admin/verify", payload, false);
}

export function resendLoginAdminMfa(userId: number) {
  return postJson<{
    user_id: number;
    message?: string;
    requires_sms?: boolean;
    verification: {
      email_expires_at: string;
      phone_expires_at?: string;
      dev_email_code?: string;
      dev_phone_code?: string;
      contact?: { email_masked?: string; phone_masked?: string };
      resend_after_seconds?: number;
      otp_expires_minutes?: number;
    };
  }>("/auth/login/admin/mfa/resend", { user_id: userId }, false);
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

export function getSecurityCenterSummary() {
  return getJson<{
    failed_logins_today: number;
    security_locked_accounts: number;
    pending_otp_accounts: number;
    active_users: number;
    active_admins: number;
    total_accounts: number;
    recent_security_events: Array<{
      action: string;
      detail: string;
      created_at: string;
      user_id: number | null;
    }>;
  }>("/auth/security/summary");
}

export function getSecurityAudit(limit = 100) {
  return getJson<
    Array<{
      id: number;
      user_id: number | null;
      action: string;
      detail: string;
      created_at: string;
      email?: string;
      full_name?: string;
      role?: string;
    }>
  >(`/auth/security/audit?limit=${limit}`);
}

export function createAccessKey(payload: { key_label: string; key_type: string; max_uses: number }) {
  return postJson<{ access_key: string; key_label: string; key_type: string; max_uses: number }>("/auth/access-keys", payload);
}

export function setUserActive(userId: number, is_active: boolean) {
  return patchJson<AuthUser>(`/auth/users/${userId}/status`, { is_active });
}

export async function ensureAuthSession(): Promise<AuthUser | null> {
  if (!getAccessToken() && !getRefreshToken()) return null;
  try {
    return await fetchAuthMe();
  } catch {
    const refreshed = await refreshAuthSession();
    if (!refreshed) return null;
    try {
      return await fetchAuthMe();
    } catch {
      return null;
    }
  }
}

export type PowerBiFileEntry = {
  name: string;
  folder?: string;
  size_bytes: number;
  updated_at: string;
};

export type PowerBiStatus = {
  export_dir: string;
  processed_dir: string;
  export_ready: boolean;
  layout_version?: string;
  last_synced_at?: string | null;
  export_files: PowerBiFileEntry[];
  processed_files: PowerBiFileEntry[];
  datasets: string[];
  folders?: Record<string, string>;
  decision_build?: Record<string, unknown>;
  powerbi_report_url?: string;
  powerbi_embed_url?: string;
};

export async function getPowerBiStatus() {
  return getJson<PowerBiStatus>("/integrations/powerbi/status");
}

export async function syncPowerBiExport() {
  return postJson<Record<string, unknown>>("/integrations/powerbi/sync", {}, true, {
    timeoutMs: 120000,
    retries: 0,
  });
}

export async function getPowerBiCsv(name: string) {
  const response = await fetchApi(`/integrations/powerbi/csv/${encodeURIComponent(name)}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to load Power BI CSV ${name}`);
  }
  return response.text();
}

export type N8nWorkflow = {
  id: string;
  name: string;
  description: string;
  icon: string;
  configured: boolean;
};

export type N8nStatus = {
  enabled: boolean;
  baseUrl: string;
  embedUrl: string;
  workflows: N8nWorkflow[];
};

export function getN8nStatus() {
  return getJson<N8nStatus>("/integrations/n8n/status");
}

export function triggerN8nWorkflow(workflowId: string, payload: Record<string, unknown> = {}) {
  return postJson<{ webhook: string; status: string; response: unknown }>(
    `/integrations/n8n/workflows/${workflowId}/trigger`,
    payload,
  );
}

export function startAuthKeepAlive(): () => void {
  const refresh = async () => {
    if (!getRefreshToken()) return;
    await refreshAuthSession();
  };

  const interval = window.setInterval(() => {
    void refresh();
  }, ACCESS_REFRESH_INTERVAL_MS);

  const onVisible = () => {
    if (document.visibilityState === "visible") {
      void refresh();
    }
  };

  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
