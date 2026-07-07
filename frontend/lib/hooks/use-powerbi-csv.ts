"use client";

import { useEffect, useState } from "react";
import { getPowerBiCsv } from "@/lib/api";

export interface SnapshotDate {
  snapshot_date: string;
  count: string;
  site_count: string;
}

export interface DeltaComparison {
  date_ref: string;
  date_cmp: string;
  period_key: string;
  total_sites: string;
  added_sites: string;
  removed_sites: string;
  total_equipment: string;
  cells_2g: string;
  cells_3g: string;
  cells_4g: string;
  cells_5g: string;
}

export interface EquipmentChange {
  date_ref: string;
  date_cmp: string;
  period_key: string;
  change_type: string;
  change_type_label: string;
  site_id: string;
  object_type: string;
  equipment_id: string;
  serial_number: string;
  product_code: string;
  product_name: string;
  nb_equipment: string;
}

export interface DashboardMetrics {
  totalSites: string;
  equipmentAdded: string;
  totalEquipment: string;
  snapshotsCount: number;
  latestSnapshotDate: string;
  snapshotDates: SnapshotDate[];
  equipmentChanges: EquipmentChange[];
}

function parseCsv<T>(content: string): T[] {
  const lines = content.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map((value) => value.replace(/^\ufeff/, "").trim());
  return lines.slice(1).filter(Boolean).map((line) => {
    const values = line.split(",");
    const row = {} as Record<string, string>;
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row as T;
  });
}

export function usePowerBiCsv() {
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        setLoading(true);

        const [snapshots, comparisons, equipment] = await Promise.all([
          getPowerBiCsv("platform_snapshot_dates.csv"),
          getPowerBiCsv("platform_delta_comparison.csv"),
          getPowerBiCsv("platform_delta_equipment_changes.csv"),
        ]);

        if (!mounted) return;

        const snapshotRows = parseCsv<SnapshotDate>(snapshots);
        const comparisonRows = parseCsv<DeltaComparison>(comparisons);
        const equipmentRows = parseCsv<EquipmentChange>(equipment);

        const latestComparison = comparisonRows[0];
        const totalSites = latestComparison?.total_sites || "0";
        const addedSites = latestComparison?.added_sites || "0";
        const totalEquipment = latestComparison?.total_equipment || "0";
        const latestDate = snapshotRows[0]?.snapshot_date || "N/A";

        setData({
          totalSites,
          equipmentAdded: addedSites,
          totalEquipment,
          snapshotsCount: snapshotRows.length,
          latestSnapshotDate: latestDate,
          snapshotDates: snapshotRows,
          equipmentChanges: equipmentRows.slice(0, 10),
        });
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadData();
    return () => {
      mounted = false;
    };
  }, []);

  return { data, loading, error };
}
