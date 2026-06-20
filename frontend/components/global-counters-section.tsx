"use client";

import { useEffect, useMemo, useState } from "react";
import { MultiBarChart } from "@/components/charts";
import { DataTable } from "@/components/data-table";
import { useAppContext } from "@/components/app-provider";
import { getGlobalCounters } from "@/lib/api";
import { CHART_PRIMARY, CHART_SECONDARY, CHART_TERTIARY } from "@/lib/chart-theme";
import { t } from "@/lib/i18n";

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function KpiTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const accentClass =
    tone === "success"
      ? "border-l-teal-500"
      : tone === "warning"
        ? "border-l-amber-400"
        : tone === "danger"
          ? "border-l-rose-400"
          : "border-l-slate-200";
  const valueClass =
    tone === "success"
      ? "text-teal-700"
      : tone === "warning"
        ? "text-amber-700"
        : tone === "danger"
          ? "text-rose-700"
          : "text-slate-900";

  return (
    <article className={`rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm border-l-4 ${accentClass}`}>
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold leading-none ${valueClass}`}>{value}</p>
      {hint ? <p className="mt-1 text-[10px] font-medium text-slate-400">{hint}</p> : null}
    </article>
  );
}

export function GlobalCountersSection() {
  const { payload, filters } = useAppContext();
  const fr = filters.language === "Français";
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const snapshotLabel = useMemo(() => {
    const dates = payload.effective_dates?.length ? payload.effective_dates : payload.selected_dates;
    return dates?.length ? dates.join(", ") : "—";
  }, [payload.effective_dates, payload.selected_dates]);

  useEffect(() => {
    const load = async () => {
      if (!payload.effective_dates.length && !payload.selected_dates.length) {
        setRows([]);
        setSummary({});
        setError("");
        return;
      }
      setLoading(true);
      try {
        const data = await getGlobalCounters(payload);
        setRows(data.rows ?? []);
        setSummary(data.summary ?? {});
        setError("");
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

  const metrics = useMemo(() => {
    const raw = Number(summary.raw_records ?? 0);
    const unique = Number(summary.unique_serials ?? 0);
    const empty = Number(summary.empty_serials ?? 0);
    const duplicated = Number(summary.duplicated_serials ?? 0);
    const types = Number(summary.object_type_count ?? 0);
    const qualityRate = pct(unique, raw);
    const emptyRate = pct(empty, raw);
    const dupRate = pct(duplicated, raw);
    const avgPerType = types > 0 ? Math.round(raw / types) : 0;
    return { raw, unique, empty, duplicated, types, qualityRate, emptyRate, dupRate, avgPerType };
  }, [summary]);

  const chartRows = useMemo(
    () =>
      rows.map((row) => ({
        object_type: String(row.object_type ?? ""),
        unique_serials: Number(row.unique_serials ?? 0),
        empty_serials: Number(row.empty_serials ?? 0),
        duplicated_serials: Number(row.duplicated_serials ?? 0),
        raw_records: Number(row.raw_records ?? 0),
        quality_rate: Number(row.quality_rate ?? 0),
      })),
    [rows],
  );

  const topTypes = useMemo(
    () => [...chartRows].sort((a, b) => b.raw_records - a.raw_records).slice(0, 8),
    [chartRows],
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
      {error ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">{t(filters.language, "loading")}</p> : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-700">
              {fr ? "Patrimoine & qualité serial" : "Heritage & serial quality"}
            </p>
            <h3 className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">
              {t(filters.language, "page_global_counters_title")}
            </h3>
            <p className="mt-1 text-xs text-slate-500">{t(filters.language, "subtitle_counters")}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
              {fr ? "Snapshot actif" : "Active snapshot"}
            </p>
            <p className="text-sm font-bold text-slate-800">{snapshotLabel}</p>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <KpiTile
            label={fr ? "Taux qualité serial" : "Serial quality rate"}
            value={`${metrics.qualityRate}%`}
            hint={`${metrics.unique.toLocaleString()} ${fr ? "serials uniques" : "unique serials"}`}
            tone={metrics.qualityRate >= 90 ? "success" : metrics.qualityRate >= 70 ? "warning" : "danger"}
          />
          <KpiTile
            label={t(filters.language, "kpi_object_types")}
            value={metrics.types.toLocaleString()}
            hint={`${fr ? "Moy." : "Avg."} ${metrics.avgPerType.toLocaleString()} ${fr ? "enreg./type" : "rec./type"}`}
          />
          <KpiTile
            label={t(filters.language, "kpi_raw_records")}
            value={metrics.raw.toLocaleString()}
            hint={fr ? "Enregistrements patrimoine" : "Heritage records"}
          />
          <KpiTile
            label={fr ? "Anomalies serial" : "Serial anomalies"}
            value={(metrics.empty + metrics.duplicated).toLocaleString()}
            hint={`${metrics.emptyRate}% ${fr ? "vides" : "empty"} · ${metrics.dupRate}% ${fr ? "doublons" : "dup."}`}
            tone={metrics.empty + metrics.duplicated > 0 ? "warning" : "success"}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <KpiTile label={t(filters.language, "kpi_unique_serials")} value={metrics.unique.toLocaleString()} />
          <KpiTile label={t(filters.language, "kpi_empty_serials")} value={metrics.empty.toLocaleString()} tone="warning" />
          <KpiTile label={t(filters.language, "kpi_duplicated_serials")} value={metrics.duplicated.toLocaleString()} tone="danger" />
          <KpiTile label={fr ? "Taux vides" : "Empty rate"} value={`${metrics.emptyRate}%`} />
          <KpiTile label={fr ? "Taux doublons" : "Duplicate rate"} value={`${metrics.dupRate}%`} />
        </div>
      </section>

      {chartRows.length ? (
        <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
              {fr ? "Serials uniques vs vides par type" : "Unique vs empty serials by type"}
            </p>
            <MultiBarChart
              data={topTypes}
              xKey="object_type"
              height={240}
              framed
              bars={[
                { key: "unique_serials", color: CHART_PRIMARY },
                { key: "empty_serials", color: CHART_SECONDARY },
              ]}
            />
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
              {fr ? "Volume & doublons par type" : "Volume & duplicates by type"}
            </p>
            <MultiBarChart
              data={topTypes}
              xKey="object_type"
              height={240}
              framed
              bars={[
                { key: "raw_records", color: CHART_SECONDARY },
                { key: "duplicated_serials", color: CHART_TERTIARY },
              ]}
            />
          </article>
        </section>
      ) : null}

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
          {fr ? "Registre compteurs par type équipement" : "Counter register by equipment type"}
        </p>
        <DataTable
          rows={rows}
          showControls
          sortableLargeDataset
          virtualize
          exportFileName={t(filters.language, "page_global_counters_title")}
          visibleColumns={[
            "object_type",
            "raw_records",
            "unique_serials",
            "empty_serials",
            "duplicated_serials",
            "quality_rate",
          ]}
        />
      </div>
    </div>
  );
}
