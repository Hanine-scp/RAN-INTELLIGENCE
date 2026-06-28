"use client";

import { MultiBarChart, SummaryLineChart } from "@/components/charts";
import { CHART_PRO, CHART_NEGATIVE, CHART_PRIMARY, CHART_RING_TRACK, CHART_SECONDARY, TECH_COLORS } from "@/lib/chart-theme";
import type { HomeSitesReportContext } from "@/lib/home-sites-report-data";

type HomeExecutiveDashboardSectionProps = {
  context: HomeSitesReportContext;
  language: "Français" | "English";
  compact?: boolean;
};

export function HomeExecutiveDashboardSection({ context, language, compact = false }: HomeExecutiveDashboardSectionProps) {
  const fr = language === "Français";
  const { dashboard, kpiGraph, overview, cellsChartData, latestCellsTable } = context;

  return (
    <section className={`${CHART_PRO.card} p-3`}>
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-platform-navy">
            {fr ? "Tableau de bord exécutif" : "Executive dashboard"}
          </p>
          <p className="text-xs text-slate-500">
            {fr ? "KPIs réseau, évolution et couverture technologique" : "Network KPIs, evolution and technology coverage"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-12">
        <article className={`${CHART_PRO.card} p-3 xl:col-span-3`}>
          <p className={CHART_PRO.cardTitle}>
            {fr ? "Sites réseau" : "Network sites"}
          </p>
          <p className={`mt-1 ${CHART_PRO.cardValue}`}>{kpiGraph.sites}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-semibold">
            <div className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-700">
              {fr ? "Actifs" : "Active"} <span className="ml-1" style={{ color: CHART_PRIMARY }}>{kpiGraph.active}</span>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-700">
              {fr ? "Bloqués" : "Blocked"} <span className="ml-1" style={{ color: CHART_NEGATIVE }}>{kpiGraph.blocked}</span>
            </div>
          </div>
        </article>

        <article className={`${CHART_PRO.card} p-3 xl:col-span-3`}>
          <p className={CHART_PRO.cardTitle}>
            {fr ? "Disponibilité" : "Availability"}
          </p>
          <p className={`mt-1 ${CHART_PRO.cardValue}`}>{kpiGraph.availability}%</p>
          <p className="mt-2 text-[11px] font-semibold" style={{ color: overview.availabilityDelta >= 0 ? CHART_PRIMARY : CHART_NEGATIVE }}>
            {overview.availabilityDelta >= 0 ? "+" : ""}
            {overview.availabilityDelta}% {fr ? "vs snapshot précédent" : "vs previous snapshot"}
          </p>
        </article>

        <article className={`${CHART_PRO.card} p-3 xl:col-span-2`}>
          <p className={CHART_PRO.cardTitle}>
            {fr ? "Santé réseau" : "Network health"}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <div
              className="relative h-14 w-14 rounded-full"
              style={{ background: `conic-gradient(${CHART_PRIMARY} ${kpiGraph.availability}%, ${CHART_RING_TRACK} 0)` }}
            >
              <div className="absolute inset-[6px] rounded-full bg-white" />
            </div>
            <div>
              <p className="text-lg font-extrabold text-slate-900">{overview.activeRate}%</p>
              <p className="text-[11px] font-semibold text-slate-500">{fr ? "taux actifs" : "active rate"}</p>
            </div>
          </div>
        </article>

        <article className={`${CHART_PRO.card} p-3 xl:col-span-2`}>
          <p className={`mb-1 ${CHART_PRO.cardTitle}`}>
            {fr ? "Équipements / site" : "Equipment / site"}
          </p>
          <p className={CHART_PRO.cardValue}>{kpiGraph.equipmentPerSite}</p>
          <div className="mt-2 h-1.5 rounded-full" style={{ background: CHART_RING_TRACK }}>
            <div className="h-1.5 rounded-full" style={{ width: `${kpiGraph.equipmentDensityRate}%`, background: CHART_PRIMARY }} />
          </div>
          <p className="mt-2 text-[11px] font-semibold text-slate-500">
            {kpiGraph.equipment} {fr ? "équipements total" : "total equipment"}
          </p>
        </article>

        <article className={`${CHART_PRO.card} p-3 ${compact ? "xl:col-span-12" : "xl:col-span-6"}`}>
          <p className={`mb-1 ${CHART_PRO.cardTitle}`}>
            {fr ? "Évolution sites" : "Sites evolution"}
          </p>
          <SummaryLineChart data={dashboard.summary} xKey="snapshot_date" yKey="nb_sites" height={175} framed={false} />
        </article>

        <article className={`${CHART_PRO.card} p-3 ${compact ? "xl:col-span-12" : "xl:col-span-6"}`}>
          <p className={`mb-1 ${CHART_PRO.cardTitle}`}>
            {fr ? "Actifs vs bloqués" : "Active vs blocked"}
          </p>
          <MultiBarChart
            data={dashboard.summary}
            xKey="snapshot_date"
            height={175}
            framed={false}
            bars={[
              { key: "active_sites", color: CHART_PRIMARY, yAxisId: "left" },
              { key: "blocked_sites", color: CHART_SECONDARY, yAxisId: "right" },
            ]}
          />
        </article>

        <article className={`${CHART_PRO.card} p-3 xl:col-span-12`}>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
            <div className="xl:col-span-8">
              <p className={`mb-1 ${CHART_PRO.cardTitle}`}>
                {fr ? "Couverture technologique" : "Technology coverage"}
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
                {fr ? "Détail des cellules (dernier snapshot)" : "Cell details (latest snapshot)"}
              </p>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-teal-50/70">
                    <tr>
                      <th className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold text-platform-navy">
                        {fr ? "Type cellule" : "Cell type"}
                      </th>
                      <th className="border-b border-slate-200 px-2 py-1.5 text-right font-semibold text-platform-navy">
                        {fr ? "Valeur" : "Value"}
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
  );
}
