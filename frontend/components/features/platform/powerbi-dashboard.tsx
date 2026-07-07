import { usePowerBiCsv } from "@/lib/hooks/use-powerbi-csv";
import { CHART_PRIMARY } from "@/lib/chart-theme";
import { t } from "@/lib/i18n";
import { useAppContext } from "@/components/providers/app-provider";

function formatDate(value: string, lang: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(lang === "Français" ? "fr-FR" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatNumber(value: string) {
  const parsed = Number(String(value).replace(/\s+/g, ""));
  return Number.isNaN(parsed) ? value : parsed.toLocaleString();
}

export function PowerBiDashboard() {
  const { data, loading, error } = usePowerBiCsv();
  const { filters } = useAppContext();
  const lang = filters.language;

  if (loading) {
    return <div className="p-8 text-center text-sm text-slate-500">{t(lang, "loading")}</div>;
  }

  if (error || !data) {
    return <div className="p-8 text-center text-sm text-red-500">Failed to load dashboard data</div>;
  }

  const snapshotTitle = lang === "Français" ? "Dates des snapshots" : "Snapshot dates";
  const latestSnapshotLabel = lang === "Français" ? "Dernier snapshot" : "Latest snapshot";
  const changesTitle = lang === "Français" ? "Changements récents" : "Recent changes";
  const noChangesLabel = lang === "Français" ? "Aucun changement." : "No changes.";
  const snapshotEntriesLabel = lang === "Français" ? "entrées" : "entries";

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[1.7fr_0.95fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">{lang === "Français" ? "Tableau de bord Power BI" : "Power BI dashboard"}</h2>
              <p className="mt-2 text-sm text-slate-500">
                {latestSnapshotLabel}: <span className="font-semibold text-slate-800">{formatDate(data.latestSnapshotDate, lang)}</span>
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
              {snapshotTitle}
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: lang === "Français" ? "Total sites" : "Total sites", value: formatNumber(data.totalSites) },
              { label: lang === "Français" ? "Équipements ajoutés" : "New equipment", value: formatNumber(data.equipmentAdded) },
              { label: lang === "Français" ? "Total équipements" : "Total equipment", value: formatNumber(data.totalEquipment) },
              { label: lang === "Français" ? "Snapshots" : "Snapshots", value: formatNumber(String(data.snapshotsCount)) },
            ].map((metric) => (
              <div key={metric.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{metric.label}</p>
                <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900" style={{ color: CHART_PRIMARY }}>
                  {metric.value}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">{changesTitle}</h3>
          <p className="mt-2 text-sm text-slate-500">
            {lang === "Français"
              ? "Les derniers changements d'équipement et l'impact sur les sites."
              : "Latest equipment changes and their site impact."}
          </p>

          {data.equipmentChanges.length === 0 ? (
            <p className="mt-5 text-sm text-slate-500">{noChangesLabel}</p>
          ) : (
            <div className="mt-5 space-y-3 max-h-[45vh] overflow-y-auto pr-1">
              {data.equipmentChanges.map((change, idx) => (
                <div key={idx} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white ${
                        change.change_type === "ADD" ? "bg-emerald-500" : "bg-red-500"
                      }`}
                    >
                      {change.change_type_label || change.change_type}
                    </span>
                    <span className="text-xs font-medium text-slate-500">{formatDate(change.date_cmp, lang)}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">{change.product_name || "Unknown product"}</p>
                  <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                    <p>
                      <span className="font-semibold text-slate-700">Site:</span> {change.site_id}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-700">Qty:</span> {formatNumber(change.nb_equipment)}
                    </p>
                    <p className="sm:col-span-2">
                      <span className="font-semibold text-slate-700">S/N:</span> {change.serial_number}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{snapshotTitle}</h3>
            <p className="text-sm text-slate-500">
              {lang === "Français"
                ? "Dernières dates de snapshot et nombre de sites par date."
                : "Latest snapshot dates and site counts."}
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
            {data.snapshotDates.length} {snapshotEntriesLabel}
          </span>
        </div>

        {data.snapshotDates.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">{lang === "Français" ? "Aucune date de snapshot disponible." : "No snapshot dates available."}</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {data.snapshotDates.slice(0, 8).map((snapshot) => (
              <div key={snapshot.snapshot_date} className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm">
                <p className="font-semibold text-slate-900">{formatDate(snapshot.snapshot_date, lang)}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {lang === "Français" ? "Sites" : "Sites"}: {formatNumber(snapshot.site_count)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
