"use client";

import { useEffect, useMemo, useState } from "react";
import { MultiBarChart } from "@/components/charts";
import { DataTable } from "@/components/data-table";
import { useAppContext } from "@/components/app-provider";
import { getInventoryV2, getSitesV2 } from "@/lib/api";
import { buildProductCodePivotRows } from "@/lib/asset-pivot-sheets";
import { CHART_PRIMARY, CHART_TERTIARY } from "@/lib/chart-theme";
import { t } from "@/lib/i18n";
import { UNLIMITED_PAGE_QUERY } from "@/lib/pagination";
import type { FilterPayload } from "@/lib/types";

type ImportResultsSectionProps = {
  snapshotDate: string;
  processingSummary?: {
    sites_count?: number;
    equipment_count?: number;
    processing_seconds?: number;
    xml_count?: number;
  };
};

function buildSnapshotPayload(filters: FilterPayload, snapshotDate: string): FilterPayload {
  return {
    ...filters,
    selected_dates: [snapshotDate],
    effective_dates: [snapshotDate],
    selected_files: [],
    selected_sites: [],
    selected_file_dates: [],
  };
}

export function ImportResultsSection({ snapshotDate, processingSummary }: ImportResultsSectionProps) {
  const { filters } = useAppContext();
  const fr = filters.language === "Français";
  const payload = useMemo(() => buildSnapshotPayload(filters, snapshotDate), [filters, snapshotDate]);

  const [sitesRows, setSitesRows] = useState<Record<string, unknown>[]>([]);
  const [inventoryRows, setInventoryRows] = useState<Record<string, unknown>[]>([]);
  const [charts, setCharts] = useState<{ byType: Record<string, unknown>[]; bySite: Record<string, unknown>[] }>({
    byType: [],
    bySite: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [sitesData, inventoryData] = await Promise.all([
          getSitesV2(payload, { ...UNLIMITED_PAGE_QUERY }),
          getInventoryV2(payload, { ...UNLIMITED_PAGE_QUERY }, []),
        ]);
        setSitesRows(sitesData.rows ?? []);
        setInventoryRows(inventoryData.rows ?? []);
        setCharts({
          byType: Array.isArray(inventoryData.charts?.by_type) ? inventoryData.charts.by_type : [],
          bySite: Array.isArray(inventoryData.charts?.by_site) ? inventoryData.charts.by_site : [],
        });
      } catch (e) {
        setSitesRows([]);
        setInventoryRows([]);
        setCharts({ byType: [], bySite: [] });
        setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [payload]);

  const assetsPivotRows = useMemo(() => buildProductCodePivotRows(inventoryRows).slice(0, 50), [inventoryRows]);

  if (loading) {
    return <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">{t(filters.language, "loading")}</p>;
  }

  if (error) {
    return <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</p>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-teal-200/80 bg-gradient-to-r from-teal-50 to-white p-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">
          {fr ? "Snapshot importé" : "Imported snapshot"}
        </p>
        <p className="mt-1 text-xl font-extrabold text-slate-900">{snapshotDate}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <article className="rounded-xl border border-white/80 bg-white/90 px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{fr ? "Fichiers XML" : "XML files"}</p>
            <p className="text-lg font-extrabold text-slate-900">{Number(processingSummary?.xml_count ?? 0).toLocaleString()}</p>
          </article>
          <article className="rounded-xl border border-white/80 bg-white/90 px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{fr ? "Sites" : "Sites"}</p>
            <p className="text-lg font-extrabold text-slate-900">{Number(processingSummary?.sites_count ?? sitesRows.length).toLocaleString()}</p>
          </article>
          <article className="rounded-xl border border-white/80 bg-white/90 px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{fr ? "Équipements" : "Equipment"}</p>
            <p className="text-lg font-extrabold text-slate-900">{Number(processingSummary?.equipment_count ?? inventoryRows.length).toLocaleString()}</p>
          </article>
          <article className="rounded-xl border border-white/80 bg-white/90 px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{fr ? "Durée traitement" : "Processing time"}</p>
            <p className="text-lg font-extrabold text-slate-900">{Number(processingSummary?.processing_seconds ?? 0).toFixed(1)}s</p>
          </article>
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2C3E50]">
          {t(filters.language, "table_sites_atlas_title")}
        </p>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
          <article className="rounded-2xl border border-red-100 bg-white p-3 xl:col-span-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">
              {fr ? "Sites par snapshot" : "Sites per snapshot"}
            </p>
            <MultiBarChart
              data={[{ snapshot_date: snapshotDate, nb_sites: sitesRows.length }]}
              xKey="snapshot_date"
              height={180}
              framed={false}
              bars={[{ key: "nb_sites", color: CHART_PRIMARY }]}
            />
          </article>
          <div className="xl:col-span-7">
            <DataTable
              rows={sitesRows}
              showControls
              sortableLargeDataset
              virtualize
              exportFileName={t(filters.language, "table_sites_atlas_title")}
              visibleColumns={["snapshot_date", "site_id", "site_name", "site_state", "nb_cells", "technologies"]}
            />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2C3E50]">
          {t(filters.language, "table_inventory_registry_title")}
        </p>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
          <article className="rounded-2xl border border-red-100 bg-white p-3 xl:col-span-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">
              {fr ? "Équipements par type" : "Equipment by type"}
            </p>
            <MultiBarChart
              data={charts.byType}
              xKey="object_type"
              height={220}
              framed={false}
              bars={[{ key: "total_equipment", color: CHART_PRIMARY }]}
            />
          </article>
          <div className="xl:col-span-7">
            <DataTable
              rows={inventoryRows}
              showControls
              sortableLargeDataset
              virtualize
              exportFileName={t(filters.language, "table_inventory_registry_title")}
              visibleColumns={["snapshot_date", "site_id", "object_type", "serial_number", "product_name", "product_code"]}
            />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2C3E50]">
          {t(filters.language, "table_assets_register_title")}
        </p>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
          <article className="rounded-2xl border border-slate-200 bg-white p-3 xl:col-span-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
              {fr ? "Top codes produit" : "Top product codes"}
            </p>
            <MultiBarChart
              data={assetsPivotRows.slice(0, 12).map((row) => ({
                product_code: row.product_code,
                serial_count: row.serial_count,
              }))}
              xKey="product_code"
              height={220}
              framed={false}
              bars={[{ key: "serial_count", color: CHART_TERTIARY }]}
            />
          </article>
          <div className="xl:col-span-7">
            <DataTable
              rows={assetsPivotRows}
              showControls
              showIndex={false}
              showSelection={false}
              compact
              sortableLargeDataset
              virtualize
              exportFileName={t(filters.language, "table_assets_pivot_product_code")}
              visibleColumns={["product_code", "serial_count"]}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
