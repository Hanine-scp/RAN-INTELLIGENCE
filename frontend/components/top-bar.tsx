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

const PILL_ACTIVE_BG = "#1E293B";

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
    <header className="sticky top-0 z-20 border-b border-[#E2E8F0] bg-[#F8FAFC]/95 shadow-[0_1px_3px_rgba(30,41,59,0.06)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 px-3 py-2 lg:px-5 lg:py-2.5">
        <div className="shrink-0">
          <BrandLogo size="lg" className="sm:hidden" priority />
          <BrandLogo size="header" className="hidden sm:block" priority />
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-0">
          <div className="flex items-center rounded-full border border-slate-200/90 bg-white p-0.5 shadow-sm">
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
                  className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition ${
                    filters.vendor === vendor ? `${pillActive}` : pillInactive
                  }`}
                  style={filters.vendor === vendor ? { backgroundColor: PILL_ACTIVE_BG } : undefined}
                >
                  {vendor}
                </button>
              ))}
            </div>

            <span className="mx-0.5 hidden h-4 w-px bg-slate-200 md:block" aria-hidden />

            <div className="hidden items-center sm:flex">
              {(["Français", "English"] as const).map((lng) => (
                <button
                  key={lng}
                  type="button"
                  onClick={() => setFilters({ ...filters, language: lng })}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                    language === lng ? pillActive : pillInactive
                  }`}
                  style={language === lng ? { backgroundColor: PILL_ACTIVE_BG } : undefined}
                >
                  {lng === "Français" ? "FR" : "EN"}
                </button>
              ))}
            </div>

            <span className="mx-0.5 hidden h-4 w-px bg-slate-200 sm:block" aria-hidden />

            <button
              type="button"
              onClick={() => setSidebarOpen((prev) => !prev)}
              className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition ${
                sidebarOpen ? pillActive : pillInactive
              }`}
              style={sidebarOpen ? { backgroundColor: BRAND.red } : undefined}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 6h16M7 12h10M10 18h4" />
              </svg>
              <span className="hidden sm:inline">{language === "Français" ? "Filtres" : "Filters"}</span>
            </button>

            <span className="mx-0.5 hidden h-4 w-px bg-slate-200 md:block" aria-hidden />

            <div className="hidden h-7 items-center gap-1.5 rounded-full px-1.5 md:flex">
              <span className="max-w-[130px] truncate text-xs font-semibold text-slate-700">{user?.full_name ?? "Responsable"}</span>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                style={{ backgroundColor: isAdmin(user) ? PILL_ACTIVE_BG : BRAND.sage }}
              >
                {isAdmin(user) ? "Admin" : "Responsable"}
              </span>
            </div>

            {isAdmin(user) ? (
              <>
                <span className="mx-0.5 hidden h-4 w-px bg-slate-200 lg:block" aria-hidden />
                <Link
                  href="/admin/users"
                  className="hidden h-7 items-center rounded-full px-2.5 text-xs font-semibold text-slate-600 transition hover:text-slate-900 lg:inline-flex"
                >
                  {language === "Français" ? "Responsables" : "Responsibles"}
                </Link>
              </>
            ) : null}

            <span className="mx-0.5 hidden h-4 w-px bg-slate-200 sm:block" aria-hidden />

            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex h-7 items-center rounded-full px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
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
      <div className="platform-kpi-band relative overflow-hidden py-1.5 text-[11px] font-semibold">
        <div className="pointer-events-none absolute inset-0 opacity-[0.4]" aria-hidden>
          <div className="absolute -left-8 top-0 h-full w-32 skew-x-[-18deg] bg-slate-100/70" />
          <div className="absolute right-0 top-0 h-full w-40 skew-x-[-18deg] bg-slate-50/80" />
        </div>
        <div className="animate-ticker whitespace-nowrap tracking-wide">
          {[...tickerItems, ...tickerItems].map((item, idx) => (
            <span key={`${item}-${idx}`} className="mx-5 inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ED1C24] shadow-sm" />
              <span>{item}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Navigation — répartition sur toute la largeur */}
      <nav className="border-t border-[#E2E8F0] bg-white">
        <div className="top-nav-scroll flex w-full min-w-0 gap-0">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 border-b-2 px-0.5 py-2 transition sm:flex-row sm:gap-1.5 sm:px-1 sm:py-2.5 lg:px-2 ${
                  active
                    ? "border-[#ED1C24] text-[#1E293B]"
                    : "border-transparent text-[#64748B] hover:border-[#E2E8F0] hover:text-[#1E293B]"
                }`}
              >
                <NavIcon
                  name={item.icon}
                  className={`h-4 w-4 shrink-0 transition sm:h-[17px] sm:w-[17px] ${active ? "text-[#1E293B]" : "text-[#94A3B8] group-hover:text-[#64748B]"}`}
                />
                <span
                  className={`max-w-full truncate text-center text-[10px] font-semibold leading-tight sm:text-[11px] lg:text-xs ${
                    active ? "text-[#1E293B]" : "text-[#64748B] group-hover:text-[#1E293B]"
                  }`}
                  title={t(language, item.key)}
                >
                  {t(language, item.key)}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
