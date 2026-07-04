"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/ui/data-table";
import { KpiCards } from "@/components/ui/kpi-cards";
import { MultiBarChart } from "@/components/charts/charts";
import { useAppContext } from "@/components/providers/app-provider";
import { getAnomalies } from "@/lib/api";
import { CHART_PRIMARY, SEVERITY_COLORS } from "@/lib/chart-theme";
import { cellValueLabel, t } from "@/lib/i18n";

type AnomalyRow = Record<string, unknown>;

type AnomalyResponse = {
  rows: AnomalyRow[];
  site_summary: AnomalyRow[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    sites_impacted: number;
  };
  severity_chart: { level: string; count: number }[];
  ml: {
    available: boolean;
    summary: { sites: number; anomalies: number; contamination: number };
    feature_importance: { feature: string; importance: number }[];
    top_sites: AnomalyRow[];
    ml_only: AnomalyRow[];
  };
  params: { replacement_threshold: number; snapshots: number };
};

const EMPTY: AnomalyResponse = {
  rows: [],
  site_summary: [],
  summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, sites_impacted: 0 },
  severity_chart: [],
  ml: { available: false, summary: { sites: 0, anomalies: 0, contamination: 0.05 }, feature_importance: [], top_sites: [], ml_only: [] },
  params: { replacement_threshold: 3, snapshots: 0 },
};

const LEVEL_COLOR: Record<string, string> = {
  Critical: SEVERITY_COLORS.Critical,
  High: SEVERITY_COLORS.High,
  Medium: SEVERITY_COLORS.Medium,
  Low: SEVERITY_COLORS.Low,
};

