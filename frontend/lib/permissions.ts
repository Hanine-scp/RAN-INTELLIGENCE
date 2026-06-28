export type UserRole = "admin" | "responsable";

export const USER_ALLOWED_ROUTES = [
  "/",
  "/timeline",
  "/delta",
  "/sites",
  "/inventaire",
  "/asset-distribution",
  "/automation",
  "/guardian",
  "/foresight",
  "/signals",
  "/cartographie-reseau",
  "/insight",
  "/statistiques",
  "/analytics",
  "/power-bi",
  "/prediction",
  "/spares",
  "/patterns",
  "/cartes-risque",
  "/anomalies",
  "/quality",
  "/ai-assistant",
  "/remplacements",
] as const;

export const ADMIN_ONLY_ROUTES = [
  "/ops",
  "/import",
  "/clustering",
  "/temporal-changes",
  "/global-counters",
  "/admin",
] as const;

export const PUBLIC_ROUTES = [
  "/login",
  "/signup",
  "/register",
  "/activate",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/admin/setup",
] as const;

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function canAccessRoute(pathname: string, role: UserRole | null): boolean {
  if (isPublicRoute(pathname)) return true;
  if (!role) return false;
  if (role === "admin") return true;
  if (pathname.startsWith("/admin")) return false;
  return USER_ALLOWED_ROUTES.some((route) => pathname === route || (route !== "/" && pathname.startsWith(`${route}/`)));
}

export function filterNavHref(href: string, role: UserRole | null): boolean {
  return canAccessRoute(href, role);
}
