"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/ui/data-table";
import { KpiCards } from "@/components/ui/kpi-cards";
import { ClusterScatter, MultiBarChart } from "@/components/charts/charts";
import { useAppContext } from "@/components/providers/app-provider";
import { getClustering } from "@/lib/api";
import { CHART_PRIMARY, CLUSTER_COLORS, SEVERITY_COLORS } from "@/lib/chart-theme";

type ClusteringResponse = Awaited<ReturnType<typeof getClustering>>;

const EMPTY: ClusteringResponse = {
  available: false,
  points: [],
  clusters: [],
  health_distribution: [],
  summary: { sites: 0, clusters: 0 },
};

const BAND_COLORS: Record<string, string> = {
  Bonne: SEVERITY_COLORS.Stable,
  Moyenne: SEVERITY_COLORS.Medium,
  Fragile: SEVERITY_COLORS.Fragile,
  Critique: SEVERITY_COLORS.Critique,
};

export function ClusteringSection() {
  const { payload, filters } = useAppContext();
  const fr = filters.language === "Français";
  const [data, setData] = useState<ClusteringResponse>(EMPTY);
  const [clusterCount, setClusterCount] = useState(4);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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
        const result = await getClustering(payload, clusterCount);
        setData(result);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Clustering failed.");
        setData(EMPTY);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [payload, clusterCount, hasDates]);

  const scatterSeries = useMemo(() => {
    const groups = new Map<number, { x: number; y: number; site_id?: string; health_score?: number }[]>();
    data.points.forEach((rawPoint) => {
      const point = rawPoint as Record<string, unknown>;
      const cluster = Number(point.cluster ?? 0);
      const arr = groups.get(cluster) ?? [];
      arr.push({
        x: Number(point.x ?? 0),
        y: Number(point.y ?? 0),
        site_id: String(point.site_id ?? ""),
        health_score: Number(point.health_score ?? 0),
      });
      groups.set(cluster, arr);
    });
    return Array.from(groups.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([cluster, points]) => ({
        name: `Cluster ${cluster}`,
        color: CLUSTER_COLORS[cluster % CLUSTER_COLORS.length],
        points,
      }));
  }, [data.points]);

  const kpis = useMemo(
    () => [
      { label: fr ? "Sites analysés" : "Sites analyzed", value: String(data.summary.sites) },
      { label: "Clusters", value: String(data.summary.clusters) },
      { label: fr ? "Variance expliquée" : "Explained variance", value: `${data.summary.explained_variance_pct ?? 0}%` },
      {
        label: fr ? "Sites critiques" : "Critical sites",
        value: String(data.health_distribution.find((entry) => entry.band === "Critique")?.count ?? 0),
      },
      {
        label: fr ? "Sites fragiles" : "Fragile sites",
        value: String(data.health_distribution.find((entry) => entry.band === "Fragile")?.count ?? 0),
      },
    ],
    [data, fr],
  );

  return (
    <div className="space-y-4">
      {!hasDates ? (
        <div className="rounded-2xl border border-red-100 bg-red-50/40 px-6 py-10 text-center text-sm text-slate-600">
          {fr ? "Sélectionnez au moins un snapshot pour lancer le clustering." : "Select at least one snapshot to run clustering."}
        </div>
      ) : (
        <div className="space-y-5">
          <section className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              {fr ? "Nombre de clusters (K)" : "Number of clusters (K)"}
              <div className="flex gap-2">
                {[2, 3, 4, 5, 6].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setClusterCount(value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      clusterCount === value ? "border-teal-500 bg-teal-600 text-white" : "border-slate-300 bg-white text-slate-600"
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </label>
            <p className="max-w-md text-xs text-slate-500">
              {fr
                ? "Features: churn de serials, serials manquants, instabilité SW, état bloqué, cellules par techno. Le score de santé pénalise ces facteurs de risque."
                : "Features: serial churn, missing serials, SW instability, blocked state, cells per tech. Health score penalises these risk factors."}
            </p>
          </section>

          {errorMessage ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{errorMessage}</p>
          ) : null}

          {!data.available ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 text-center text-sm text-amber-800">
              {loading ? (
                fr ? "Clustering en cours..." : "Clustering in progress..."
              ) : (
                <>
                  <p>
                    {fr
                      ? "Clustering indisponible (≥ 12 sites requis ou scikit-learn manquant)."
                      : "Clustering unavailable (≥ 12 sites required or scikit-learn missing)."}
                  </p>
                  {data.reason ? (
                    <p className="mt-2 text-xs text-slate-600">{fr ? "Raison" : "Reason"}: {data.reason}</p>
                  ) : null}
                </>
              )}
            </div>
          ) : (
            <>
              <KpiCards items={kpis} />

              <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <div className="xl:col-span-2">
                  <p className="mb-2 text-sm font-semibold text-slate-700">
                    {fr ? "Carte comportementale des sites (PCA 2D)" : "Behavioural site map (2D PCA)"}
                  </p>
                  <ClusterScatter series={scatterSeries} height={380} />
                  <p className="mt-2 text-xs text-slate-500">
                    {fr
                      ? "Chaque point = un site, projeté sur 2 axes synthétiques. Les couleurs distinguent les profils de comportement détectés."
                      : "Each point = one site, projected on 2 synthetic axes. Colors distinguish the detected behaviour profiles."}
                  </p>
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-700">{fr ? "Distribution des scores de santé" : "Health score distribution"}</p>
                  <MultiBarChart
                    data={data.health_distribution}
                    xKey="band"
                    bars={[{ key: "count", color: CHART_PRIMARY }]}
                    height={300}
                  />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {data.health_distribution.map((entry) => (
                      <div key={entry.band} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: BAND_COLORS[entry.band] ?? "#64748b" }} />
                        <span className="font-semibold text-slate-700">{entry.band}</span>
                        <span className="ml-auto font-bold text-slate-900">{entry.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section>
                <p className="mb-2 text-sm font-semibold text-slate-700">{fr ? "Profils des clusters (du plus fragile au plus sain)" : "Cluster profiles (most fragile to healthiest)"}</p>
                <DataTable rows={data.clusters} showSelection={false} maxHeightClassName="max-h-[40vh]" />
              </section>

              <section>
                <p className="mb-2 text-sm font-semibold text-slate-700">{fr ? "Sites & scores de santé" : "Sites & health scores"}</p>
                <DataTable rows={data.points} showSelection={false} maxHeightClassName="max-h-[50vh]" />
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
