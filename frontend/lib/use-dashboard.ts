"use client";

import useSWR from "swr";
import { getDashboard } from "@/lib/api";
import type { FilterPayload } from "@/lib/types";

export type DashboardData = {
  period: { latest_date: string; oldest_date: string; snapshot_count: number };
  kpis: Record<string, number>;
  summary: Record<string, unknown>[];
  equipment_summary: Record<string, unknown>[];
};

function dashboardKey(payload: FilterPayload): string | null {
  const hasDates = payload.effective_dates?.length || payload.selected_dates?.length;
  if (!hasDates) return null;
  return [
    "dashboard",
    payload.vendor,
    ...(payload.effective_dates ?? []).sort(),
    ...(payload.selected_sites ?? []).sort(),
    ...(payload.selected_files ?? []).sort(),
    payload.smart_missing_serial ? "1" : "0",
    payload.smart_duplicates ? "1" : "0",
    payload.smart_critical_quality ? "1" : "0",
  ].join(":");
}

export function useDashboard(payload: FilterPayload) {
  const key = dashboardKey(payload);
  return useSWR<DashboardData>(
    key,
    () => getDashboard(payload),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 120_000,
      keepPreviousData: true,
      errorRetryCount: 2,
    },
  );
}
