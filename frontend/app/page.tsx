/* eslint-disable @typescript-eslint/no-unnecessary-condition */
"use client";

import { useEffect, useMemo, useState } from "react";
import { getDashboard } from "@/lib/api";
import { useAppContext } from "@/components/app-provider";
import { t } from "@/lib/i18n";
import { KpiCards } from "@/components/kpi-cards";
import { DataTable } from "@/components/data-table";
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

  const kpis = useMemo(() => {
    if (!data) {
      return [];
    }
    return [
      { label: "Sites", value: String(data.kpis.total_sites ?? 0) },
      { label: "Active", value: String(data.kpis.active_sites ?? 0) },
      { label: "Blocked", value: String(data.kpis.blocked_sites ?? 0) },
      { label: "Equipment", value: String(data.kpis.total_equipment ?? 0) },
      { label: "Availability", value: `${data.kpis.availability_percent ?? 0}%` },
    ];
  }, [data]);

  if (!payload.selected_dates.length && !payload.effective_dates?.length) {
    return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4">{t(filters.language, "warning_dates")}</p>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-gradient-to-r from-red-700 to-red-500 p-6 text-white shadow-sm">
        <h1 className="text-2xl font-extrabold">{t(filters.language, "hero_title")}</h1>
        <p className="mt-1 text-sm text-red-50">{t(filters.language, "hero_sub")}</p>
        {data ? (
          <p className="mt-3 text-xs font-semibold">
            {data.period.oldest_date} - {data.period.latest_date} ({data.period.snapshot_count} snapshots)
          </p>
        ) : null}
      </section>

      {loading || !data ? <p className="text-sm text-zinc-500">Loading...</p> : <KpiCards items={kpis} />}

      {data ? (
        <>
          <SummaryLineChart data={data.summary} xKey="snapshot_date" yKey="nb_sites" />
          <MultiBarChart
            data={data.summary}
            xKey="snapshot_date"
            bars={[
              { key: "active_sites", color: "#dc2626" },
              { key: "blocked_sites", color: "#fca5a5" },
            ]}
          />
          <MultiBarChart
            data={data.summary}
            xKey="snapshot_date"
            bars={[
              { key: "cells_2g", color: "#7f1d1d" },
              { key: "cells_3g", color: "#b91c1c" },
              { key: "cells_4g", color: "#ef4444" },
              { key: "cells_5g", color: "#fca5a5" },
            ]}
          />
          <DataTable rows={data.summary} />
        </>
      ) : null}
    </div>
  );
}
