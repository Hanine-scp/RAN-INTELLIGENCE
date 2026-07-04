"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/ui/data-table";
import { MultiBarChart } from "@/components/charts/charts";
import { useAppContext } from "@/components/providers/app-provider";
import { getPrediction } from "@/lib/api";
import { CHART_PRIMARY } from "@/lib/chart-theme";

export function PredictionSection() {
  const { payload } = useAppContext();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!payload.effective_dates.length && !payload.selected_dates.length) {
        setRows([]);
        return;
      }
      setRows(await getPrediction(payload));
    };
    void load();
  }, [payload]);

  return (
    <div className="space-y-4">
      <MultiBarChart
        data={rows}
        xKey="object_type"
        bars={[
          { key: "forecast_changes_30d", color: CHART_PRIMARY },
          { key: "forecast_changes_90d", color: "#f97316" },
        ]}
      />
      <DataTable rows={rows} />
    </div>
  );
}
