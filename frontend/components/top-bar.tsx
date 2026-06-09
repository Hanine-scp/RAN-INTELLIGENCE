"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppContext } from "@/components/app-provider";
import { useAuth } from "@/components/auth-provider";
import { BrandLogo } from "@/components/brand-logo";
import { NavIcon } from "@/components/nav-icon";
import { getDashboard } from "@/lib/api";
import { isAdmin } from "@/lib/auth";
import { flatNavItems } from "@/lib/nav";
import { filterNavHref } from "@/lib/permissions";
import { t } from "@/lib/i18n";
import type { RanVendor } from "@/lib/types";

const VENDORS: RanVendor[] = ["nokia", "huawei"];

export function TopBar() {
  const pathname = usePathname();
  const { filters, setFilters, payload, sidebarOpen, setSidebarOpen } = useAppContext();
  const { user, logout } = useAuth();
  const language = filters.language;
  const navItems = flatNavItems.filter((item) => filterNavHref(item.href, user?.role ?? null));
  const [homeKpis, setHomeKpis] = useState<{
    sites: number;
    active: number;
    blocked: number;
    equipment: number;
    snapshots: number;
  } | null>(null);
  useEffect(() => {
    const run = async () => {
      if (!payload.selected_dates.length && !payload.effective_dates.length) {
        setHomeKpis(null);
        return;
      }
      try {
        const data = await getDashboard(payload);
        setHomeKpis({
          sites: Number(data.kpis.total_sites ?? 0),
          active: Number(data.kpis.active_sites ?? 0),
          blocked: Number(data.kpis.blocked_sites ?? 0),
          equipment: Number(data.kpis.total_equipment ?? 0),
          snapshots: Number(data.period.snapshot_count ?? 0),
        });
      } catch {
        setHomeKpis(null);
      }
    };
    void run();
  }, [payload]);

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

  return (
    <header className="sticky top-0 z-20 border-b border-red-100/60 bg-white/90 shadow-[0_8px_32px_rgba(15,23,42,0.06)] backdrop-blur-xl">
      {/* Zone stable — logo Ooredoo + actions */}
      <div className="flex items-center justify-between gap-4 px-4 py-3.5 lg:px-6">
        <div className="shrink-0">
          <BrandLogo size="xl" className="sm:hidden" priority />
          <BrandLogo size="2xl" className="hidden sm:block" priority />
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-0">
          <div className="flex items-center rounded-full border border-slate-200/90 bg-white p-1 shadow-sm">
            {/* Vendor RAN */}
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
                    filters.vendor === vendor ? "bg-red-600 text-white shadow-sm" : "text-slate-500 hover:bg-red-50 hover:text-red-600"
                  }`}
                >
                  {vendor}
                </button>
              ))}
            </div>

            <span className="mx-1 hidden h-5 w-px bg-slate-200 md:block" aria-hidden />

            {/* Langue */}
            <div className="hidden items-center sm:flex">
              {(["Français", "English"] as const).map((lng) => (
                <button
                  key={lng}
                  type="button"
                  onClick={() => setFilters({ ...filters, language: lng })}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    language === lng ? "bg-red-600 text-white shadow-sm" : "text-slate-500 hover:bg-red-50 hover:text-red-600"
                  }`}
                >
                  {lng === "Français" ? "FR" : "EN"}
                </button>
              ))}
            </div>

            <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" aria-hidden />

            {/* Filtres */}
            <button
              type="button"
              onClick={() => setSidebarOpen((prev) => !prev)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${
                sidebarOpen ? "bg-red-600 text-white shadow-sm" : "text-slate-600 hover:bg-red-50 hover:text-red-600"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 6h16M7 12h10M10 18h4" />
              </svg>
              <span className="hidden sm:inline">{language === "Français" ? "Filtres" : "Filters"}</span>
            </button>

            <span className="mx-1 hidden h-5 w-px bg-slate-200 md:block" aria-hidden />

            {/* Profil */}
            <div className="hidden h-8 items-center gap-2 rounded-full px-2 md:flex">
              <span className="max-w-[130px] truncate text-xs font-semibold text-slate-700">{user?.full_name ?? "Utilisateur"}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  isAdmin(user) ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
                }`}
              >
                {isAdmin(user) ? "Admin" : "User"}
              </span>
            </div>

            {isAdmin(user) ? (
              <>
                <span className="mx-1 hidden h-5 w-px bg-slate-200 lg:block" aria-hidden />
                <Link
                  href="/admin/users"
                  className="hidden h-8 items-center rounded-full px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50 lg:inline-flex"
                >
                  {language === "Français" ? "Utilisateurs" : "Users"}
                </Link>
              </>
            ) : null}

            <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" aria-hidden />

            {/* Déconnexion */}
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold text-slate-600 transition hover:bg-red-50 hover:text-red-700"
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

      {/* Bande rouge KPI — style polygon premium */}
      <div className="relative overflow-hidden bg-gradient-to-r from-[#9f1218] via-[#d91f28] to-[#b51218] py-2.5 text-[11px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
        <div className="pointer-events-none absolute inset-0 opacity-30" aria-hidden>
          <div className="absolute -left-8 top-0 h-full w-32 skew-x-[-18deg] bg-white/20" />
          <div className="absolute left-1/3 top-0 h-full w-24 skew-x-[-18deg] bg-black/10" />
          <div className="absolute right-0 top-0 h-full w-40 skew-x-[-18deg] bg-white/15" />
        </div>
        <div className="animate-ticker whitespace-nowrap tracking-wide">
          {[...tickerItems, ...tickerItems].map((item, idx) => (
            <span key={`${item}-${idx}`} className="mx-5 inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
              <span>{item}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Navigation pages + icônes (sous la bande rouge) */}
      <nav className="border-t border-red-50/80 bg-white/95 backdrop-blur-sm">
        <div className="flex gap-0 overflow-x-auto px-2 lg:px-4">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex shrink-0 flex-col items-center gap-1 px-3 py-2.5 transition sm:flex-row sm:gap-2 sm:px-4 ${
                  active ? "text-red-600" : "text-slate-600 hover:text-red-500"
                }`}
              >
                <NavIcon
                  name={item.icon}
                  className={`h-[18px] w-[18px] shrink-0 ${active ? "text-red-600" : "text-slate-400 group-hover:text-red-500"}`}
                />
                <span className={`whitespace-nowrap text-[12px] font-semibold sm:text-[13px] ${active ? "text-red-600" : ""}`}>
                  {t(language, item.key)}
                </span>
                <span
                  className={`absolute bottom-0 left-2 right-2 h-[3px] rounded-t-full transition ${
                    active ? "bg-red-600" : "bg-transparent group-hover:bg-red-200"
                  }`}
                />
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
