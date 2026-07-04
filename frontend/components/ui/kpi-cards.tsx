"use client";

import { SummaryLineChart } from "@/components/charts/charts";
import { CHART_NEGATIVE, BRAND } from "@/lib/chart-theme";
import { PBI } from "@/lib/pbi-theme";

type KpiItem = {
  label: string;
  value: string;
  /** Mini sparkline — clé Y dans les points */
  sparkline?: Record<string, unknown>[];
  sparklineXKey?: string;
  sparklineYKey?: string;
  delta?: { label: string; value: string; positive?: boolean };
};

type KpiCardsProps = {
  items: KpiItem[];
};

export function KpiCards({ items }: KpiCardsProps) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {items.map((item) => (
        <article
          key={item.label}
          className="relative overflow-hidden rounded-lg border border-[#E2E8F0] bg-white p-4 shadow-[0_1px_3px_rgba(30,41,59,0.06)]"
        >
          <div
            className="pointer-events-none absolute -right-4 -top-6 h-16 w-16 rotate-12 opacity-[0.07]"
            style={{ backgroundColor: PBI.red }}
            aria-hidden
          />
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#64748B]">{item.label}</p>
          <p className="mt-1 text-3xl font-bold leading-none tracking-tight text-[#ED1C24]">{item.value}</p>
          {item.sparkline && item.sparklineXKey && item.sparklineYKey ? (
            <div className="mt-3 -mx-1">
              <SummaryLineChart
                data={item.sparkline}
                xKey={item.sparklineXKey}
                yKey={item.sparklineYKey}
                height={56}
                framed={false}
                compact
              />
            </div>
          ) : null}
          {item.delta ? (
            <p
              className={`mt-2 text-[11px] font-semibold ${item.delta.positive === false ? "" : ""}`}
              style={item.delta.positive === false ? { color: CHART_NEGATIVE } : { color: BRAND.teal }}
            >
              {item.delta.value}{" "}
              <span className="font-normal text-[#94A3B8]">{item.delta.label}</span>
            </p>
          ) : null}
        </article>
      ))}
    </section>
  );
}
