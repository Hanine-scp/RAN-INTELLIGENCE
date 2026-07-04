"use client";

import useSWR from "swr";
import { getSitesV2 } from "@/lib/api";
import type { FilterPayload } from "@/lib/types";

type SitesPageOptions = {
  page: number;
  page_size: number;
  search?: string;
};

function sitesKey(payload: FilterPayload, options: SitesPageOptions): string | null {
  if (!payload.effective_dates?.length && !payload.selected_dates?.length) return null;
  return [
    "sites-v2",
    payload.vendor,
    ...(payload.effective_dates ?? []).sort(),
    ...(payload.selected_dates ?? []).sort(),
    ...(payload.selected_sites ?? []).sort(),
    ...(payload.selected_files ?? []).sort(),
    options.page,
    options.page_size,
    (options.search ?? "").trim(),
  ].join(":");
}

export function useSitesPage(payload: FilterPayload, options: SitesPageOptions) {
  const key = sitesKey(payload, options);
  return useSWR(
    key,
    () => getSitesV2(payload, options),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      keepPreviousData: true,
      errorRetryCount: 1,
    },
  );
}
