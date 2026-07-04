"use client";

import { useMemo } from "react";
import { CHART_RING_TRACK, TECH_COLORS } from "@/lib/chart-theme";
import { t } from "@/lib/i18n";
import { aggregateSiteCellTotals } from "@/lib/site-cell-metrics";

type CellTechnologyShareCardProps = {
  rows: Record<string, unknown>[];
  language: "Français" | "English";
};

type TechRing = {
  key: "2G" | "3G" | "4G" | "5G";
  count: number;
  percent: number;
  color: string;
};

function TechShareRing({
  label,
  count,
  percent,
  color,
  cellsLabel,
}: {
  label: string;
  count: number;
  percent: number;
  color: string;
  cellsLabel: string;
}) {
  const safePercent = Math.min(100, Math.max(0, percent));
  const displayPercent = Number.isFinite(safePercent) ? safePercent.toFixed(1) : "0.0";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative flex h-[5.5rem] w-[5.5rem] items-center justify-center">
        <div
          className="absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]"
          style={{
            background: `conic-gradient(${color} ${safePercent}%, ${CHART_RING_TRACK} 0)`,
          }}
        />
        <div className="absolute inset-[9px] flex items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
          <span className="text-sm font-extrabold leading-none text-slate-900">{displayPercent}%</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-800">{label}</p>
        <p className="mt-0.5 text-[10px] font-medium text-slate-500">
          {count.toLocaleString()} {cellsLabel}
        </p>
      </div>
    </div>
  );
}

export function CellTechnologyShareCard({ rows, language }: CellTechnologyShareCardProps) {
  const fr = language === "Français";

  const rings = useMemo(() => {
    const totals = aggregateSiteCellTotals(rows);
    const safeTotal = Math.max(totals.total, 1);
    const toPercent = (value: number) => (totals.total > 0 ? (value / safeTotal) * 100 : 0);

    const items: TechRing[] = [
      { key: "2G", count: totals.cells_2g, percent: toPercent(totals.cells_2g), color: TECH_COLORS["2G"] },
      { key: "3G", count: totals.cells_3g, percent: toPercent(totals.cells_3g), color: TECH_COLORS["3G"] },
      { key: "4G", count: totals.cells_4g, percent: toPercent(totals.cells_4g), color: TECH_COLORS["4G"] },
      { key: "5G", count: totals.cells_5g, percent: toPercent(totals.cells_5g), color: TECH_COLORS["5G"] },
    ];

    return { items, total: totals.total };
  }, [rows]);

  return (
    <article className="rounded-sm border border-[#E8EDF2] bg-white p-4 shadow-none">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2C3E50]">
            {t(language, "table_sites_radio_share_title")}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {fr
              ? "Part de chaque technologie par rapport au total des cellules affichées"
              : "Share of each technology vs total displayed cells"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t(language, "kpi_total_cells")}</p>
          <p className="text-xl font-extrabold leading-none text-slate-900">{rings.total.toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {rings.items.map(({ key, count, percent, color }) => (
          <TechShareRing
            key={key}
            label={key}
            count={count}
            percent={percent}
            color={color}
            cellsLabel={fr ? "cellules" : "cells"}
          />
        ))}
      </div>
    </article>
  );
}
