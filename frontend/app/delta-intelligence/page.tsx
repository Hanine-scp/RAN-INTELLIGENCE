"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { MultiBarChart } from "@/components/charts";
import { PageShell } from "@/components/page-shell";
import { getDelta } from "@/lib/api";
import { useAppContext } from "@/components/app-provider";
import { t } from "@/lib/i18n";

export default function DeltaIntelligencePage() {
  const { filters } = useAppContext();
  const [data, setData] = useState<{
    metrics: Record<string, unknown>[];
    numeric_metrics: Record<string, unknown>[];
    site_changes: Record<string, unknown>[];
  } | null>(null);

  useEffect(() => {
    void getDelta().then((payload) =>
      setData({
        metrics: payload.metrics,
        numeric_metrics: payload.numeric_metrics,
        site_changes: payload.site_changes,
      }),
    );
  }, []);

  return (
    <PageShell title={t(filters.language, "page_di_title")} subtitle="Analyse intelligente des changements">
      {data ? (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <DataTable rows={data.metrics} />
            <MultiBarChart data={data.numeric_metrics} xKey="metric" bars={[{ key: "delta_numeric", color: "#dc2626" }]} />
          </div>
          <DataTable rows={data.site_changes} />
        </>
      ) : (
        <p className="text-sm text-zinc-500">Loading...</p>
      )}
    </PageShell>
  );
}
