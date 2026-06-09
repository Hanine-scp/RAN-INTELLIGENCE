"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import { KpiCards } from "@/components/kpi-cards";
import { PageShell } from "@/components/page-shell";
import { useAppContext } from "@/components/app-provider";
import { getGlobalCounters } from "@/lib/api";
import { t } from "@/lib/i18n";

export default function GlobalCountersPage() {
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
      const data = await getGlobalCounters(payload);
      setRows(data.rows);
      setSummary(data.summary);
    };
    void load();
  }, [payload]);

  const kpis = useMemo(
    () => [
      { label: "Object types", value: String(summary.object_type_count ?? 0) },
      { label: "Raw records", value: String(summary.raw_records ?? 0) },
      { label: "Unique serials", value: String(summary.unique_serials ?? 0) },
      { label: "Empty serials", value: String(summary.empty_serials ?? 0) },
      { label: "Duplicated serials", value: String(summary.duplicated_serials ?? 0) },
    ],
    [summary],
  );

  return (
    <PageShell title={t(filters.language, "page_global_counters_title")} subtitle="Global Counters Quality View">
      <KpiCards items={kpis} />
      <DataTable rows={rows} />
    </PageShell>
  );
}
