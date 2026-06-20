import { getInventoryV2, getSitesV2 } from "@/lib/api";
import { buildProductCodePivotRows } from "@/lib/asset-pivot-sheets";
import { UNLIMITED_PAGE_QUERY } from "@/lib/pagination";
import type { FilterPayload } from "@/lib/types";

export type ImportReportTableData = {
  sitesRows: Record<string, unknown>[];
  inventoryRows: Record<string, unknown>[];
  assetsPivotRows: Record<string, unknown>[];
  charts: {
    byType: Record<string, unknown>[];
    bySite: Record<string, unknown>[];
  };
};

export function buildSnapshotPayload(filters: FilterPayload, snapshotDate: string): FilterPayload {
  return {
    ...filters,
    selected_dates: [snapshotDate],
    effective_dates: [snapshotDate],
    selected_files: [],
    selected_sites: [],
    selected_file_dates: [],
  };
}

export function buildEquipmentCounterRows(rows: Record<string, unknown>[], limit = 7): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>();
  rows.forEach((row) => {
    const snapshot = String(row.snapshot_date ?? "").trim();
    const siteId = String(row.site_id ?? "").trim();
    const objectType = String(row.object_type ?? "").trim();
    if (!objectType) return;
    const key = `${snapshot}|${siteId}|${objectType}`;
    const current = map.get(key);
    if (current) {
      current.compteur = Number(current.compteur ?? 0) + 1;
    } else {
      map.set(key, {
        snapshot_date: snapshot,
        site_id: siteId,
        object_type: objectType,
        compteur: 1,
      });
    }
  });
  return Array.from(map.values())
    .sort((a, b) => Number(b.compteur ?? 0) - Number(a.compteur ?? 0))
    .slice(0, limit);
}

export async function loadImportReportTableData(filters: FilterPayload, snapshotDate: string): Promise<ImportReportTableData> {
  const payload = buildSnapshotPayload(filters, snapshotDate);
  const [sitesData, inventoryData] = await Promise.all([
    getSitesV2(payload, { ...UNLIMITED_PAGE_QUERY }),
    getInventoryV2(payload, { ...UNLIMITED_PAGE_QUERY }, []),
  ]);
  const inventoryRows = inventoryData.rows ?? [];
  return {
    sitesRows: sitesData.rows ?? [],
    inventoryRows,
    assetsPivotRows: buildProductCodePivotRows(inventoryRows),
    charts: {
      byType: Array.isArray(inventoryData.charts?.by_type) ? inventoryData.charts.by_type : [],
      bySite: Array.isArray(inventoryData.charts?.by_site) ? inventoryData.charts.by_site : [],
    },
  };
}
