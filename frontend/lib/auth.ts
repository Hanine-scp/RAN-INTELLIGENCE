export type AuthUser = {
  id: number;
  email: string;
  phone: string;
  full_name: string;
  role: "admin" | "responsable";
  job_profile: string;
  permissions: string[];
  email_verified: boolean;
  phone_verified: boolean;
  is_active: boolean;
};

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
  session_access_key?: string;
  must_change_password?: boolean;
  message?: string;
  notifications?: { email?: boolean; sms?: boolean; email_otp?: boolean; sms_otp?: boolean; welcome_email?: boolean };
};

export type JobProfile = {
  id: string;
  fr: string;
  en: string;
};

const ACCESS_KEY = "ran_access_token";
const REFRESH_KEY = "ran_refresh_token";
const USER_KEY = "ran_user";
// Cookie de navigation : durée alignée sur le refresh token (pas sur l'access token court).
export const AUTH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

function writeAuthCookie(): void {
  document.cookie = `ran_auth=1; path=/; max-age=${AUTH_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function saveSession(session: AuthSession): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_KEY, session.access_token);
  localStorage.setItem(REFRESH_KEY, session.refresh_token);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  writeAuthCookie();
}

export function touchAuthCookie(): void {
  if (typeof window === "undefined") return;
  if (!getAccessToken()) return;
  writeAuthCookie();
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  document.cookie = "ran_auth=; path=/; max-age=0; SameSite=Lax";
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function isAdmin(user: AuthUser | null): boolean {
  return user?.role === "admin";
}

export function hasPermission(user: AuthUser | null, permission: string): boolean {
  return Boolean(user?.permissions?.includes(permission));
}
