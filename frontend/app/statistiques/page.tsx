"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { MultiBarChart } from "@/components/charts";
import { PageShell } from "@/components/page-shell";
import { useAppContext } from "@/components/app-provider";
import { getStatistics } from "@/lib/api";
import { t } from "@/lib/i18n";

export default function StatistiquesPage() {
  const { payload, filters } = useAppContext();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!payload.effective_dates.length && !payload.selected_dates.length) {
        setRows([]);
        return;
      }
      const data = await getStatistics(payload);
      setRows(data);
    };
    void load();
  }, [payload]);

  return (
    <PageShell title={t(filters.language, "page_stats_title")} subtitle="Analyse statistique du reseau">
      <MultiBarChart data={rows} xKey="object_type" bars={[{ key: "total_equipment", color: "#dc2626" }]} />
      <DataTable rows={rows} />
    </PageShell>
  );
}
