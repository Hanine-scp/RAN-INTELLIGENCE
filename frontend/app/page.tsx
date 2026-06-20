"use client";

import { useMemo } from "react";
import { useAppContext } from "@/components/app-provider";
import { HomePageLayout } from "@/components/home-page-layout";
import { t } from "@/lib/i18n";
import { useDashboard } from "@/lib/use-dashboard";
import { MultiBarChart, SummaryLineChart } from "@/components/charts";
import { CHART_PRIMARY, CHART_RING_TRACK, CHART_SECONDARY, TECH_COLORS } from "@/lib/chart-theme";

export default function Home() {
  const { filters, payload } = useAppContext();
  const { data, isLoading, isValidating } = useDashboard(payload);
  const loading = isLoading || isValidating;

  const kpiGraph = useMemo(() => {
    if (!data) {
      return {
        sites: 0,
        active: 0,
        blocked: 0,
        equipment: 0,
        availability: 0,
        activeShare: 0,
        blockedShare: 0,
        equipmentPerSite: 0,
        equipmentDensityRate: 0,
      };
    }
    const sites = Number(data.kpis.total_sites ?? 0);
    const active = Number(data.kpis.active_sites ?? 0);
    const blocked = Number(data.kpis.blocked_sites ?? 0);
    const equipment = Number(data.kpis.total_equipment ?? 0);
    const availability = Math.min(100, Math.max(0, Number(data.kpis.availability_percent ?? 0)));
    const safeSites = Math.max(sites, 1);
    const activeShare = Math.min(100, Math.round((active / safeSites) * 100));
    const blockedShare = Math.min(100, Math.round((blocked / safeSites) * 100));
    const equipmentPerSite = sites > 0 ? Math.round((equipment / sites) * 10) / 10 : 0;
    const equipmentDensityRate = Math.min(100, Math.round((equipmentPerSite / 150) * 100));
    return {
      sites,
      active,
      blocked,
      equipment,
      availability,
      activeShare,
      blockedShare,
      equipmentPerSite,
      equipmentDensityRate,
    };
  }, [data]);

  const cellsChartData = useMemo(() => {
    if (!data) return [];
    const toNumber = (value: unknown) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : 0;
    };
    return data.summary.map((row) => {
      const fdd = toNumber(row.cells_4g_fdd);
      const tdd = toNumber(row.cells_4g_tdd);
      const fallback4g = toNumber(row.cells_4g);
      const total4g = fdd + tdd > 0 ? fdd + tdd : fallback4g;
      return {
        ...row,
        cells_4g: total4g,
        cells_4g_fdd: fdd,
        cells_4g_tdd: tdd,
      };
    });
  }, [data]);

  const latestCellsTable = useMemo(() => {
    if (!cellsChartData.length) {
      return [
        { label: "2G", value: 0 },
        { label: "3G", value: 0 },
        { label: "4G (Total)", value: 0 },
        { label: "4G FDD", value: 0 },
        { label: "4G TDD", value: 0 },
        { label: "5G", value: 0 },
      ];
    }
    const last = cellsChartData[cellsChartData.length - 1] as Record<string, unknown>;
    const toNumber = (value: unknown) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : 0;
    };
    return [
      { label: "2G", value: toNumber(last.cells_2g) },
      { label: "3G", value: toNumber(last.cells_3g) },
      {
        label: "4G (Total)",
        value:
          toNumber(last.cells_4g_fdd) + toNumber(last.cells_4g_tdd) > 0
            ? toNumber(last.cells_4g_fdd) + toNumber(last.cells_4g_tdd)
            : toNumber(last.cells_4g),
      },
      { label: "4G FDD", value: toNumber(last.cells_4g_fdd) },
      { label: "4G TDD", value: toNumber(last.cells_4g_tdd) },
      { label: "5G", value: toNumber(last.cells_5g) },
    ];
  }, [cellsChartData]);

  const overview = useMemo(() => {
    if (!data || !data.summary.length) {
      return {
        latestSites: 0,
        latestActive: 0,
        latestBlocked: 0,
        latest4g: 0,
        previousAvailability: 0,
        availabilityDelta: 0,
        activeRate: 0,
        blockedRate: 0,
      };
    }
    const rows = data.summary;
    const last = rows[rows.length - 1];
    const toNumber = (value: unknown) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : 0;
    };
    const latestSites = toNumber(last.nb_sites);
    const latestActive = toNumber(last.active_sites);
    const latestBlocked = toNumber(last.blocked_sites);
    const latest4g = toNumber(last.cells_4g);
    const previous = rows.length > 1 ? rows[rows.length - 2] : last;
    const previousSites = Math.max(1, toNumber(previous.nb_sites));
    const previousActive = toNumber(previous.active_sites);
    const previousAvailability = Math.round((previousActive / previousSites) * 10000) / 100;
    const safeTotal = latestSites || Math.max(latestActive + latestBlocked, 1);
    const activeRate = Math.round((latestActive / safeTotal) * 100);
    const blockedRate = Math.round((latestBlocked / safeTotal) * 100);
    const availabilityDelta = Math.round((Number(data.kpis.availability_percent ?? 0) - previousAvailability) * 100) / 100;
    return {
      latestSites,
      latestActive,
      latestBlocked,
      latest4g,
      previousAvailability,
      availabilityDelta,
      activeRate,
      blockedRate,
    };
  }, [data]);

  if (!payload.selected_dates.length && !payload.effective_dates?.length) {
    return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4">{t(filters.language, "warning_dates")}</p>;
  }

  return (
    <HomePageLayout
      dashboard={
        <>
          {loading || !data ? <p className="text-sm text-zinc-500">{t(filters.language, "loading")}</p> : null}

          {data ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
              <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-platform-navy">
                    {filters.language === "Français" ? "Tableau de bord exécutif" : "Executive dashboard"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {filters.language === "Français"
                      ? "KPIs réseau, évolution et couverture technologique"
                      : "Network KPIs, evolution and technology coverage"}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 xl:grid-cols-12">
            <article className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-teal-50/40 p-3 xl:col-span-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-platform-navy">{filters.language === "Français" ? "Sites réseau" : "Network sites"}</p>
              <p className="mt-1 text-3xl font-extrabold leading-none text-slate-900">{kpiGraph.sites}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-semibold">
                <div className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-700">
                  {filters.language === "Français" ? "Actifs" : "Active"} <span className="ml-1 text-[#1ABC9C]">{kpiGraph.active}</span>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-700">
                  {filters.language === "Français" ? "Bloqués" : "Blocked"} <span className="ml-1 text-[#E74C3C]">{kpiGraph.blocked}</span>
                </div>
              </div>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-3 xl:col-span-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-platform-navy">{filters.language === "Français" ? "Disponibilité" : "Availability"}</p>
              <p className="mt-1 text-3xl font-extrabold leading-none text-slate-900">{kpiGraph.availability}%</p>
              <p className={`mt-2 text-[11px] font-semibold ${overview.availabilityDelta >= 0 ? "text-[#1ABC9C]" : "text-[#E74C3C]"}`}>
                {overview.availabilityDelta >= 0 ? "+" : ""}
                {overview.availabilityDelta}% {filters.language === "Français" ? "vs snapshot précédent" : "vs previous snapshot"}
              </p>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-3 xl:col-span-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-platform-navy">{filters.language === "Français" ? "Santé réseau" : "Network health"}</p>
              <div className="mt-2 flex items-center gap-3">
                <div
                  className="relative h-14 w-14 rounded-full"
                  style={{ background: `conic-gradient(${CHART_PRIMARY} ${kpiGraph.availability}%, ${CHART_RING_TRACK} 0)` }}
                >
                  <div className="absolute inset-[6px] rounded-full bg-white" />
                </div>
                <div>
                  <p className="text-lg font-extrabold text-slate-900">{overview.activeRate}%</p>
                  <p className="text-[11px] font-semibold text-slate-500">{filters.language === "Français" ? "taux actifs" : "active rate"}</p>
                </div>
              </div>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-3 xl:col-span-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-platform-navy">
                {filters.language === "Français" ? "Équipements / site" : "Equipment / site"}
              </p>
              <p className="text-3xl font-extrabold leading-none text-slate-900">{kpiGraph.equipmentPerSite}</p>
              <div className="mt-2 h-2 rounded-full bg-teal-100">
                <div className="h-2 rounded-full bg-teal-500" style={{ width: `${kpiGraph.equipmentDensityRate}%` }} />
              </div>
              <p className="mt-2 text-[11px] font-semibold text-slate-500">
                {kpiGraph.equipment} {filters.language === "Français" ? "équipements total" : "total equipment"}
              </p>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-3 xl:col-span-6">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-platform-navy">{filters.language === "Français" ? "Évolution sites" : "Sites evolution"}</p>
              <SummaryLineChart data={data.summary} xKey="snapshot_date" yKey="nb_sites" height={175} framed={false} />
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-3 xl:col-span-6">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-platform-navy">{filters.language === "Français" ? "Actifs vs bloqués" : "Active vs blocked"}</p>
              <MultiBarChart
                data={data.summary}
                xKey="snapshot_date"
                height={175}
                framed={false}
                bars={[
                  { key: "active_sites", color: CHART_PRIMARY, yAxisId: "left" },
                  { key: "blocked_sites", color: CHART_SECONDARY, yAxisId: "right" },
                ]}
              />
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-3 xl:col-span-12">
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
                <div className="xl:col-span-8">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-platform-navy">
                    {filters.language === "Français" ? "Couverture technologique" : "Technology coverage"}
                  </p>
                  <MultiBarChart
                    data={cellsChartData}
                    xKey="snapshot_date"
                    height={165}
                    framed={false}
                    bars={[
                      { key: "cells_2g", color: TECH_COLORS.cells_2g },
                      { key: "cells_3g", color: TECH_COLORS.cells_3g },
                      { key: "cells_4g", color: TECH_COLORS.cells_4g },
                      { key: "cells_5g", color: TECH_COLORS.cells_5g },
                    ]}
                  />
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-2.5 xl:col-span-4">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-platform-navy">
                    {filters.language === "Français" ? "Détail des cellules (dernier snapshot)" : "Cell details (latest snapshot)"}
                  </p>
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <table className="w-full border-collapse text-xs">
                      <thead className="bg-teal-50/70">
                        <tr>
                          <th className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold text-platform-navy">
                            {filters.language === "Français" ? "Type cellule" : "Cell type"}
                          </th>
                          <th className="border-b border-slate-200 px-2 py-1.5 text-right font-semibold text-platform-navy">
                            {filters.language === "Français" ? "Valeur" : "Value"}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {latestCellsTable.map((row) => (
                          <tr key={row.label} className="odd:bg-white even:bg-slate-50/80">
                            <td className="border-b border-slate-200/70 px-2 py-1.5 font-semibold text-slate-700">{row.label}</td>
                            <td className="border-b border-slate-200/70 px-2 py-1.5 text-right font-bold text-slate-900">{row.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </article>
              </div>
            </section>
          ) : null}
        </>
      }
    />
  );
}
