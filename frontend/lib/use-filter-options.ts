"use client";

import useSWR from "swr";
import { getFilterOptions } from "@/lib/api";
import type { FilterPayload } from "@/lib/types";

export type FilterOptionsData = {
  date_options: string[];
  file_options: { snapshot_date: string; source_file: string }[];
  site_options: { snapshot_date: string; source_file: string; site_id: string; site_name: string }[];
  total_sites: number;
  total_xml: number;
  processed_dates?: string[];
  xml_snapshots?: {
    snapshot_date: string;
    folder_name: string;
    xml_count: number;
    processed_in_lake: boolean;
  }[];
  lake_ready?: boolean;
};

/** Stable SWR key — ignore search keystrokes and language-only changes. */
function filterOptionsKey(payload: FilterPayload, refreshKey: number): string {
  return [
    "filter-options",
    refreshKey,
    payload.vendor,
    ...(payload.selected_dates ?? []).sort(),
    ...(payload.selected_files ?? []).sort(),
    ...(payload.selected_sites ?? []).sort(),
    ...(payload.effective_dates ?? []).sort(),
  ].join(":");
}

export function useFilterOptions(payload: FilterPayload, refreshKey = 0) {
  const key = filterOptionsKey(payload, refreshKey);
  return useSWR<FilterOptionsData>(
    key,
    () => getFilterOptions(payload),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 120_000,
      keepPreviousData: true,
      errorRetryCount: 1,
    },
  );
}
