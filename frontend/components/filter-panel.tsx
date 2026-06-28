"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { deleteSnapshots, processSnapshots } from "@/lib/api";
import { t } from "@/lib/i18n";
import { useFilterOptions, type FilterOptionsData } from "@/lib/use-filter-options";
import { useAppContext } from "@/components/app-provider";
import { useAuth } from "@/components/auth-provider";
import { isAdmin } from "@/lib/auth";
import { CHART_PRIMARY } from "@/lib/chart-theme";

type OptionData = FilterOptionsData;

const EMPTY_FILTER_OPTIONS: OptionData = {
  date_options: [],
  file_options: [],
  site_options: [],
  total_sites: 0,
  total_xml: 0,
  processed_dates: [],
  xml_snapshots: [],
};

type CheckboxOption = {
  value: string;
  label: string;
};

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function ControlCenterFooterRow({
  label,
  count,
  open,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center justify-between py-3 text-left"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="text-sm font-bold text-slate-800">{label}</span>
        <span className="flex items-center gap-2">
          <span className="text-sm font-bold" style={{ color: CHART_PRIMARY }}>
            {count}
          </span>
          <ChevronIcon open={open} />
        </span>
      </button>
      {open && children ? <div className="pb-3 text-xs text-slate-600">{children}</div> : null}
    </div>
  );
}

