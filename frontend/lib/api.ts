import type { ApiEnvelope, FilterPayload } from "@/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${path} (${response.status})`);
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

export function getDelta() {
  return postJson<{
    metrics: Record<string, unknown>[];
    numeric_metrics: Record<string, unknown>[];
    site_changes: Record<string, unknown>[];
    summary: Record<string, number>;
  }>("/delta", {});
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

export function askAssistant(question: string) {
  return postJson<{
    message: string;
    intent: string;
    rows: Record<string, unknown>[];
  }>("/assistant", { question });
}
