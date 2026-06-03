"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { KpiCards } from "@/components/kpi-cards";
import { MultiBarChart } from "@/components/charts";
import { PageShell } from "@/components/page-shell";
import { getDelta } from "@/lib/api";

export default function DeltaPage() {
  const [data, setData] = useState<{
    metrics: Record<string, unknown>[];
    numeric_metrics: Record<string, unknown>[];
    site_changes: Record<string, unknown>[];
    summary: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    void getDelta().then(setData);
  }, []);

  const kpis =
    data == null
      ? []
      : [
          { label: "Sites ajoutes", value: String(data.summary.added_sites ?? 0) },
          { label: "Sites supprimes", value: String(data.summary.removed_sites ?? 0) },
          { label: "Delta equipements", value: String(data.summary.equipment_delta ?? 0) },
        ];

  return (
    <PageShell title="Delta" subtitle="Comparaison entre snapshots Nokia">
      {data ? (
        <>
          <KpiCards items={kpis} />
          <MultiBarChart data={data.numeric_metrics} xKey="metric" bars={[{ key: "delta_numeric", color: "#dc2626" }]} />
          <DataTable rows={data.metrics} />
          <DataTable rows={data.site_changes} />
        </>
      ) : (
        <p className="text-sm text-zinc-500">Loading...</p>
      )}
    </PageShell>
  );
}
