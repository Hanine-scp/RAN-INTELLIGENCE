"use client";

import { useEffect, useMemo, useState } from "react";
import { MultiBarChart } from "@/components/charts";
import { DataTable } from "@/components/data-table";
import { KpiCards } from "@/components/kpi-cards";
import { PageShell } from "@/components/page-shell";
import { useAppContext } from "@/components/app-provider";
import { getReplacements } from "@/lib/api";
import { t } from "@/lib/i18n";

export default function ReplacementsPage() {
  const { payload, filters } = useAppContext();
  const isFr = filters.language === "Français";
  const [data, setData] = useState<Awaited<ReturnType<typeof getReplacements>> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!payload.effective_dates.length && !payload.selected_dates.length) {
        setData(null);
        return;
      }
      try {
        const result = await getReplacements(payload);
        setData(result);
        setError("");
      } catch (e) {
        setData(null);
        setError(e instanceof Error ? e.message : "Load failed");
      }
    };
    void load();
  }, [payload]);

  const kpis = useMemo(
    () => [
      { label: isFr ? "Modules retirés" : "Modules removed", value: String(data?.summary.total_removed ?? 0) },
      { label: isFr ? "Modules ajoutés" : "Modules added", value: String(data?.summary.total_added ?? 0) },
      { label: isFr ? "Types impactés" : "Types impacted", value: String(data?.summary.object_types_impacted ?? 0) },
      {
        label: isFr ? "Période" : "Period",
        value: `${String(data?.summary.compare_date_from ?? "—")} → ${String(data?.summary.compare_date_to ?? "—")}`,
      },
    ],
    [data, isFr],
  );

  const timelineChart = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const row of data?.timeline_by_type ?? []) {
      const date = String(row.snapshot_date ?? "");
      const type = String(row.object_type ?? "");
      const current = map.get(date) ?? { snapshot_date: date };
      current[type] = Number(row.replacements ?? 0);
      map.set(date, current);
    }
    return Array.from(map.values());
  }, [data]);

  const timelineBars = useMemo(() => {
    const keys = new Set<string>();
    for (const row of data?.timeline_by_type ?? []) keys.add(String(row.object_type ?? ""));
    const palette = ["#dc2626", "#ef4444", "#f97316", "#94a3b8", "#64748b"];
    return Array.from(keys).map((key, i) => ({ key, color: palette[i % palette.length] }));
  }, [data]);

  return (
    <PageShell title={t(filters.language, "page_replacements_title")} subtitle={t(filters.language, "subtitle_replacements")}>
      {error ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</p> : null}
      {data?.reason === "vendor_lake_empty" ? (
        <p className="rounded-xl border border-dashed border-amber-200 bg-amber-50/80 p-6 text-center text-sm text-amber-900">
          {t(filters.language, "vendor_scaffold_message")}
        </p>
      ) : (
        <>
          <KpiCards items={kpis} />
          <MultiBarChart
            data={(data?.by_type_between_periods ?? []).map((r) => ({
              object_type: r.object_type,
              removed: r.modules_removed,
              added: r.modules_added,
            }))}
            xKey="object_type"
            bars={[
              { key: "removed", color: "#dc2626" },
              { key: "added", color: "#94a3b8" },
            ]}
          />
          {timelineChart.length ? (
            <MultiBarChart data={timelineChart} xKey="snapshot_date" bars={timelineBars} />
          ) : null}
          <DataTable rows={data?.top_changes ?? []} />
        </>
      )}
    </PageShell>
  );
}
