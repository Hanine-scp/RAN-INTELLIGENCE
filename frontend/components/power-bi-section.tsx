"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SortableTableHeader } from "@/components/sortable-table-header";
import { useAppContext } from "@/components/app-provider";
import { useAuth } from "@/components/auth-provider";
import { getPowerBiStatus, syncPowerBiExport, type PowerBiStatus } from "@/lib/api";
import { isAdmin } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { sortTableRows } from "@/lib/sort-table-rows";

const CLIENT_EMBED_URL = (process.env.NEXT_PUBLIC_POWER_BI_EMBED_URL ?? "").trim();
const CLIENT_REPORT_URL = (process.env.NEXT_PUBLIC_POWER_BI_REPORT_URL ?? "").trim();

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(locale === "Français" ? "fr-FR" : "en-US");
  } catch {
    return value;
  }
}

export function PowerBiSection() {
  const { filters } = useAppContext();
  const { user } = useAuth();
  const fr = filters.language === "Français";
  const admin = isAdmin(user);

  const [status, setStatus] = useState<PowerBiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const fileRows = useMemo(() => {
    const files = status?.export_files.length ? status.export_files : status?.processed_files ?? [];
    return files.map((file) => ({
      name: file.name,
      size_bytes: file.size_bytes,
      updated_at: file.updated_at,
    }));
  }, [status]);

  const sortedFiles = useMemo(
    () => sortTableRows(fileRows as Record<string, unknown>[], sortColumn, sortDirection),
    [fileRows, sortColumn, sortDirection],
  );

  const onSort = (column: string, direction: "asc" | "desc") => {
    setSortColumn(column);
    setSortDirection(direction);
  };

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setStatus(await getPowerBiStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Power BI status.");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const embedUrl = CLIENT_EMBED_URL || status?.powerbi_embed_url || "";
  const reportUrl = CLIENT_REPORT_URL || status?.powerbi_report_url || "";
  const hasDashboard = Boolean(embedUrl || reportUrl);

  const steps = useMemo(
    () => [
      {
        n: 1,
        title: fr ? "Exporter les données" : "Export data",
        done: Boolean(status?.export_ready),
        body: fr
          ? "Après chaque ingestion, les CSV sont copiés vers data/exports/powerbi/ (auto-sync)."
          : "After each ingest, CSV files are copied to data/exports/powerbi/ (auto-sync).",
      },
      {
        n: 2,
        title: fr ? "Créer le rapport Power BI Desktop" : "Build Power BI Desktop report",
        done: hasDashboard,
        body: fr
          ? "Importer site_status.csv, snapshot_summary.csv, delta_metrics.csv depuis le dossier export."
          : "Import site_status.csv, snapshot_summary.csv, delta_metrics.csv from the export folder.",
      },
      {
        n: 3,
        title: fr ? "Publier et lier l'URL" : "Publish and link URL",
        done: hasDashboard,
        body: fr
          ? "Ajoutez NEXT_PUBLIC_POWER_BI_EMBED_URL dans frontend/.env.local pour afficher le dashboard ici."
          : "Set NEXT_PUBLIC_POWER_BI_EMBED_URL in frontend/.env.local to embed the dashboard here.",
      },
    ],
    [fr, hasDashboard, status?.export_ready],
  );

  const handleSync = async () => {
    setSyncing(true);
    setError("");
    try {
      await syncPowerBiExport();
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="space-y-5">
        <section className="premium-card rounded-2xl p-5">
          <h3 className="text-sm font-bold text-slate-900">{fr ? "Étapes d'intégration" : "Integration steps"}</h3>
          <ol className="mt-4 space-y-4">
            {steps.map((step) => (
              <li key={step.n} className="flex gap-3">
                <span
                  className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    step.done ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                  }`}
                >
                  {step.n}
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{step.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="premium-card rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">{fr ? "Datasets exportés" : "Exported datasets"}</h3>
              <p className="mt-1 text-xs text-slate-500">
                {fr ? "Dernière sync :" : "Last sync:"}{" "}
                {formatDate(status?.last_synced_at, filters.language)}
              </p>
            </div>
            {admin ? (
              <button
                type="button"
                onClick={() => void handleSync()}
                disabled={syncing}
                className="rounded-xl border border-teal-500 bg-teal-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
              >
                {syncing ? (fr ? "Sync..." : "Syncing...") : fr ? "Synchroniser maintenant" : "Sync now"}
              </button>
            ) : null}
          </div>

          {loading ? (
            <p className="mt-4 text-sm text-slate-500">{t(filters.language, "loading")}</p>
          ) : error ? (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <SortableTableHeader
                      label={fr ? "Fichier" : "File"}
                      column="name"
                      sortColumn={sortColumn}
                      sortDirection={sortDirection}
                      onSort={onSort}
                      className="px-3 py-2 font-semibold"
                    />
                    <SortableTableHeader
                      label={fr ? "Taille" : "Size"}
                      column="size_bytes"
                      sortColumn={sortColumn}
                      sortDirection={sortDirection}
                      onSort={onSort}
                      className="px-3 py-2 font-semibold"
                    />
                    <SortableTableHeader
                      label={fr ? "Mis à jour" : "Updated"}
                      column="updated_at"
                      sortColumn={sortColumn}
                      sortDirection={sortDirection}
                      onSort={onSort}
                      className="px-3 py-2 font-semibold"
                    />
                  </tr>
                </thead>
                <tbody>
                  {sortedFiles.map((file) => (
                    <tr key={String(file.name)} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-800">{String(file.name)}</td>
                      <td className="px-3 py-2 text-slate-600">{formatBytes(Number(file.size_bytes ?? 0))}</td>
                      <td className="px-3 py-2 text-slate-600">{formatDate(String(file.updated_at ?? ""), filters.language)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {status?.export_dir ? (
            <p className="mt-3 break-all text-[11px] text-slate-400">
              {fr ? "Dossier export :" : "Export folder:"} {status.export_dir}
            </p>
          ) : null}
        </section>

        {!hasDashboard ? (
          <section className="premium-card rounded-2xl border border-amber-200/80 bg-amber-50/50 p-5">
            <h3 className="text-sm font-bold text-amber-900">{fr ? "Configurer le lien Power BI" : "Configure Power BI link"}</h3>
            <p className="mt-2 text-xs leading-relaxed text-amber-900/80">
              {fr
                ? "1. Créez votre rapport dans Power BI Desktop avec les CSV exportés. 2. Publiez sur Power BI Service. 3. Copiez l'URL embed ou « Publier sur le web »."
                : "1. Build your report in Power BI Desktop using exported CSVs. 2. Publish to Power BI Service. 3. Copy the embed or Publish to web URL."}
            </p>
            <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 p-3 text-[11px] text-emerald-300">
{`# frontend/.env.local
NEXT_PUBLIC_POWER_BI_EMBED_URL=https://app.powerbi.com/view?r=...
NEXT_PUBLIC_POWER_BI_REPORT_URL=https://app.powerbi.com/groups/.../reports/...`}
            </pre>
          </section>
        ) : null}
      </div>

      <section className="premium-card flex min-h-[520px] flex-col rounded-2xl p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">{fr ? "Dashboard Power BI" : "Power BI dashboard"}</h3>
          {reportUrl ? (
            <a
              href={reportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-teal-500 px-3 py-1.5 text-xs font-semibold text-teal-700 transition hover:bg-teal-50"
            >
              {fr ? "Ouvrir dans Power BI" : "Open in Power BI"}
            </a>
          ) : null}
        </div>

        {embedUrl ? (
          <iframe
            title={fr ? "Dashboard Power BI RAN Intelligence" : "RAN Intelligence Power BI dashboard"}
            src={embedUrl}
            className="min-h-[480px] w-full flex-1 rounded-xl border border-slate-200 bg-white"
            allowFullScreen
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-6 text-center">
            <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow-400/20 text-2xl font-black text-yellow-700">
              PBI
            </div>
            <p className="text-sm font-semibold text-slate-700">
              {fr ? "Aucun dashboard embarqué pour le moment" : "No embedded dashboard yet"}
            </p>
            <p className="mt-2 max-w-md text-xs leading-relaxed text-slate-500">
              {fr
                ? "Une fois votre rapport publié, ajoutez l'URL dans .env.local et redémarrez le frontend. Le dashboard s'affichera ici."
                : "Once your report is published, add the URL to .env.local and restart the frontend. The dashboard will appear here."}
            </p>
            {reportUrl ? (
              <a
                href={reportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 rounded-xl border border-teal-500 bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700"
              >
                {fr ? "Voir le rapport externe" : "View external report"}
              </a>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
