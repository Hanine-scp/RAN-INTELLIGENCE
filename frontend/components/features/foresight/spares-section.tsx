"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/ui/data-table";
import { KpiCards } from "@/components/ui/kpi-cards";
import { MultiBarChart } from "@/components/charts/charts";
import { useAppContext } from "@/components/providers/app-provider";
import { getSpares, getSparesTracking } from "@/lib/api";
import { CHART_PRIMARY, CHART_SECONDARY } from "@/lib/chart-theme";

type SparesResponse = Awaited<ReturnType<typeof getSpares>>;

const EMPTY: SparesResponse = {
  rows: [],
  summary: {
    product_lines: 0,
    total_installed: 0,
    total_replacements: 0,
    total_recommended: 0,
    horizon_days: 90,
    period_days: 0,
  },
  top_chart: [],
  params: { horizon_days: 90, service_level: 0.95 },
};

export function SparesSection() {
  const { payload, filters } = useAppContext();
  const fr = filters.language === "Français";
  const [data, setData] = useState<SparesResponse>(EMPTY);
  const [horizon, setHorizon] = useState(90);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [tracking, setTracking] = useState<Awaited<ReturnType<typeof getSparesTracking>> | null>(null);

  const hasDates = payload.effective_dates.length > 0 || payload.selected_dates.length > 0;

  useEffect(() => {
    const load = async () => {
      if (!hasDates) {
        setData(EMPTY);
        setTracking(null);
        return;
      }
      setLoading(true);
      setErrorMessage("");
      try {
        const [result, track] = await Promise.all([getSpares(payload, horizon), getSparesTracking(payload, horizon)]);
        setData(result);
        setTracking(track);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Spares dimensioning failed.");
        setData(EMPTY);
        setTracking(null);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [payload, horizon, hasDates]);

  const kpis = useMemo(
    () => [
      { label: fr ? "Lignes produit" : "Product lines", value: String(data.summary.product_lines) },
      { label: fr ? "Base installée" : "Installed base", value: String(data.summary.total_installed) },
      { label: fr ? "Remplacements (période)" : "Replacements (period)", value: String(data.summary.total_replacements) },
      { label: fr ? `Spares recommandés (${horizon}j)` : `Recommended spares (${horizon}d)`, value: String(data.summary.total_recommended) },
      { label: fr ? "Fenêtre observée (j)" : "Observed window (d)", value: String(data.summary.period_days) },
    ],
    [data.summary, fr, horizon],
  );

  const displayRows = useMemo(
    () =>
      data.rows.map((row) => ({
        product_code: row.product_code,
        product_name: row.product_name,
        object_type: row.object_type,
        installed_base: row.installed_base,
        sites: row.sites,
        replacements_period: row.replacements_period,
        annual_failure_rate_pct: row.annual_failure_rate_pct,
        expected_demand: row.expected_demand,
        recommended_spares: row.recommended_spares,
        criticality: row.criticality,
      })),
    [data.rows],
  );

  if (!hasDates) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/40 px-6 py-10 text-center text-sm text-slate-600">
        {fr ? "Sélectionnez au moins un snapshot pour calculer le besoin en spares." : "Select at least one snapshot to compute spares need."}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          {fr ? "Horizon de couverture (jours)" : "Coverage horizon (days)"}
          <div className="flex gap-2">
            {[30, 90, 180, 365].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setHorizon(value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  horizon === value ? "border-teal-500 bg-teal-500 text-white" : "border-slate-300 bg-white text-slate-600"
                }`}
              >
                {value}j
              </button>
            ))}
          </div>
        </label>
        <p className="max-w-md text-xs text-slate-500">
          {fr
            ? "Méthode: demande = taux de churn journalier × horizon ; stock de sécurité = 1.65 × √demande (niveau de service 95%)."
            : "Method: demand = daily churn rate × horizon; safety stock = 1.65 × √demand (95% service level)."}
        </p>
      </section>

      {errorMessage ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{errorMessage}</p>
      ) : null}

      <KpiCards items={kpis} />

      {data.top_chart.length ? (
        <section>
          <p className="mb-2 text-sm font-semibold text-slate-700">
            {fr ? "Top besoins en spares par code produit" : "Top spares need by product code"}
          </p>
          <MultiBarChart
            data={data.top_chart}
            xKey="product_code"
            bars={[
              { key: "recommended_spares", color: CHART_PRIMARY },
              { key: "replacements", color: CHART_SECONDARY },
            ]}
            height={280}
          />
        </section>
      ) : loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
          {fr ? "Calcul..." : "Computing..."}
        </div>
      ) : null}

      <section>
        <p className="mb-2 text-sm font-semibold text-slate-700">{fr ? "Plan de réapprovisionnement détaillé" : "Detailed restocking plan"}</p>
        <DataTable rows={displayRows} showSelection={false} maxHeightClassName="max-h-[55vh]" />
      </section>

      <section className="premium-card rounded-2xl p-4">
        <p className="mb-1 text-sm font-bold text-slate-900">{fr ? "Suivi stock opérationnel" : "Operational stock tracking"}</p>
        <p className="mb-3 text-xs text-slate-500">{tracking?.note ?? ""}</p>
        <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div className="rounded-lg border border-teal-100 bg-white p-2 text-xs">
            <span className="text-slate-500">{fr ? "Produits suivis" : "Tracked products"}</span>
            <p className="text-lg font-bold">{tracking?.inventory_count ?? 0}</p>
          </div>
          <div className="rounded-lg border border-teal-100 bg-white p-2 text-xs">
            <span className="text-slate-500">{fr ? "Écarts critiques" : "Critical gaps"}</span>
            <p className="text-lg font-bold text-red-700">{Number(tracking?.summary.critical_gaps ?? 0)}</p>
          </div>
        </div>
        <DataTable rows={tracking?.rows ?? []} showSelection={false} maxHeightClassName="max-h-[40vh]" />
      </section>
    </div>
  );
}
