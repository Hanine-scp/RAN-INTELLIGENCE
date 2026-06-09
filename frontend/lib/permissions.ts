export type UserRole = "admin" | "user";

export const USER_ALLOWED_ROUTES = [
  "/",
  "/sites",
  "/inventaire",
  "/asset-distribution",
  "/delta",
  "/statistiques",
  "/remplacements",
  "/cartes-risque",
  "/patterns",
  "/analytics",
  "/anomalies",
  "/quality",
  "/ai-assistant",
  "/prediction",
  "/spares",
] as const;

export const ADMIN_ONLY_ROUTES = [
  "/ops",
  "/temporal-changes",
  "/global-counters",
  "/clustering",
  "/ai-report",
  "/admin",
] as const;

export const PUBLIC_ROUTES = ["/login", "/signup", "/activate"] as const;

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
