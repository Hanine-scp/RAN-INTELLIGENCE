"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getFilterOptions } from "@/lib/api";
import { t } from "@/lib/i18n";
import { useAppContext } from "@/components/app-provider";

type OptionData = {
  date_options: string[];
  file_options: { snapshot_date: string; source_file: string }[];
  site_options: { snapshot_date: string; source_file: string; site_id: string; site_name: string }[];
  total_sites: number;
  total_xml: number;
};

export function FilterPanel() {
  const { filters, setFilters, payload } = useAppContext();
  const [options, setOptions] = useState<OptionData>({
    date_options: [],
    file_options: [],
    site_options: [],
    total_sites: 0,
    total_xml: 0,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const data = await getFilterOptions(payload);
        setOptions(data);
        if (!filters.selected_dates.length && data.date_options.length) {
          setFilters({
            ...filters,
            selected_dates: [data.date_options[0]],
            effective_dates: [data.date_options[0]],
          });
        }
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [payload, setFilters]);

  const fileKeys = useMemo(
    () => options.file_options.map((f) => `${f.snapshot_date} | ${f.source_file}`),
    [options.file_options],
  );
  const siteKeys = useMemo(
    () => options.site_options.map((s) => `${s.snapshot_date} | ${s.site_id} | ${s.site_name}`),
    [options.site_options],
  );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selectedFileDates = options.file_options
      .filter((f) => filters.selected_files.includes(f.source_file))
      .map((f) => f.snapshot_date);
    const effective_dates = selectedFileDates.length ? selectedFileDates : filters.selected_dates;
    setFilters({ ...filters, selected_file_dates: selectedFileDates, effective_dates });
  };

  return (
    <aside className="w-full rounded-2xl border border-red-100 bg-white p-4 shadow-sm lg:sticky lg:top-24 lg:w-[330px] lg:self-start">
      <h2 className="mb-4 text-lg font-bold text-red-700">{t(filters.language, "filters_title")}</h2>
      <form className="space-y-3" onSubmit={onSubmit}>
        <label className="block text-sm font-medium text-zinc-700">
          {t(filters.language, "filters_lang")}
          <select
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
            value={filters.language}
            onChange={(e) => setFilters({ ...filters, language: e.target.value as "Français" | "English" })}
          >
            <option>Français</option>
            <option>English</option>
          </select>
        </label>

        <label className="block text-sm font-medium text-zinc-700">
          {t(filters.language, "filters_snapshots")}
          <select
            multiple
            className="mt-1 h-28 w-full rounded-xl border border-zinc-200 px-3 py-2"
            value={filters.selected_dates}
            onChange={(e) =>
              setFilters({
                ...filters,
                selected_dates: Array.from(e.target.selectedOptions, (o) => o.value),
              })
            }
          >
            {options.date_options.map((date) => (
              <option key={date} value={date}>
                {date}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-zinc-700">
          {t(filters.language, "filters_xml")}
          <select
            multiple
            className="mt-1 h-28 w-full rounded-xl border border-zinc-200 px-3 py-2"
            value={filters.selected_files}
            onChange={(e) => {
              const chosenKeys = Array.from(e.target.selectedOptions, (o) => o.value);
              const selected = options.file_options
                .filter((f) => chosenKeys.includes(`${f.snapshot_date} | ${f.source_file}`))
                .map((f) => f.source_file);
              setFilters({ ...filters, selected_files: selected });
            }}
          >
            {fileKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-zinc-700">
          {t(filters.language, "filters_site_search")}
          <input
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
            value={filters.site_search}
            onChange={(e) => setFilters({ ...filters, site_search: e.target.value })}
          />
        </label>

        <label className="block text-sm font-medium text-zinc-700">
          {t(filters.language, "filters_sites")}
          <select
            multiple
            className="mt-1 h-28 w-full rounded-xl border border-zinc-200 px-3 py-2"
            value={filters.selected_sites}
            onChange={(e) => {
              const chosenKeys = Array.from(e.target.selectedOptions, (o) => o.value);
              const selected = options.site_options
                .filter((s) => chosenKeys.includes(`${s.snapshot_date} | ${s.site_id} | ${s.site_name}`))
                .map((s) => s.site_id);
              setFilters({ ...filters, selected_sites: selected });
            }}
          >
            {siteKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="w-full rounded-xl bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700"
          disabled={loading}
        >
          {loading ? "..." : t(filters.language, "filters_apply")}
        </button>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
          <p>
            XML: <span className="font-semibold text-zinc-800">{options.total_xml.toLocaleString()}</span>
          </p>
          <p>
            Sites: <span className="font-semibold text-zinc-800">{options.total_sites.toLocaleString()}</span>
          </p>
        </div>
      </form>
    </aside>
  );
}