export function AnomaliesSection() {
  const { payload, filters } = useAppContext();
  const fr = filters.language === "Français";
  const [data, setData] = useState<AnomalyResponse>(EMPTY);
  const [threshold, setThreshold] = useState(3);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [hideAck, setHideAck] = useState(false);
  const [truePositives, setTruePositives] = useState(0);
  const [falsePositives, setFalsePositives] = useState(0);

  const hasDates = payload.effective_dates.length > 0 || payload.selected_dates.length > 0;

  useEffect(() => {
    const load = async () => {
      if (!hasDates) {
        setData(EMPTY);
        return;
      }
      setLoading(true);
      setErrorMessage("");
      try {
        const result = await getAnomalies(payload, threshold);
        setData(result);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Anomaly detection failed.");
        setData(EMPTY);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [payload, threshold, hasDates]);

  const kpis = useMemo(
    () => [
      { label: t(filters.language, "anomaly_kpi_total"), value: String(data.summary.total) },
      { label: t(filters.language, "anomaly_kpi_critical"), value: String(data.summary.critical) },
      { label: t(filters.language, "anomaly_kpi_high"), value: String(data.summary.high) },
      { label: t(filters.language, "anomaly_kpi_medium"), value: String(data.summary.medium) },
      { label: t(filters.language, "anomaly_kpi_sites_impacted"), value: String(data.summary.sites_impacted) },
    ],
    [data.summary, filters.language],
  );

  const displayRows = useMemo<AnomalyRow[]>(() => {
    const ackSet = new Set(acknowledged);
    return data.rows
      .map((row) => {
        const alertId = String(row.alert_id ?? "");
        const isAck = ackSet.has(alertId);
        return {
          alert_id: alertId,
          site_id: String(row.site_id ?? ""),
          site_name: String(row.site_name ?? ""),
          anomaly_type: String(row.anomaly_type ?? ""),
          detail: String(row.detail ?? ""),
          severity_score: Number(row.severity_score ?? 0),
          level: String(row.level ?? ""),
          evidence: String(row.evidence ?? ""),
          status: isAck
            ? t(filters.language, "anomaly_status_acknowledged")
            : t(filters.language, "anomaly_status_active"),
        } as AnomalyRow;
      })
      .filter((row) => (hideAck ? !acknowledged.includes(String(row.alert_id)) : true));
  }, [data.rows, acknowledged, hideAck, filters.language]);

  const severityData = useMemo(
    () => data.severity_chart.filter((entry) => entry.count > 0),
    [data.severity_chart],
  );

  const precision = useMemo(() => {
    const evaluated = truePositives + falsePositives;
    if (!evaluated) return "—";
    return `${Math.round((truePositives / evaluated) * 100)}%`;
  }, [truePositives, falsePositives]);

  const toggleAcknowledge = useCallback((rowKey: string, checked: boolean) => {
    setAcknowledged((prev) => (checked ? [...new Set([...prev, rowKey])] : prev.filter((id) => id !== rowKey)));
  }, []);

  const exportReport = useCallback(() => {
    const lines = [
      `# ${fr ? "Rapport anomalies RAN" : "RAN anomaly report"}`,
      `${fr ? "Snapshots analysés" : "Analyzed snapshots"}: ${data.params.snapshots}`,
      `${fr ? "Seuil remplacements" : "Replacement threshold"}: ${data.params.replacement_threshold}`,
      `Critical: ${data.summary.critical} | High: ${data.summary.high} | Medium: ${data.summary.medium} | Low: ${data.summary.low}`,
      "",
      ...data.rows.map(
        (row) =>
          `[${row.level}] ${row.alert_id} · ${row.site_id} · ${row.anomaly_type} · ${row.detail} (score ${row.severity_score})`,
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `anomalies_${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }, [data, fr]);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">
          {t(filters.language, "guardian_hub_tab_noc_alerts")}
        </p>
        <p className="mt-1 text-sm text-slate-600">{t(filters.language, "anomalies_noc_intro")}</p>
      </section>

      {!hasDates ? (
        <div className="rounded-2xl border border-red-100 bg-red-50/40 px-6 py-10 text-center text-sm text-slate-600">
          {fr
            ? "Sélectionnez au moins un snapshot dans le panneau de filtres pour lancer la détection d’anomalies."
            : "Select at least one snapshot in the filter panel to run anomaly detection."}
        </div>
      ) : (
        <div className="space-y-5">
          <section className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                {fr ? "Seuil remplacements / site" : "Replacement threshold / site"}
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={threshold}
                  onChange={(event) => setThreshold(Math.max(1, Math.min(50, Number(event.target.value) || 1)))}
                  className="w-28 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-800 focus:border-red-400 focus:outline-none"
                />
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <input type="checkbox" checked={hideAck} onChange={(event) => setHideAck(event.target.checked)} />
                {fr ? "Masquer les alertes acquittées" : "Hide acknowledged alerts"}
              </label>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                {fr ? "Précision experte" : "Expert precision"}: {precision}
              </span>
              <button
                type="button"
                onClick={exportReport}
                className="rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
              >
                {fr ? "Exporter le rapport" : "Export report"}
              </button>
            </div>
          </section>

          {errorMessage ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{errorMessage}</p>
          ) : null}

          <KpiCards items={kpis} />

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-1">
              <p className="mb-2 text-sm font-semibold text-slate-700">{fr ? "Répartition par sévérité" : "Severity breakdown"}</p>
              {severityData.length ? (
                <MultiBarChart
                  data={severityData}
                  xKey="level"
                  bars={[{ key: "count", color: CHART_PRIMARY }]}
                  height={240}
                />
              ) : (
                <div className="flex h-[240px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">
                  {loading ? (fr ? "Analyse..." : "Analyzing...") : fr ? "Aucune anomalie détectée." : "No anomaly detected."}
                </div>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(["Critical", "High", "Medium", "Low"] as const).map((level) => (
                  <div key={level} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: LEVEL_COLOR[level] }} />
                    <span className="font-semibold text-slate-700">{cellValueLabel(filters.language, "level", level) ?? level}</span>
                    <span className="ml-auto font-bold text-slate-900">
                      {level === "Critical"
                        ? data.summary.critical
                        : level === "High"
                          ? data.summary.high
                          : level === "Medium"
                            ? data.summary.medium
                            : data.summary.low}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="xl:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">{fr ? "Validation expert (KPI démo)" : "Expert validation (demo KPI)"}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTruePositives((value) => value + 1)}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    {fr ? "Vrai positif" : "True positive"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFalsePositives((value) => value + 1)}
                    className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                  >
                    {fr ? "Faux positif" : "False positive"}
                  </button>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                <p>
                  {fr
                    ? "Cochez « Statut » pour acquitter une alerte. Validez chaque alerte comme vrai/faux positif pour calculer la précision du moteur de règles (validée par un expert)."
                    : "Tick the status column to acknowledge an alert. Mark each alert as true/false positive to compute the rule engine precision (expert validated)."}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-slate-200 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">{fr ? "Vrais positifs" : "True positives"}</p>
                    <p className="text-xl font-bold text-emerald-700">{truePositives}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">{fr ? "Faux positifs" : "False positives"}</p>
                    <p className="text-xl font-bold text-amber-700">{falsePositives}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">{fr ? "Acquittées" : "Acknowledged"}</p>
                    <p className="text-xl font-bold text-slate-900">{acknowledged.length}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section>
            <p className="mb-2 text-sm font-semibold text-slate-700">{fr ? "Alertes détaillées" : "Detailed alerts"}</p>
            <DataTable
              rows={displayRows}
              maxHeightClassName="max-h-[55vh]"
              visibleColumns={[
                "alert_id",
                "site_id",
                "site_name",
                "anomaly_type",
                "detail",
                "severity_score",
                "level",
                "evidence",
                "status",
              ]}
              rowSelection={{
                rowKey: "alert_id",
                selectedKeys: acknowledged,
                onToggle: toggleAcknowledge,
                headerLabel: fr ? "Acquitter" : "Ack",
              }}
            />
          </section>

          <section>
            <p className="mb-2 text-sm font-semibold text-slate-700">{fr ? "Synthèse par site (sites à risque)" : "Per-site summary (at-risk sites)"}</p>
            <DataTable rows={data.site_summary} showSelection={false} maxHeightClassName="max-h-[40vh]" />
          </section>

          <section className="space-y-4 rounded-2xl border border-violet-100 bg-violet-50/30 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold text-violet-800">
                  <span className="h-2.5 w-2.5 rounded-full bg-violet-600" />
                  {fr ? "Modèle non supervisé · Isolation Forest" : "Unsupervised model · Isolation Forest"}
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  {fr
                    ? "Baseline (règles métier) vs modèle avancé (détection d’outliers multivariée). Chaque score est justifié par les variables contributrices."
                    : "Baseline (business rules) vs advanced model (multivariate outlier detection). Each score is justified by its contributing features."}
                </p>
              </div>
              {data.ml.available ? (
                <div className="flex gap-2 text-xs font-semibold">
                  <span className="rounded-full border border-violet-200 bg-white px-3 py-1 text-violet-700">
                    {fr ? "Sites analysés" : "Sites analyzed"}: {data.ml.summary.sites}
                  </span>
                  <span className="rounded-full border border-violet-200 bg-white px-3 py-1 text-violet-700">
                    {fr ? "Outliers IA" : "AI outliers"}: {data.ml.summary.anomalies}
                  </span>
                  <span className="rounded-full border border-violet-200 bg-white px-3 py-1 text-violet-700">
                    contamination: {Math.round(data.ml.summary.contamination * 100)}%
                  </span>
                </div>
              ) : null}
            </div>

            {!data.ml.available ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {fr
                  ? "Modèle ML indisponible (≥ 12 sites requis ou scikit-learn manquant). Les règles métier restent actives."
                  : "ML model unavailable (≥ 12 sites required or scikit-learn missing). Business rules remain active."}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-700">{fr ? "Importance des variables (explicabilité)" : "Feature importance (explainability)"}</p>
                  {data.ml.feature_importance.length ? (
                    <MultiBarChart
                      data={data.ml.feature_importance}
                      xKey="feature"
                      bars={[{ key: "importance", color: "#7c3aed" }]}
                      height={260}
                    />
                  ) : null}
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-700">{fr ? "Top sites par score IA (avec justification)" : "Top sites by AI score (with justification)"}</p>
                  <DataTable rows={data.ml.top_sites} showSelection={false} maxHeightClassName="max-h-[260px]" />
                </div>
              </div>
            )}

            {data.ml.available && data.ml.ml_only.length ? (
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-700">
                  {fr ? "Détectés par l’IA seule (non couverts par les règles)" : "Detected by AI only (not covered by rules)"}
                </p>
                <DataTable rows={data.ml.ml_only} showSelection={false} maxHeightClassName="max-h-[40vh]" />
              </div>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
