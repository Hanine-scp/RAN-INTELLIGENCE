"use client";

import { useEffect, useMemo, useState } from "react";
import { getDashboard } from "@/lib/api";
import { useAppContext } from "@/components/app-provider";
import { t } from "@/lib/i18n";
import { MultiBarChart, SummaryLineChart } from "@/components/charts";

export default function Home() {
  const { filters, payload } = useAppContext();
  const [data, setData] = useState<{
    period: { latest_date: string; oldest_date: string; snapshot_count: number };
    kpis: Record<string, number>;
    summary: Record<string, unknown>[];
    equipment_summary: Record<string, unknown>[];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!payload.selected_dates.length && !payload.effective_dates?.length) {
        return;
      }
      setLoading(true);
      try {
        const response = await getDashboard(payload);
        setData(response);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [payload]);

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
    const last = cellsChartData[cellsChartData.length - 1];
    const toNumber = (value: unknown) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : 0;
    };
    return [
      { label: "2G", value: toNumber(last.cells_2g) },
      { label: "3G", value: toNumber(last.cells_3g) },
      { label: "4G (Total)", value: toNumber(last.cells_4g_fdd) + toNumber(last.cells_4g_tdd) },
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
    <div className="space-y-3">
      {loading || !data ? <p className="text-sm text-zinc-500">{t(filters.language, "loading")}</p> : null}

      {data ? (
        <section className="rounded-2xl border border-red-100 bg-white p-3 shadow-[0_12px_30px_rgba(220,38,38,0.08)]">
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-12">
            <article className="rounded-xl border border-red-100 bg-red-50/40 p-3 xl:col-span-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">{filters.language === "Français" ? "Sites réseau" : "Network sites"}</p>
              <p className="mt-1 text-3xl font-extrabold leading-none text-slate-900">{kpiGraph.sites}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-semibold">
                <div className="rounded-lg border border-red-200 bg-white px-2 py-1 text-slate-700">
                  {filters.language === "Français" ? "Actifs" : "Active"} <span className="ml-1 text-red-700">{kpiGraph.active}</span>
                </div>
                <div className="rounded-lg border border-red-200 bg-white px-2 py-1 text-slate-700">
                  {filters.language === "Français" ? "Bloqués" : "Blocked"} <span className="ml-1 text-red-700">{kpiGraph.blocked}</span>
                </div>
              </div>
            </article>

            <article className="rounded-xl border border-red-100 bg-white p-3 xl:col-span-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">{filters.language === "Français" ? "Disponibilité" : "Availability"}</p>
              <p className="mt-1 text-3xl font-extrabold leading-none text-slate-900">{kpiGraph.availability}%</p>
              <p className={`mt-2 text-[11px] font-semibold ${overview.availabilityDelta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {overview.availabilityDelta >= 0 ? "+" : ""}
                {overview.availabilityDelta}% {filters.language === "Français" ? "vs snapshot précédent" : "vs previous snapshot"}
              </p>
            </article>

            <article className="rounded-xl border border-red-100 bg-white p-3 xl:col-span-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">{filters.language === "Français" ? "Santé réseau" : "Network health"}</p>
              <div className="mt-2 flex items-center gap-3">
                <div
                  className="relative h-14 w-14 rounded-full"
                  style={{ background: `conic-gradient(#dc2626 ${kpiGraph.availability}%, #fee2e2 0)` }}
                >
                  <div className="absolute inset-[6px] rounded-full bg-white" />
                </div>
                <div>
                  <p className="text-lg font-extrabold text-slate-900">{overview.activeRate}%</p>
                  <p className="text-[11px] font-semibold text-slate-500">{filters.language === "Français" ? "taux actifs" : "active rate"}</p>
                </div>
              </div>
            </article>

            <article className="rounded-xl border border-red-100 bg-white p-3 xl:col-span-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                {filters.language === "Français" ? "Équipements / site" : "Equipment / site"}
              </p>
              <p className="text-3xl font-extrabold leading-none text-slate-900">{kpiGraph.equipmentPerSite}</p>
              <div className="mt-2 h-2 rounded-full bg-red-100">
                <div className="h-2 rounded-full bg-red-500" style={{ width: `${kpiGraph.equipmentDensityRate}%` }} />
              </div>
              <p className="mt-2 text-[11px] font-semibold text-slate-500">
                {kpiGraph.equipment} {filters.language === "Français" ? "équipements total" : "total equipment"}
              </p>
            </article>

            <article className="rounded-xl border border-red-100 bg-white p-3 xl:col-span-6">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-red-700">{filters.language === "Français" ? "Évolution sites" : "Sites evolution"}</p>
              <SummaryLineChart data={data.summary} xKey="snapshot_date" yKey="nb_sites" height={175} framed={false} />
            </article>

            <article className="rounded-xl border border-red-100 bg-white p-3 xl:col-span-6">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-red-700">{filters.language === "Français" ? "Actifs vs bloqués" : "Active vs blocked"}</p>
              <MultiBarChart
                data={data.summary}
                xKey="snapshot_date"
                height={175}
                framed={false}
                bars={[
                  { key: "active_sites", color: "#dc2626", yAxisId: "left" },
                  { key: "blocked_sites", color: "#fca5a5", yAxisId: "right" },
                ]}
              />
            </article>

            <article className="rounded-xl border border-red-100 bg-white p-3 xl:col-span-12">
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
                <div className="xl:col-span-8">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                    {filters.language === "Français" ? "Couverture technologique" : "Technology coverage"}
                  </p>
                  <MultiBarChart
                    data={cellsChartData}
                    xKey="snapshot_date"
                    height={165}
                    framed={false}
                    bars={[
                      { key: "cells_2g", color: "#7f1d1d" },
                      { key: "cells_3g", color: "#b91c1c" },
                      { key: "cells_4g", color: "#ef4444" },
                      { key: "cells_5g", color: "#fca5a5" },
                    ]}
                  />
                </div>
                <div className="rounded-lg border border-red-100 bg-white p-2.5 xl:col-span-4">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                    {filters.language === "Français" ? "Détail des cellules (dernier snapshot)" : "Cell details (latest snapshot)"}
                  </p>
                  <div className="overflow-hidden rounded-lg border border-red-100">
                    <table className="w-full border-collapse text-xs">
                      <thead className="bg-red-50/70">
                        <tr>
                          <th className="border-b border-red-100 px-2 py-1.5 text-left font-semibold text-red-700">
                            {filters.language === "Français" ? "Type cellule" : "Cell type"}
                          </th>
                          <th className="border-b border-red-100 px-2 py-1.5 text-right font-semibold text-red-700">
                            {filters.language === "Français" ? "Valeur" : "Value"}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {latestCellsTable.map((row) => (
                          <tr key={row.label} className="odd:bg-white even:bg-red-50/20">
                            <td className="border-b border-red-100/70 px-2 py-1.5 font-semibold text-slate-700">{row.label}</td>
                            <td className="border-b border-red-100/70 px-2 py-1.5 text-right font-bold text-slate-900">{row.value}</td>
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
    </div>
  );
}