function FilterCheckboxList({
  options,
  selected,
  onChange,
  emptyLabel,
}: {
  options: CheckboxOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  emptyLabel: string;
}) {
  const toggle = (value: string, checked: boolean) => {
    onChange(checked ? (selected.includes(value) ? selected : [...selected, value]) : selected.filter((item) => item !== value));
  };

  if (!options.length) {
    return <p className="mt-2 rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">{emptyLabel}</p>;
  }

  return (
    <div className="mt-2 max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5">
      {options.map((option) => {
        const checked = selected.includes(option.value);
        return (
          <label
            key={option.value}
            className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition ${
              checked ? "bg-teal-50 text-teal-800" : "text-slate-700 hover:bg-slate-50"
            }`}
          >
            <input
              type="checkbox"
              className="h-3.5 w-3.5 shrink-0 accent-teal-600"
              checked={checked}
              onChange={(event) => toggle(option.value, event.target.checked)}
            />
            <span className="truncate">{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}

export function FilterPanel() {
  const { filters, setFilters, payload } = useAppContext();
  const { user } = useAuth();
  const canManageData = isAdmin(user);
  const inputClass =
    "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100";
  const [processingSnapshots, setProcessingSnapshots] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [dateQuery, setDateQuery] = useState("");
  const [xmlQuery, setXmlQuery] = useState("");
  const [siteQuery, setSiteQuery] = useState("");
  const [snapshotsExpanded, setSnapshotsExpanded] = useState(false);
  const [xmlExpanded, setXmlExpanded] = useState(false);
  const [sitesExpanded, setSitesExpanded] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [deletingSnapshots, setDeletingSnapshots] = useState(false);
  const [optionsRefreshKey, setOptionsRefreshKey] = useState(0);
  const [footerSitesOpen, setFooterSitesOpen] = useState(false);
  const [footerStatusOpen, setFooterStatusOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const {
    data: filterOptions,
    error: filterOptionsError,
    isLoading: filterOptionsLoading,
  } = useFilterOptions(payload, optionsRefreshKey);
  const options = filterOptions ?? EMPTY_FILTER_OPTIONS;
  const loading = filterOptionsLoading && !filterOptions;

  useEffect(() => {
    if (filterOptionsError) {
      setErrorMessage(
        filterOptionsError instanceof Error ? filterOptionsError.message : "Failed to load filters.",
      );
    } else if (filterOptions) {
      setErrorMessage("");
    }
  }, [filterOptions, filterOptionsError]);

  const handleDeleteSnapshots = async () => {
    if (!filters.selected_dates.length) {
      setUploadMessage(t(filters.language, "filters_delete_snapshots_none"));
      return;
    }
    const confirmed = window.confirm(t(filters.language, "filters_delete_snapshots_confirm"));
    if (!confirmed) return;

    setDeletingSnapshots(true);
    setUploadMessage("");
    try {
      const data = await deleteSnapshots(filters.selected_dates);
      const deletedDates = new Set(data.deleted.map((item) => item.snapshot_date));
      const nextDates = filters.selected_dates.filter((date) => !deletedDates.has(date));

      setFilters({
        ...filters,
        selected_dates: nextDates,
        selected_files: [],
        selected_sites: [],
        selected_file_dates: [],
        effective_dates: nextDates,
      });
      setUploadMessage(
        filters.language === "Français"
          ? `${data.deleted_count} ${t(filters.language, "filters_delete_snapshots_done")} · ${data.snapshot_count} snapshot(s) restant(s)`
          : `${data.deleted_count} ${t(filters.language, "filters_delete_snapshots_done")} · ${data.snapshot_count} snapshot(s) remaining`,
      );
      setOptionsRefreshKey((key) => key + 1);
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "Snapshot delete failed.");
    } finally {
      setDeletingSnapshots(false);
    }
  };

  const fileKeys = useMemo(
    () => options.file_options.map((f) => `${f.snapshot_date} | ${f.source_file}`),
    [options.file_options],
  );
  const siteKeys = useMemo(
    () => options.site_options.map((s) => `${s.snapshot_date} | ${s.site_id} | ${s.site_name}`),
    [options.site_options],
  );
  const normalize = (value: string) => value.toLowerCase().trim();

  const filteredDates = useMemo(() => {
    const q = normalize(dateQuery);
    if (!q) return options.date_options;
    return options.date_options.filter((d) => normalize(d).includes(q));
  }, [dateQuery, options.date_options]);

  const filteredFileKeys = useMemo(() => {
    const q = normalize(xmlQuery);
    if (!q) return fileKeys;
    return fileKeys.filter((k) => normalize(k).includes(q));
  }, [fileKeys, xmlQuery]);

  const filteredSiteKeys = useMemo(() => {
    const q = normalize(siteQuery);
    if (!q) return siteKeys;
    return siteKeys.filter((k) => normalize(k).includes(q));
  }, [siteKeys, siteQuery]);

  const processedDateSet = useMemo(() => new Set(options.processed_dates), [options.processed_dates]);

  const pendingProcessDates = useMemo(
    () => filters.selected_dates.filter((date) => !processedDateSet.has(date)),
    [filters.selected_dates, processedDateSet],
  );

  const dateCheckboxOptions = useMemo(
    () =>
      filteredDates.map((date) => ({
        value: date,
        label: processedDateSet.has(date) ? date : `${date} · à traiter`,
      })),
    [filteredDates, processedDateSet],
  );

  const handleProcessSnapshots = async () => {
    if (!pendingProcessDates.length) return;
    const confirmed = window.confirm(
      filters.language === "Français"
        ? `Traiter ${pendingProcessDates.length} snapshot(s) XML → Parquet ? Cela peut prendre plusieurs minutes.`
        : `Process ${pendingProcessDates.length} snapshot(s) XML → Parquet? This may take several minutes.`,
    );
    if (!confirmed) return;
    setProcessingSnapshots(true);
    setUploadMessage("");
    try {
      const data = await processSnapshots(pendingProcessDates);
      const ok = data.processed?.length ?? 0;
      setUploadMessage(
        filters.language === "Français"
          ? `${ok} snapshot(s) traité(s). Rafraîchissez le dashboard.`
          : `${ok} snapshot(s) processed. Refresh the dashboard.`,
      );
      setOptionsRefreshKey((key) => key + 1);
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "Snapshot processing failed.");
    } finally {
      setProcessingSnapshots(false);
    }
  };

  const fileCheckboxOptions = useMemo(
    () => filteredFileKeys.map((key) => ({ value: key, label: key })),
    [filteredFileKeys],
  );

  const siteCheckboxOptions = useMemo(
    () => filteredSiteKeys.map((key) => ({ value: key, label: key })),
    [filteredSiteKeys],
  );

  const selectedFileKeys = useMemo(
    () =>
      options.file_options
        .filter((f) => filters.selected_files.includes(f.source_file))
        .map((f) => `${f.snapshot_date} | ${f.source_file}`),
    [filters.selected_files, options.file_options],
  );

  const selectedSiteKeys = useMemo(
    () =>
      options.site_options
        .filter((s) => filters.selected_sites.includes(s.site_id))
        .map((s) => `${s.snapshot_date} | ${s.site_id} | ${s.site_name}`),
    [filters.selected_sites, options.site_options],
  );

  const smartFilterCount = useMemo(
    () =>
      [filters.smart_missing_serial, filters.smart_duplicates, filters.smart_critical_quality].filter(Boolean).length,
    [filters.smart_critical_quality, filters.smart_duplicates, filters.smart_missing_serial],
  );

  const statusSiteCount = useMemo(() => {
    if (filters.selected_sites.length) return filters.selected_sites.length;
    return options.total_sites;
  }, [filters.selected_sites.length, options.total_sites]);

  return (
    <aside className="premium-card flex w-full flex-col self-start rounded-2xl lg:sticky lg:top-24 lg:max-h-[calc(100vh-6.5rem)] lg:w-[350px]">
      <div className="flex items-center gap-3 rounded-t-2xl border-b border-slate-200/80 bg-gradient-to-r from-teal-50/80 via-white to-white px-4 py-3.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-teal-100 bg-white text-teal-600 shadow-sm">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 5h18M6 12h12M10 19h4" />
          </svg>
        </span>
        <div>
          <h2 className="text-sm font-bold tracking-tight text-slate-900">{t(filters.language, "filters_title")}</h2>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
      {errorMessage ? <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">{errorMessage}</p> : null}
      {pendingProcessDates.length ? (
        <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          {filters.language === "Français"
            ? `${pendingProcessDates.length} snapshot(s) visible(s) dans DATA.XML mais pas encore traité(s) en Parquet — le dashboard restera à 0 tant que le traitement n'est pas lancé.`
            : `${pendingProcessDates.length} snapshot(s) found in DATA.XML but not processed to Parquet yet — dashboard KPIs stay at 0 until processing runs.`}
        </p>
      ) : null}
      <div className="space-y-3">
        <section className="rounded-2xl border border-slate-200 bg-slate-50/40 p-3">
          <button
            type="button"
            className="mb-2 flex w-full items-center justify-between text-left"
            onClick={() => setSnapshotsExpanded((open) => !open)}
            aria-expanded={snapshotsExpanded}
          >
            <p className="text-sm font-semibold text-slate-800">{t(filters.language, "filters_snapshots")}</p>
            <span className="flex items-center gap-2">
              <span className="text-sm font-bold text-teal-600">{filters.selected_dates.length}</span>
              <svg
                viewBox="0 0 24 24"
                className={`h-4 w-4 text-slate-500 transition-transform ${snapshotsExpanded ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </span>
          </button>
          <input className={inputClass} placeholder={t(filters.language, "filters_search_date_placeholder")} value={dateQuery} onChange={(e) => setDateQuery(e.target.value)} />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-teal-700 transition hover:bg-teal-50"
              onClick={() => {
                setFilters({
                  ...filters,
                  selected_dates: filteredDates,
                  selected_files: [],
                  selected_sites: [],
                  selected_file_dates: [],
                  effective_dates: filteredDates,
                });
              }}
              disabled={!filteredDates.length}
            >
              {t(filters.language, "filters_select_all")}
            </button>
            <button
              type="button"
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              onClick={() =>
                setFilters({
                  ...filters,
                  selected_dates: [],
                  selected_files: [],
                  selected_sites: [],
                  selected_file_dates: [],
                  effective_dates: [],
                })
              }
            >
              {t(filters.language, "filters_deselect_all")}
            </button>
          </div>
          {canManageData && pendingProcessDates.length ? (
            <button
              type="button"
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void handleProcessSnapshots()}
              disabled={processingSnapshots}
            >
              {processingSnapshots
                ? filters.language === "Français"
                  ? "Traitement en cours..."
                  : "Processing..."
                : filters.language === "Français"
                  ? `Traiter ${pendingProcessDates.length} snapshot(s)`
                  : `Process ${pendingProcessDates.length} snapshot(s)`}
            </button>
          ) : null}
          {canManageData ? (
            <button
              type="button"
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-teal-200 bg-white px-3 py-2 text-xs font-semibold text-teal-700 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void handleDeleteSnapshots()}
              disabled={!filters.selected_dates.length || deletingSnapshots}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
              </svg>
              {deletingSnapshots
                ? filters.language === "Français"
                  ? "Suppression..."
                  : "Deleting..."
                : t(filters.language, "filters_delete_snapshots")}
            </button>
          ) : null}
          {snapshotsExpanded ? (
            <FilterCheckboxList
              options={dateCheckboxOptions}
              selected={filters.selected_dates}
              emptyLabel={t(filters.language, "table_no_data")}
              onChange={(selectedDates) => {
                setFilters({
                  ...filters,
                  selected_dates: selectedDates,
                  selected_files: [],
                  selected_sites: [],
                  selected_file_dates: [],
                  effective_dates: selectedDates,
                });
              }}
            />
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50/40 p-3">
          <button
            type="button"
            className="mb-2 flex w-full items-center justify-between text-left"
            onClick={() => setXmlExpanded((open) => !open)}
            aria-expanded={xmlExpanded}
          >
            <p className="text-sm font-semibold text-slate-800">{t(filters.language, "filters_xml")}</p>
            <span className="flex items-center gap-2">
              <span className="text-sm font-bold text-teal-600">{selectedFileKeys.length}</span>
              <svg
                viewBox="0 0 24 24"
                className={`h-4 w-4 text-slate-500 transition-transform ${xmlExpanded ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </span>
          </button>
          <input className={inputClass} placeholder={t(filters.language, "filters_search_xml_placeholder")} value={xmlQuery} onChange={(e) => setXmlQuery(e.target.value)} />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-teal-700 transition hover:bg-teal-50"
              onClick={() => {
                const selectedFiles = options.file_options
                  .filter((f) => filteredFileKeys.includes(`${f.snapshot_date} | ${f.source_file}`))
                  .map((f) => f.source_file);
                const selectedFileDates = options.file_options
                  .filter((f) => selectedFiles.includes(f.source_file))
                  .map((f) => f.snapshot_date);
                setFilters({
                  ...filters,
                  selected_files: selectedFiles,
                  selected_sites: [],
                  selected_file_dates: [...new Set(selectedFileDates)],
                  effective_dates: filters.selected_dates,
                });
              }}
              disabled={!filteredFileKeys.length}
            >
              {t(filters.language, "filters_select_all")}
            </button>
            <button
              type="button"
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              onClick={() =>
                setFilters({
                  ...filters,
                  selected_files: [],
                  selected_file_dates: [],
                  selected_sites: [],
                  effective_dates: filters.selected_dates,
                })
              }
            >
              {t(filters.language, "filters_deselect_all")}
            </button>
          </div>
          {xmlExpanded ? (
            <FilterCheckboxList
              options={fileCheckboxOptions}
              selected={selectedFileKeys}
              emptyLabel={t(filters.language, "table_no_data")}
              onChange={(chosenKeys) => {
                const selectedFiles = options.file_options
                  .filter((f) => chosenKeys.includes(`${f.snapshot_date} | ${f.source_file}`))
                  .map((f) => f.source_file);
                const selectedFileDates = options.file_options
                  .filter((f) => selectedFiles.includes(f.source_file))
                  .map((f) => f.snapshot_date);
                setFilters({
                  ...filters,
                  selected_files: selectedFiles,
                  selected_sites: [],
                  selected_file_dates: [...new Set(selectedFileDates)],
                  effective_dates: filters.selected_dates,
                });
              }}
            />
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50/40 p-3">
          <button
            type="button"
            className="mb-2 flex w-full items-center justify-between text-left"
            onClick={() => setSitesExpanded((open) => !open)}
            aria-expanded={sitesExpanded}
          >
            <p className="text-sm font-semibold text-slate-800">{t(filters.language, "filters_sites")}</p>
            <span className="flex items-center gap-2">
              <span className="text-sm font-bold text-teal-600">{filters.selected_sites.length}</span>
              <svg
                viewBox="0 0 24 24"
                className={`h-4 w-4 text-slate-500 transition-transform ${sitesExpanded ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </span>
          </button>
          <input className={inputClass} placeholder={t(filters.language, "filters_search_site_placeholder")} value={siteQuery} onChange={(e) => setSiteQuery(e.target.value)} />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-teal-700 transition hover:bg-teal-50"
              onClick={() => {
                const selected = options.site_options
                  .filter((s) => filteredSiteKeys.includes(`${s.snapshot_date} | ${s.site_id} | ${s.site_name}`))
                  .map((s) => s.site_id);
                setFilters({ ...filters, selected_sites: selected });
              }}
              disabled={!filteredSiteKeys.length}
            >
              {t(filters.language, "filters_select_all")}
            </button>
            <button
              type="button"
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              onClick={() => setFilters({ ...filters, selected_sites: [] })}
            >
              {t(filters.language, "filters_deselect_all")}
            </button>
          </div>
          {sitesExpanded ? (
            <FilterCheckboxList
              options={siteCheckboxOptions}
              selected={selectedSiteKeys}
              emptyLabel={t(filters.language, "table_no_data")}
              onChange={(chosenKeys) => {
                const selected = options.site_options
                  .filter((s) => chosenKeys.includes(`${s.snapshot_date} | ${s.site_id} | ${s.site_name}`))
                  .map((s) => s.site_id);
                setFilters({ ...filters, selected_sites: selected });
              }}
            />
          ) : null}
        </section>

        {canManageData ? (
          <div className="pt-1">
            <Link
              href="/import"
              className="flex w-full items-center justify-center gap-2 rounded-full border border-teal-200 bg-white px-4 py-2.5 text-sm font-semibold text-teal-700 transition hover:bg-teal-50"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V4m0 0L8 8m4-4 4 4" />
                <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              {t(filters.language, "filters_import_link")}
            </Link>
          </div>
        ) : null}
      </div>
      </div>

      <footer className="shrink-0 rounded-b-2xl border-t border-slate-200 bg-white px-4 pb-4 pt-1">
        <ControlCenterFooterRow
          label={t(filters.language, "filters_sites")}
          count={filters.selected_sites.length}
          open={footerSitesOpen}
          onToggle={() => {
            setFooterSitesOpen((v) => !v);
            setSitesExpanded(true);
          }}
        >
          <p>
            {t(filters.language, "filters_sites_count")}: <strong>{statusSiteCount}</strong>
          </p>
          <p className="mt-1 text-slate-500">
            {filters.language === "Français"
              ? "Ouvrez la section Sites ci-dessus pour affiner la sélection."
              : "Expand the Sites section above to refine your selection."}
          </p>
        </ControlCenterFooterRow>

        <ControlCenterFooterRow
          label={t(filters.language, "filters_status")}
          count={smartFilterCount}
          open={footerStatusOpen}
          onToggle={() => setFooterStatusOpen((v) => !v)}
        >
          <ul className="space-y-1">
            <li>
              {t(filters.language, "smart_missing_serial")}: {filters.smart_missing_serial ? "✓" : "—"}
            </li>
            <li>
              {t(filters.language, "smart_duplicates")}: {filters.smart_duplicates ? "✓" : "—"}
            </li>
            <li>
              {t(filters.language, "smart_critical_quality")}: {filters.smart_critical_quality ? "✓" : "—"}
            </li>
          </ul>
        </ControlCenterFooterRow>

        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 shadow-sm">
          <button
            type="button"
            className="flex w-full items-start gap-3 text-left"
            onClick={() => setHelpOpen((v) => !v)}
            aria-expanded={helpOpen}
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-teal-600 shadow-sm"
              style={{ color: CHART_PRIMARY }}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 11v3a8 8 0 0 0 16 0v-3" />
                <path d="M12 19v3" />
                <path d="M8 22h8" />
                <rect x="2" y="11" width="4" height="5" rx="1" />
                <rect x="18" y="11" width="4" height="5" rx="1" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-900">{t(filters.language, "filters_help_title")}</span>
              <span className="block text-xs text-slate-500">{t(filters.language, "filters_help_subtitle")}</span>
            </span>
            <ChevronIcon open={helpOpen} />
          </button>
          {helpOpen ? (
            <div className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-600">
              <a
                href={`mailto:${t(filters.language, "filters_help_email")}`}
                className="font-semibold text-teal-600 hover:text-teal-800"
              >
                {t(filters.language, "filters_help_email")}
              </a>
              <p className="mt-2 text-slate-500">{t(filters.language, "filters_help_hint")}</p>
            </div>
          ) : null}
        </div>
      </footer>
    </aside>
  );
}
