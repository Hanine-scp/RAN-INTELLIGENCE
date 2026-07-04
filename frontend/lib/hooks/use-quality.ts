"use client";

import useSWR from "swr";
import { getQuality } from "@/lib/api";
import type { FilterPayload } from "@/lib/types";

export type QualityData = {
  rows: Record<string, unknown>[];
  summary: Record<string, unknown>;
};

function qualityKey(payload: FilterPayload): string | null {
  if (!payload.effective_dates?.length && !payload.selected_dates?.length) return null;
  return [
    "quality",
    payload.vendor,
    ...(payload.effective_dates ?? []).sort(),
    ...(payload.selected_dates ?? []).sort(),
    ...(payload.selected_sites ?? []).sort(),
    ...(payload.selected_files ?? []).sort(),
    payload.smart_missing_serial ? "1" : "0",
    payload.smart_duplicates ? "1" : "0",
    payload.smart_critical_quality ? "1" : "0",
  ].join(":");
}

export function useQuality(payload: FilterPayload) {
  const key = qualityKey(payload);
  return useSWR<QualityData>(
    key,
    () => getQuality(payload),
    {
      revalidateOnFocus: false,
      dedupingInterval: 120_000,
      keepPreviousData: true,
      errorRetryCount: 1,
    },
  );
}
