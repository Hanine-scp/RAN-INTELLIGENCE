"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppContext } from "@/components/app-provider";
import { useAuth } from "@/components/auth-provider";
import { BrandLogo } from "@/components/brand-logo";
import { NavIcon } from "@/components/nav-icon";
import { useDashboard } from "@/lib/use-dashboard";
import { isAdmin } from "@/lib/auth";
import { flatNavItems } from "@/lib/nav";
import { filterNavHref } from "@/lib/permissions";
import { t } from "@/lib/i18n";
import { BRAND } from "@/lib/chart-theme";
import type { RanVendor } from "@/lib/types";

const VENDORS: RanVendor[] = ["nokia", "huawei"];

const NAV_ACTIVE = BRAND.teal;

export function TopBar() {
  const pathname = usePathname();
  const { filters, setFilters, payload, sidebarOpen, setSidebarOpen } = useAppContext();
  const { user, logout } = useAuth();
  const language = filters.language;
  const navItems = flatNavItems.filter((item) => filterNavHref(item.href, user?.role ?? null));
  const { data: dashboardData } = useDashboard(payload);
  const homeKpis = useMemo(() => {
    if (!dashboardData) return null;
    return {
      sites: Number(dashboardData.kpis.total_sites ?? 0),
      active: Number(dashboardData.kpis.active_sites ?? 0),
      blocked: Number(dashboardData.kpis.blocked_sites ?? 0),
      equipment: Number(dashboardData.kpis.total_equipment ?? 0),
      snapshots: Number(dashboardData.period.snapshot_count ?? 0),
    };
  }, [dashboardData]);

  const tickerItems = useMemo(() => {
    const selectedDates = payload.selected_dates.length || payload.effective_dates.length;
    const scope = [
      `${filters.vendor.toUpperCase()} RAN`,
      `Snapshots: ${selectedDates}`,
      `${language === "Français" ? "Fichiers XML" : "XML files"}: ${payload.selected_files.length}`,
      `${language === "Français" ? "Sites filtrés" : "Filtered sites"}: ${payload.selected_sites.length}`,
    ];
    if (!homeKpis) return scope;
    return [
      ...scope,
      `${language === "Français" ? "Total sites" : "Total sites"}: ${homeKpis.sites}`,
      `${language === "Français" ? "Sites actifs" : "Active sites"}: ${homeKpis.active}`,
      `${language === "Français" ? "Sites bloqués" : "Blocked sites"}: ${homeKpis.blocked}`,
      `${language === "Français" ? "Équipements" : "Equipment"}: ${homeKpis.equipment}`,
      `${language === "Français" ? "Snapshots analysés" : "Analyzed snapshots"}: ${homeKpis.snapshots}`,
    ];
  }, [homeKpis, language, payload]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  const pillActive = "text-white shadow-sm";
  const pillInactive = "text-slate-600 hover:bg-slate-50";

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 shadow-[0_8px_32px_rgba(36,52,71,0.06)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4 px-4 py-3.5 lg:px-6">
        <div className="shrink-0">
          <BrandLogo size="xl" className="sm:hidden" priority />
          <BrandLogo size="2xl" className="hidden sm:block" priority />
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-0">
          <div className="flex items-center rounded-full border border-slate-200/90 bg-white p-1 shadow-sm">
            <div className="hidden items-center md:flex">
              {VENDORS.map((vendor) => (
                <button
                  key={vendor}
                  type="button"
                  onClick={() =>
                    setFilters({
                      ...filters,
                      vendor,
                      selected_dates: [],
                      selected_files: [],
                      selected_sites: [],
                      selected_file_dates: [],
                      effective_dates: [],
                    })
                  }
                  className={`rounded-full px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition ${
                    filters.vendor === vendor ? `${pillActive}` : pillInactive
                  }`}
                  style={filters.vendor === vendor ? { backgroundColor: BRAND.teal } : undefined}
                >
                  {vendor}
                </button>
              ))}
            </div>

            <span className="mx-1 hidden h-5 w-px bg-slate-200 md:block" aria-hidden />

            <div className="hidden items-center sm:flex">
              {(["Français", "English"] as const).map((lng) => (
                <button
                  key={lng}
                  type="button"
                  onClick={() => setFilters({ ...filters, language: lng })}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    language === lng ? pillActive : pillInactive
                  }`}
                  style={language === lng ? { backgroundColor: BRAND.teal } : undefined}
                >
                  {lng === "Français" ? "FR" : "EN"}
                </button>
              ))}
            </div>

            <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" aria-hidden />

            <button
              type="button"
              onClick={() => setSidebarOpen((prev) => !prev)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${
                sidebarOpen ? pillActive : pillInactive
              }`}
              style={sidebarOpen ? { backgroundColor: BRAND.orange } : undefined}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 6h16M7 12h10M10 18h4" />
              </svg>
              <span className="hidden sm:inline">{language === "Français" ? "Filtres" : "Filters"}</span>
            </button>

            <span className="mx-1 hidden h-5 w-px bg-slate-200 md:block" aria-hidden />

            <div className="hidden h-8 items-center gap-2 rounded-full px-2 md:flex">
              <span className="max-w-[130px] truncate text-xs font-semibold text-slate-700">{user?.full_name ?? "Utilisateur"}</span>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                style={{ backgroundColor: isAdmin(user) ? BRAND.teal : BRAND.sage }}
              >
                {isAdmin(user) ? "Admin" : "User"}
              </span>
            </div>

            {isAdmin(user) ? (
              <>
                <span className="mx-1 hidden h-5 w-px bg-slate-200 lg:block" aria-hidden />
                <Link
                  href="/admin/users"
                  className="hidden h-8 items-center rounded-full px-3 text-xs font-semibold transition hover:opacity-80 lg:inline-flex"
                  style={{ color: BRAND.teal }}
                >
                  {language === "Français" ? "Utilisateurs" : "Users"}
                </Link>
              </>
            ) : null}

            <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" aria-hidden />

            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <span className="hidden sm:inline">{language === "Français" ? "Déconnexion" : "Logout"}</span>
              <span className="sm:hidden" aria-label={language === "Français" ? "Déconnexion" : "Logout"}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Bande KPI — navy premium */}
      <div className="platform-kpi-band relative overflow-hidden py-2.5 text-[11px] font-semibold">
        <div className="pointer-events-none absolute inset-0 opacity-[0.4]" aria-hidden>
          <div className="absolute -left-8 top-0 h-full w-32 skew-x-[-18deg] bg-teal-100/50" />
          <div className="absolute right-0 top-0 h-full w-40 skew-x-[-18deg] bg-sky-100/50" />
        </div>
        <div className="animate-ticker whitespace-nowrap tracking-wide">
          {[...tickerItems, ...tickerItems].map((item, idx) => (
            <span key={`${item}-${idx}`} className="mx-5 inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500 shadow-sm" />
              <span>{item}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Navigation — onglet actif teal */}
      <nav className="border-t border-slate-100 bg-white/98 backdrop-blur-sm">
        <div className="flex gap-0 overflow-x-auto px-2 lg:px-4">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex shrink-0 flex-col items-center gap-1 px-3 py-2.5 transition sm:flex-row sm:gap-2 sm:px-4 ${
                  active ? "" : "text-slate-500 hover:text-slate-800"
                }`}
                style={active ? { color: NAV_ACTIVE } : undefined}
              >
                <NavIcon
                  name={item.icon}
                  className="h-[18px] w-[18px] shrink-0 transition"
                  style={active ? { color: NAV_ACTIVE } : undefined}
                />
                <span
                  className={`whitespace-nowrap text-[12px] font-semibold sm:text-[13px] ${active ? "" : "text-slate-600 group-hover:text-slate-800"}`}
                  style={active ? { color: NAV_ACTIVE } : undefined}
                >
                  {t(language, item.key)}
                </span>
                <span
                  className="absolute bottom-0 left-2 right-2 h-[3px] rounded-t-full transition"
                  style={{
                    backgroundColor: active ? NAV_ACTIVE : "transparent",
                    opacity: active ? 1 : 0,
                  }}
                />
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
