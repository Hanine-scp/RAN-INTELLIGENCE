"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import { KpiCards } from "@/components/kpi-cards";
import { PageShell } from "@/components/page-shell";
import { useAppContext } from "@/components/app-provider";
import { getTemporalChanges } from "@/lib/api";
import { t } from "@/lib/i18n";

export default function TemporalChangesPage() {
  const { payload, filters } = useAppContext();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown>>({});

  useEffect(() => {
    const load = async () => {
      if (!payload.effective_dates.length && !payload.selected_dates.length) {
        setRows([]);
        setSummary({});
        return;
      }
      const data = await getTemporalChanges(payload);
      setRows(data.rows);
      setSummary(data.summary);
    };
    void load();
  }, [payload]);

  const kpis = useMemo(
    () => [
      { label: "Total changes", value: String(summary.total_changes ?? 0) },
      { label: "New sites", value: String(summary.new_sites ?? 0) },
      { label: "Removed sites", value: String(summary.removed_sites ?? 0) },
      { label: "Net evolution", value: String(summary.net_evolution ?? 0) },
      { label: "Stability score", value: `${String(summary.stability_score ?? 0)}%` },
    ],
    [summary],
  );

  return (
    <PageShell title={t(filters.language, "page_temporal_title")} subtitle="Temporal Changes Intelligence">
      <KpiCards items={kpis} />
      <DataTable rows={rows} />
    </PageShell>
  );
}
