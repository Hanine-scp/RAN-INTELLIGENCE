"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import { PageLoadingSkeleton } from "@/components/skeleton";
import { useAppContext } from "@/components/app-provider";
import { getGuardianAnomalies, getGuardianOverview, getGuardianRisks } from "@/lib/api";
import { t } from "@/lib/i18n";
import type { GuardianHubTab } from "@/components/guardian-data-hub-tabs";

type GuardianHubSectionProps = {
  onNavigateTab?: (tab: GuardianHubTab) => void;
};

function KpiCard({
  label,
  value,
  hint,
  accentClass,
  onNavigate,
  navigateLabel,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accentClass: string;
  onNavigate?: () => void;
  navigateLabel?: string;
}) {
  const Wrapper = onNavigate ? "button" : "article";
  return (
    <Wrapper
      type={onNavigate ? "button" : undefined}
      onClick={onNavigate}
      className={`rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition ${
        onNavigate ? "hover:border-teal-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-200" : ""
      }`}
    >
      <p className={`text-[10px] font-semibold uppercase tracking-wide ${accentClass}`}>{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
      {hint ? <p className="text-[11px] text-slate-500">{hint}</p> : null}
      {onNavigate && navigateLabel ? (
        <p className="mt-2 text-[10px] font-semibold text-teal-700">{navigateLabel} →</p>
      ) : null}
    </Wrapper>
  );
}

export function GuardianHubSection({ onNavigateTab }: GuardianHubSectionProps) {
  const { payload, filters } = useAppContext();
  const lang = filters.language;
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [anomalies, setAnomalies] = useState<Record<string, unknown>[]>([]);
  const [risks, setRisks] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const hasSelection = Boolean(payload.effective_dates.length || payload.selected_dates.length);
  const detailLabel = t(lang, "guardian_hub_view_detail");

  const load = useCallback(async () => {
    if (!hasSelection) {
      setOverview(null);
      setAnomalies([]);
      setRisks([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [ov, an, rk] = await Promise.all([
        getGuardianOverview(payload),
        getGuardianAnomalies(payload),
        getGuardianRisks(payload),
      ]);
      setOverview(ov);
      setAnomalies(an.rows ?? []);
      setRisks(rk.rows ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Guardian load failed");
    } finally {
      setLoading(false);
    }
  }, [hasSelection, payload]);

  useEffect(() => {
    void load();
  }, [load]);

  const integrity = useMemo(() => (overview?.integrity as Record<string, unknown>) ?? {}, [overview]);
  const changeSample = useMemo(
    () => (overview?.change_events_sample as Record<string, unknown>[]) ?? [],
    [overview],
  );

  const anomalyCount = Number(overview?.anomaly_count ?? anomalies.length);
  const riskCount = Number(overview?.risk_count ?? risks.length);
  const changeCount = Number(overview?.change_events_count ?? 0);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">
          {t(lang, "guardian_hub_eyebrow")}
        </p>
        <p className="mt-1 text-sm font-semibold text-slate-800">{t(lang, "guardian_hub_engines_intro")}</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">{t(lang, "guardian_hub_engines_desc")}</p>
      </section>

      {!hasSelection ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {t(lang, "guardian_select_snapshot")}
        </p>
      ) : loading ? (
        <PageLoadingSkeleton />
      ) : error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <KpiCard
              label={t(lang, "guardian_step_integrity")}
              value={String(integrity.status ?? "—")}
              hint={`${t(lang, "guardian_completeness")}: ${String(integrity.completeness_rate ?? "—")}%`}
              accentClass="text-teal-700"
            />
            <KpiCard
              label={t(lang, "guardian_step_changes")}
              value={changeCount}
              accentClass="text-sky-700"
              onNavigate={onNavigateTab ? () => onNavigateTab("changements") : undefined}
              navigateLabel={changeCount > 0 ? detailLabel : undefined}
            />
            <KpiCard
              label={t(lang, "guardian_step_anomalies")}
              value={anomalyCount}
              accentClass="text-amber-700"
              onNavigate={onNavigateTab ? () => onNavigateTab("anomalies") : undefined}
              navigateLabel={anomalyCount > 0 ? detailLabel : undefined}
            />
            <KpiCard
              label={t(lang, "guardian_step_risks")}
              value={riskCount}
              accentClass="text-violet-700"
              onNavigate={onNavigateTab ? () => onNavigateTab("cartes-risque") : undefined}
              navigateLabel={riskCount > 0 ? detailLabel : undefined}
            />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-2 text-sm font-semibold text-slate-800">{t(lang, "guardian_integrity_title")}</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-700 md:grid-cols-4">
              <p>
                <span className="font-semibold">{t(lang, "guardian_snapshot")}:</span>{" "}
                {String(integrity.snapshot_date ?? overview?.latest_snapshot ?? "—")}
              </p>
              <p>
                <span className="font-semibold">{t(lang, "guardian_files")}:</span> {String(integrity.file_count ?? "—")} /{" "}
                {String(integrity.parsed_file_count ?? "—")}
              </p>
              <p>
                <span className="font-semibold">{t(lang, "guardian_hash")}:</span> {String(integrity.snapshot_hash ?? "—").slice(0, 12)}…
              </p>
              <p>
                <span className="font-semibold">{t(lang, "guardian_ai_allowed")}:</span>{" "}
                {integrity.ai_allowed ? t(lang, "yes") : t(lang, "no")}
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800">{t(lang, "guardian_changes_title")}</p>
              {onNavigateTab && changeSample.length ? (
                <button
                  type="button"
                  onClick={() => onNavigateTab("changements")}
                  className="text-xs font-semibold text-teal-700 hover:text-teal-900"
                >
                  {detailLabel} →
                </button>
              ) : null}
            </div>
            {changeSample.length ? (
              <DataTable
                rows={changeSample}
                exportFileName="guardian_change_events"
                showControls
                showSelection={false}
                visibleColumns={[
                  "change_type",
                  "entity_type",
                  "entity_id",
                  "parent_site_id",
                  "severity",
                  "confidence",
                  "replacement_score",
                ]}
                maxHeightClassName="max-h-[40vh]"
              />
            ) : (
              <p className="text-sm text-slate-500">{t(lang, "guardian_no_events")}</p>
            )}
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{t(lang, "guardian_anomalies_title")}</p>
                  <p className="mt-1 text-xs text-slate-500">{t(lang, "guardian_hub_engine_anomalies_hint")}</p>
                </div>
                {onNavigateTab && anomalies.length ? (
                  <button
                    type="button"
                    onClick={() => onNavigateTab("anomalies")}
                    className="shrink-0 text-xs font-semibold text-teal-700 hover:text-teal-900"
                  >
                    {t(lang, "guardian_hub_tab_anomalie")} →
                  </button>
                ) : null}
              </div>
              <DataTable
                rows={anomalies}
                exportFileName="guardian_anomalies"
                showControls
                showSelection={false}
                visibleColumns={["anomaly_type", "entity_type", "entity_id", "parent_site_id", "severity", "detector_name", "anomaly_score"]}
                maxHeightClassName="max-h-[40vh]"
              />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">{t(lang, "guardian_risks_title")}</p>
                {onNavigateTab && risks.length ? (
                  <button
                    type="button"
                    onClick={() => onNavigateTab("cartes-risque")}
                    className="text-xs font-semibold text-teal-700 hover:text-teal-900"
                  >
                    {detailLabel} →
                  </button>
                ) : null}
              </div>
              <DataTable
                rows={risks}
                exportFileName="guardian_risk_predictions"
                showControls
                showSelection={false}
                visibleColumns={["entity_id", "risk_type", "risk_score", "risk_level", "horizon_days", "model_name"]}
                maxHeightClassName="max-h-[40vh]"
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
