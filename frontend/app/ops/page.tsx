"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import { KpiCards } from "@/components/kpi-cards";
import { PageShell } from "@/components/page-shell";
import { useAppContext } from "@/components/app-provider";
import { anchorLatestTrust, getCacheStats, getHttpMetrics, getOperationalSummary, getQueryMetrics, getTrustAnchors } from "@/lib/api";
import { PageLoadingSkeleton } from "@/components/skeleton";
import { t } from "@/lib/i18n";

type AnchorResult = {
  anchored?: boolean;
  snapshot_date?: string;
  file_count?: number;
  chain_hash?: string;
  reason?: string;
};

function formatScore(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  return num % 1 === 0 ? String(num) : num.toFixed(1);
}

function formatMs(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : "0";
}

function truncateHash(value: unknown, size = 12) {
  const text = String(value ?? "");
  if (text.length <= size * 2) return text || "—";
  return `${text.slice(0, size)}…${text.slice(-size)}`;
}

export default function OpsPage() {
  const { payload, filters } = useAppContext();
  const language = filters.language;
  const hasDates = payload.effective_dates.length > 0 || payload.selected_dates.length > 0;

  const [opsSummary, setOpsSummary] = useState<Record<string, unknown>>({});
  const [queryMetrics, setQueryMetrics] = useState<Record<string, unknown>>({});
  const [httpMetrics, setHttpMetrics] = useState<Record<string, unknown>>({});
  const [cacheStats, setCacheStats] = useState<Record<string, unknown>>({});
  const [anchors, setAnchors] = useState<Record<string, unknown>[]>([]);
  const [anchorResult, setAnchorResult] = useState<AnchorResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [anchoring, setAnchoring] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [ops, metrics, anchorRows, http, cache] = await Promise.all([
        hasDates ? getOperationalSummary(payload) : Promise.resolve({}),
        getQueryMetrics(),
        getTrustAnchors(),
        getHttpMetrics(),
        getCacheStats(),
      ]);
      setOpsSummary(ops);
      setQueryMetrics(metrics);
      setAnchors(anchorRows);
      setHttpMetrics(http);
      setCacheStats(cache);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to refresh operations data.");
    } finally {
      setLoading(false);
    }
  }, [hasDates, payload]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAnchor = async () => {
    setAnchoring(true);
    try {
      const result = (await anchorLatestTrust()) as AnchorResult;
      setAnchorResult(result);
      setErrorMessage("");
      await refresh();
    } catch (error) {
      setAnchorResult(null);
      setErrorMessage(error instanceof Error ? error.message : "Failed to anchor latest snapshot.");
    } finally {
      setAnchoring(false);
    }
  };

  const smartFilters = (opsSummary.smart_filters ?? {}) as Record<string, boolean>;

  const kpis = useMemo(
    () => [
      {
        label: t(language, "kpi_snapshots"),
        value: loading && !opsSummary.snapshot_count ? "…" : String(opsSummary.snapshot_count ?? 0),
      },
      {
        label: t(language, "kpi_quality_score"),
        value: loading && !opsSummary.quality_score ? "…" : formatScore(opsSummary.quality_score ?? 0),
      },
      {
        label: t(language, "kpi_query_avg"),
        value: loading && !queryMetrics.avg_ms ? "…" : formatMs(queryMetrics.avg_ms ?? 0),
      },
      {
        label: t(language, "kpi_query_p95"),
        value: loading && !queryMetrics.p95_ms ? "…" : formatMs(queryMetrics.p95_ms ?? 0),
      },
      {
        label: t(language, "kpi_anchors"),
        value: loading && anchors.length === 0 ? "…" : String(anchors.length),
      },
      {
        label: language === "Français" ? "HTTP p95 (ms)" : "HTTP p95 (ms)",
        value: loading && !httpMetrics.p95_ms ? "…" : formatMs(httpMetrics.p95_ms ?? 0),
      },
      {
        label: language === "Français" ? "Cache hit rate" : "Cache hit rate",
        value:
          loading && cacheStats.hit_rate == null
            ? "…"
            : `${Math.round(Number(cacheStats.hit_rate ?? 0) * 100)}%`,
      },
    ],
    [anchors.length, cacheStats.hit_rate, httpMetrics.p95_ms, language, loading, opsSummary, queryMetrics],
  );

  const anchorRows = useMemo(
    () =>
      anchors.map((row) => ({
        ...row,
        chain_hash: truncateHash(row.chain_hash),
        batch_hash: truncateHash(row.batch_hash),
        previous_chain_hash: truncateHash(row.previous_chain_hash),
      })),
    [anchors],
  );

  return (
    <PageShell title={t(language, "page_ops_title")} subtitle={t(language, "subtitle_ops")}>
      {errorMessage ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{errorMessage}</p>
      ) : null}

      {!hasDates ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">{t(language, "ops_no_dates")}</p>
      ) : null}

      {loading && !opsSummary.snapshot_count && !queryMetrics.samples ? <PageLoadingSkeleton /> : <KpiCards items={kpis} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="premium-card rounded-2xl p-5 lg:col-span-2">
          <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-500">{t(language, "ops_section_overview")}</h3>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-white/80 px-4 py-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t(language, "latest_snapshot")}</dt>
              <dd className="mt-1 text-lg font-semibold text-slate-900">{String(opsSummary.latest_snapshot || "—")}</dd>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white/80 px-4 py-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t(language, "kpi_query_samples")}</dt>
              <dd className="mt-1 text-lg font-semibold text-slate-900">{String(queryMetrics.samples ?? 0)}</dd>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white/80 px-4 py-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t(language, "kpi_query_max")}</dt>
              <dd className="mt-1 text-lg font-semibold text-slate-900">{formatMs(queryMetrics.max_ms ?? 0)}</dd>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white/80 px-4 py-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t(language, "ops_smart_filters")}</dt>
              <dd className="mt-2 flex flex-wrap gap-2">
                {Object.entries(smartFilters).map(([key, active]) => (
                  <span
                    key={key}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      active ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {key.replace("smart_", "")}
                  </span>
                ))}
                {!Object.keys(smartFilters).length ? <span className="text-sm text-slate-500">—</span> : null}
              </dd>
            </div>
          </dl>
        </section>

        <section className="premium-card rounded-2xl p-5">
          <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-500">{t(language, "summary")}</h3>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void refresh()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-red-200 hover:text-red-700 disabled:opacity-60"
            >
              {loading ? t(language, "refreshing") : t(language, "refresh_ops")}
            </button>
            <button
              type="button"
              disabled={anchoring}
              onClick={() => void runAnchor()}
              className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              {anchoring ? t(language, "refreshing") : t(language, "anchor_latest")}
            </button>
          </div>
          {anchorResult ? (
            <div
              className={`mt-4 rounded-xl border p-3 text-sm ${
                anchorResult.anchored
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              <p className="font-semibold">
                {anchorResult.anchored ? t(language, "ops_anchor_success") : t(language, "ops_anchor_failed")}
              </p>
              {anchorResult.snapshot_date ? (
                <p className="mt-1 text-xs opacity-90">
                  {t(language, "latest_snapshot")}: {anchorResult.snapshot_date}
                  {anchorResult.file_count != null ? ` · ${anchorResult.file_count} XML` : ""}
                </p>
              ) : null}
              {anchorResult.chain_hash ? (
                <p className="mt-1 font-mono text-[11px] opacity-80">{truncateHash(anchorResult.chain_hash, 16)}</p>
              ) : null}
              {anchorResult.reason ? <p className="mt-1 text-xs opacity-90">{anchorResult.reason}</p> : null}
            </div>
          ) : null}
        </section>
      </div>

      <section className="premium-card rounded-2xl p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-500">{t(language, "ops_section_trust")}</h3>
          <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
            {anchors.length} {t(language, "kpi_anchors").toLowerCase()}
          </span>
        </div>
        {anchors.length === 0 && !loading ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-center text-sm text-slate-500">
            {t(language, "ops_trust_empty")}
          </p>
        ) : (
          <DataTable
            rows={anchorRows}
            visibleColumns={["snapshot_date", "file_count", "anchored_at", "chain_hash", "source_path"]}
            showSelection={false}
          />
        )}
      </section>
    </PageShell>
  );
}
