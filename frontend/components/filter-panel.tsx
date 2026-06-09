"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { deleteSnapshots, getFilterOptions, uploadXmlSnapshot } from "@/lib/api";
import { t } from "@/lib/i18n";
import { useAppContext } from "@/components/app-provider";
import { useAuth } from "@/components/auth-provider";
import { isAdmin } from "@/lib/auth";

type OptionData = {
  date_options: string[];
  file_options: { snapshot_date: string; source_file: string }[];
  site_options: { snapshot_date: string; source_file: string; site_id: string; site_name: string }[];
  total_sites: number;
  total_xml: number;
};

type CheckboxOption = {
  value: string;
  label: string;
};

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
    return <p className="mt-2 rounded-xl border border-dashed border-red-100 bg-white px-3 py-2 text-xs text-slate-500">{emptyLabel}</p>;
  }

  return (
    <div className="mt-2 max-h-36 overflow-y-auto rounded-xl border border-red-100 bg-white p-1.5">
      {options.map((option) => {
        const checked = selected.includes(option.value);
        return (
          <label
            key={option.value}
            className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition ${
              checked ? "bg-red-50 text-red-800" : "text-slate-700 hover:bg-red-50/50"
            }`}
          >
            <input
              type="checkbox"
              className="h-3.5 w-3.5 shrink-0 accent-red-600"
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
    "mt-1 w-full rounded-xl border border-red-100 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100";
  const [options, setOptions] = useState<OptionData>({
    date_options: [],
    file_options: [],
    site_options: [],
    total_sites: 0,
    total_xml: 0,
  });
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [dateQuery, setDateQuery] = useState("");
  const [xmlQuery, setXmlQuery] = useState("");
  const [siteQuery, setSiteQuery] = useState("");
  const [snapshotsExpanded, setSnapshotsExpanded] = useState(false);
  const [xmlExpanded, setXmlExpanded] = useState(false);
  const [sitesExpanded, setSitesExpanded] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deletingSnapshots, setDeletingSnapshots] = useState(false);
  const [optionsRefreshKey, setOptionsRefreshKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const defaultSnapshotDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}.${mm}.${dd}`;
  }, []);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const data = await getFilterOptions(payload);
        setOptions(data);
        setErrorMessage("");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load filters.");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [payload, setFilters, optionsRefreshKey]);

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

  const handleXmlSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const promptLabel =
      filters.language === "Français" ? "Entrez la date snapshot (YYYY.MM.DD)" : "Enter snapshot date (YYYY.MM.DD)";
    const snapshotDate = window.prompt(promptLabel, defaultSnapshotDate)?.trim() ?? "";
    if (!snapshotDate) {
      event.target.value = "";
      return;
    }
    setUploading(true);
    setUploadMessage("");
    try {
      const data = await uploadXmlSnapshot(snapshotDate, files);
      const activeDate =
        data.processing?.snapshot_date ?? snapshotDate.replace(/\./g, "-");

      if (data.processing) {
        setFilters({
          ...filters,
          selected_dates: [activeDate],
          selected_files: [],
          selected_sites: [],
          selected_file_dates: [],
          effective_dates: [activeDate],
        });
        setSnapshotsExpanded(true);
        setUploadMessage(
          filters.language === "Français"
            ? `${data.uploaded_count} XML importé(s) · ${data.processing.sites_count} sites · ${data.processing.equipment_count} équipements · traité en ${data.processing.processing_seconds}s`
            : `${data.uploaded_count} XML uploaded · ${data.processing.sites_count} sites · ${data.processing.equipment_count} equipment · processed in ${data.processing.processing_seconds}s`,
        );
      } else if (data.processing_error) {
        setUploadMessage(
          filters.language === "Français"
            ? `${data.uploaded_count} XML importé(s), mais le traitement a échoué: ${data.processing_error}`
            : `${data.uploaded_count} XML uploaded, but processing failed: ${data.processing_error}`,
        );
      } else {
        setUploadMessage(
          filters.language === "Français"
            ? `${data.uploaded_count} fichier(s) XML importé(s) pour ${data.snapshot_date}`
            : `${data.uploaded_count} XML file(s) uploaded for ${data.snapshot_date}`,
        );
      }
      setOptionsRefreshKey((key) => key + 1);
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "XML upload failed.");
    } finally {
      setUploading(false);
      event.target.value = "";
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

  const dateCheckboxOptions = useMemo(
    () => filteredDates.map((date) => ({ value: date, label: date })),
    [filteredDates],
  );

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

  return (
    <aside className="premium-card w-full self-start rounded-2xl lg:w-[350px]">
      <div className="flex items-center gap-3 rounded-t-2xl border-b border-red-100/70 bg-gradient-to-r from-red-50/90 via-white to-white px-4 py-3.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-100 bg-white text-red-600">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 5h18M6 12h12M10 19h4" />
          </svg>
        </span>
        <div>
          <h2 className="text-sm font-bold tracking-tight text-slate-900">{t(filters.language, "filters_title")}</h2>
        </div>
      </div>
      <div className="p-4">
      {errorMessage ? <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">{errorMessage}</p> : null}
      <div className="space-y-3">
        <section className="rounded-2xl border border-red-100 bg-red-50/30 p-3">
          <button
            type="button"
            className="mb-2 flex w-full items-center justify-between text-left"
            onClick={() => setSnapshotsExpanded((open) => !open)}
            aria-expanded={snapshotsExpanded}
          >
            <p className="text-sm font-semibold text-slate-800">{t(filters.language, "filters_snapshots")}</p>
            <span className="flex items-center gap-2">
              <span className="text-sm font-bold text-red-600">{filters.selected_dates.length}</span>
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
              className="flex-1 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50"
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
              className="flex-1 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-red-50"
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
          {canManageData ? (
            <button
              type="button"
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
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

        <section className="rounded-2xl border border-red-100 bg-red-50/30 p-3">
          <button
            type="button"
            className="mb-2 flex w-full items-center justify-between text-left"
            onClick={() => setXmlExpanded((open) => !open)}
            aria-expanded={xmlExpanded}
          >
            <p className="text-sm font-semibold text-slate-800">{t(filters.language, "filters_xml")}</p>
            <span className="flex items-center gap-2">
              <span className="text-sm font-bold text-red-600">{selectedFileKeys.length}</span>
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
              className="flex-1 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50"
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
              className="flex-1 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-red-50"
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

        <section className="rounded-2xl border border-red-100 bg-red-50/30 p-3">
          <button
            type="button"
            className="mb-2 flex w-full items-center justify-between text-left"
            onClick={() => setSitesExpanded((open) => !open)}
            aria-expanded={sitesExpanded}
          >
            <p className="text-sm font-semibold text-slate-800">{t(filters.language, "filters_sites")}</p>
            <span className="flex items-center gap-2">
              <span className="text-sm font-bold text-red-600">{filters.selected_sites.length}</span>
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
              className="flex-1 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50"
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
              className="flex-1 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-red-50"
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
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml,text/xml,application/xml"
              multiple
              className="hidden"
              onChange={(event) => void handleXmlSelected(event)}
            />
            <button
              type="button"
              onClick={() => !uploading && fileInputRef.current?.click()}
              disabled={uploading}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V4m0 0L8 8m4-4 4 4" />
                <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              {uploading
                ? filters.language === "Français"
                  ? "Import & traitement..."
                  : "Import & processing..."
                : filters.language === "Français"
                  ? "Importer XML"
                  : "Import XML"}
            </button>
            {uploadMessage ? (
              <p className="mt-2 rounded-xl border border-red-100 bg-red-50/60 px-3 py-2 text-xs font-medium text-red-700">{uploadMessage}</p>
            ) : null}
          </div>
        ) : null}
      </div>
      </div>
    </aside>
  );
}
