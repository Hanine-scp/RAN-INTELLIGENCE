"use client";

import { useEffect, useMemo, useState } from "react";
import { MultiBarChart, SummaryLineChart } from "@/components/charts";
import { DataTable } from "@/components/data-table";
import { PageShell } from "@/components/page-shell";
import { useAppContext } from "@/components/app-provider";
import { getAnalytics } from "@/lib/api";
import { t } from "@/lib/i18n";

export default function AnalyticsPage() {
  const { payload, filters } = useAppContext();
  const [data, setData] = useState<{ summary: Record<string, unknown>[]; equipment: Record<string, unknown>[] }>({
    summary: [],
    equipment: [],
  });

  useEffect(() => {
    const load = async () => {
      if (!payload.effective_dates.length && !payload.selected_dates.length) {
        setData({ summary: [], equipment: [] });
        return;
      }
      const response = await getAnalytics(payload);
      setData(response);
    };
    void load();
  }, [payload]);

  const cellsData = useMemo(
    () =>
      data.summary.map((row) => ({
        snapshot_date: row.snapshot_date,
        cells_2g: row.cells_2g,
        cells_3g: row.cells_3g,
        cells_4g: row.cells_4g,
        cells_5g: row.cells_5g,
      })),
    [data.summary],
  );

  const equipmentByDate = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const row of data.equipment) {
      const date = String(row.snapshot_date ?? "");
      const objectType = String(row.object_type ?? "unknown");
      const count = Number(row.equipment_count ?? 0);
      const current = map.get(date) ?? { snapshot_date: date };
      current[objectType] = count;
      map.set(date, current);
    }
    return Array.from(map.values());
  }, [data.equipment]);

  const equipmentBars = useMemo(() => {
    const keys = new Set<string>();
    for (const row of data.equipment) {
      keys.add(String(row.object_type ?? "unknown"));
    }
    const palette = ["#dc2626", "#f97316", "#f59e0b", "#84cc16", "#22c55e", "#3b82f6", "#a855f7"];
    return Array.from(keys).map((key, index) => ({ key, color: palette[index % palette.length] }));
  }, [data.equipment]);

  return (
    <PageShell title={t(filters.language, "page_ana_title")} subtitle="Analytique avancee du reseau">
      <SummaryLineChart data={data.summary} xKey="snapshot_date" yKey="nb_sites" />
      <MultiBarChart
        data={cellsData}
        xKey="snapshot_date"
        bars={[
          { key: "cells_2g", color: "#7f1d1d" },
          { key: "cells_3g", color: "#b91c1c" },
          { key: "cells_4g", color: "#ef4444" },
          { key: "cells_5g", color: "#fca5a5" },
        ]}
      />
      <MultiBarChart data={equipmentByDate} xKey="snapshot_date" bars={equipmentBars} />
      <DataTable rows={data.summary} />
    </PageShell>
  );
}
