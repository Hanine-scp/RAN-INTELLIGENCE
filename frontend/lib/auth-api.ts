import { fetchWithRetry } from "@/lib/fetch-client";
import type { AuthSession } from "@/lib/auth";
import type { ApiEnvelope } from "@/lib/types";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8010").replace(/\/+$/, "");

async function readEnvelope<T>(response: Response, path: string): Promise<T> {
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = ` — ${body.detail}`;
    } catch {
      /* ignore */
    }
    throw new Error(`API request failed: ${path} (${response.status})${detail}`);
  }
  const envelope = (await response.json()) as ApiEnvelope<T>;
  return envelope.data;
}

async function publicGet<T>(path: string): Promise<T> {
  const response = await fetchWithRetry(`${API_BASE_URL}${path}`, { method: "GET", cache: "no-store" });
  return readEnvelope<T>(response, path);
}

async function publicPost<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetchWithRetry(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  return readEnvelope<T>(response, path);
}

export function getBootstrapStatus() {
  return publicGet<{
    admin_exists: boolean;
    admin_active: boolean;
    bootstrap_enabled: boolean;
    pending_admin?: {
      user_id: number;
      email_masked: string;
      phone_masked: string;
    };
  }>("/auth/bootstrap/status");
}

export function getNotificationsStatus() {
  return publicGet<{ enabled: boolean; email_ready: boolean; sms_ready: boolean }>("/auth/notifications/status");
}

export type AuthVerificationMeta = {
  email_expires_at: string;
  phone_expires_at?: string;
  dev_email_code?: string;
  dev_phone_code?: string;
  contact?: {
    email_masked?: string;
    phone_masked?: string;
  };
  resend_after_seconds?: number;
  otp_expires_minutes?: number;
};

export function bootstrapAdminSignup(payload: {
  email: string;
  phone: string;
  password: string;
  full_name: string;
  recovery_email: string;
  bootstrap_key: string;
}) {
  return publicPost<{
    user_id: number;
    message: string;
    notifications?: { email_otp?: boolean; sms_otp?: boolean };
    verification: AuthVerificationMeta;
  }>("/auth/bootstrap/admin", payload);
}

export function resendBootstrapAdminOtp(userId: number) {
  return publicPost<{
    user_id: number;
    message: string;
    notifications?: { email_otp?: boolean; sms_otp?: boolean };
    verification: AuthVerificationMeta;
  }>(`/auth/bootstrap/admin/${userId}/resend-otp`, {});
}

export function verifyBootstrapAdmin(payload: { user_id: number; email_code: string; phone_code: string }) {
  return publicPost<AuthSession & { message?: string }>("/auth/bootstrap/admin/verify", payload);
}
