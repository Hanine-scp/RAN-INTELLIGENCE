import { getAccessToken, getRefreshToken, saveSession, type AuthSession } from "@/lib/auth";
import { fetchWithRetry } from "@/lib/fetch-client";
import type { ApiEnvelope, FilterPayload } from "@/lib/types";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8010").replace(/\/+$/, "");

function toErrorMessage(path: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `API unreachable for ${path}. Check NEXT_PUBLIC_API_BASE_URL and backend availability. Details: ${message}`;
}

async function parseApiError(response: Response, path: string): Promise<never> {
  let detail = "";
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") detail = ` — ${body.detail}`;
  } catch {
    /* ignore */
  }
  throw new Error(`API request failed: ${path} (${response.status})${detail}`);
}

async function refreshAuthSession(): Promise<AuthSession | null> {
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

async function postJson<T>(path: string, payload: unknown, auth = true): Promise<T> {
  const buildInit = (): RequestInit => {
    const headers = new Headers({ "Content-Type": "application/json" });
    const token = getAccessToken();
    if (auth && token) headers.set("Authorization", `Bearer ${token}`);
    return { method: "POST", headers, body: JSON.stringify(payload), cache: "no-store" };
  };

  let response: Response;
  try {
    response = await fetchWithRetry(`${API_BASE_URL}${path}`, buildInit(), {
      requestId: crypto.randomUUID(),
    });
  } catch (error) {
    throw new Error(toErrorMessage(path, error));
  }

  if (auth && response.status === 401 && getRefreshToken()) {
    const session = await refreshAuthSession();
    if (session) {
      try {
        response = await fetchWithRetry(`${API_BASE_URL}${path}`, buildInit(), {
          requestId: crypto.randomUUID(),
        });
      } catch (error) {
        throw new Error(toErrorMessage(path, error));
      }
    }
  }

  if (!response.ok) await parseApiError(response, path);
  const envelope = (await response.json()) as ApiEnvelope<T>;
  return envelope.data;
}

export function getDeltaCompare(payload: FilterPayload, compare_date_1: string, compare_date_2: string) {
  return postJson<{
    comparison: Record<string, unknown>[];
    details: Record<string, unknown>[];
    equipment_changes: Record<string, unknown>[];
  }>("/delta/compare", { ...payload, compare_date_1, compare_date_2 });
}

export function investigateSite(payload: FilterPayload, site_id: string, object_type = "") {
  return postJson<{
    site_history: Record<string, unknown>[];
    equipment: Record<string, unknown>[];
  }>("/investigate/site", { ...payload, site_id, object_type });
}
