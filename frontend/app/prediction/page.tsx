"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { MultiBarChart } from "@/components/charts";
import { PageShell } from "@/components/page-shell";
import { useAppContext } from "@/components/app-provider";
import { getPrediction } from "@/lib/api";
import { t } from "@/lib/i18n";

export default function PredictionPage() {
  const { payload, filters } = useAppContext();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!payload.effective_dates.length && !payload.selected_dates.length) {
        setRows([]);
        return;
      }
      const data = await getPrediction(payload);
      setRows(data);
    };
    void load();
  }, [payload]);

  return (
    <PageShell title={t(filters.language, "page_pred_title")} subtitle={t(filters.language, "subtitle_prediction")}>
      <MultiBarChart
        data={rows}
        xKey="object_type"
        bars={[
          { key: "forecast_changes_30d", color: "#dc2626" },
          { key: "forecast_changes_90d", color: "#f97316" },
        ]}
      />
      <DataTable rows={rows} />
    </PageShell>
  );
}
