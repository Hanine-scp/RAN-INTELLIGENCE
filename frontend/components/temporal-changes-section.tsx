"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import { KpiCards } from "@/components/kpi-cards";
import { useAppContext } from "@/components/app-provider";
import { getTemporalChanges } from "@/lib/api";
import { t } from "@/lib/i18n";

export function TemporalChangesSection() {
  const { payload, filters } = useAppContext();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!payload.effective_dates.length && !payload.selected_dates.length) {
        setRows([]);
        setSummary({});
        setError("");
        return;
      }
      setLoading(true);
      setError("");
      try {
        const data = await getTemporalChanges(payload);
        setRows(data.rows);
        setSummary(data.summary);
      } catch (e) {
        setRows([]);
        setSummary({});
        setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [payload]);

  const kpis = useMemo(
    () => [
      { label: filters.language === "Français" ? "Changements totaux" : "Total changes", value: String(summary.total_changes ?? 0) },
      { label: filters.language === "Français" ? "Nouveaux sites" : "New sites", value: String(summary.new_sites ?? 0) },
      { label: filters.language === "Français" ? "Sites retirés" : "Removed sites", value: String(summary.removed_sites ?? 0) },
      { label: filters.language === "Français" ? "Évolution nette" : "Net evolution", value: String(summary.net_evolution ?? 0) },
      { label: filters.language === "Français" ? "Score stabilité" : "Stability score", value: `${String(summary.stability_score ?? 0)}%` },
    ],
    [summary, filters.language],
  );

  if (!payload.effective_dates.length && !payload.selected_dates.length) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        {t(filters.language, "warning_dates")}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>
      ) : null}
      {loading ? <p className="text-sm text-slate-500">{t(filters.language, "loading")}</p> : null}
      <KpiCards items={kpis} />
      <DataTable rows={rows} />
    </div>
  );
}
