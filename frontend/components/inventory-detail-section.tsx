"use client";

import { useEffect, useMemo, useState } from "react";
import { MultiBarChart } from "@/components/charts";
import { DataTable } from "@/components/data-table";
import { buildInventoryRowKey, InventoryInvestigationPanel } from "@/components/inventory-investigation-panel";
import { useAppContext } from "@/components/app-provider";
import { getInventoryV2 } from "@/lib/api";
import { t } from "@/lib/i18n";
import {
  buildEquipmentChartBySite,
  buildEquipmentChartByType,
  computeInventorySummaryFromRows,
} from "@/lib/equipment-analytics";
import { UNLIMITED_PAGE_QUERY } from "@/lib/pagination";
import { filterUniqueSerialRows } from "@/lib/serial-utils";
import { CHART_PRIMARY, CHART_SECONDARY } from "@/lib/chart-theme";
import {
  buildSiteEquipmentCounterRows,
  SITE_EQUIPMENT_COUNTER_COLUMNS,
} from "@/lib/site-equipment-counters";

export function InventoryDetailSection({ uniqueSerialOnly }: { uniqueSerialOnly: boolean }) {
  const { payload, filters } = useAppContext();
  const fr = filters.language === "Français";
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [siteFilter, setSiteFilter] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!payload.effective_dates.length && !payload.selected_dates.length) {
        setRows([]);
        setTotalCount(0);
        setSelectedRowKey(null);
        return;
      }
      const data = await getInventoryV2(payload, { ...UNLIMITED_PAGE_QUERY }, []);
      setRows(data.rows);
      setTotalCount(Number(data.total_count ?? data.rows.length));
      setSelectedRowKey((current) =>
        current && !data.rows.some((row) => buildInventoryRowKey(row) === current) ? null : current,
      );
    };
    void load();
  }, [payload]);

  const scopedRows = useMemo(
    () => (uniqueSerialOnly ? filterUniqueSerialRows(rows) : rows),
    [rows, uniqueSerialOnly],
  );

  const inventorySummary = useMemo(() => computeInventorySummaryFromRows(scopedRows), [scopedRows]);

  const charts = useMemo(
    () => ({
      byType: buildEquipmentChartByType(scopedRows),
      bySite: buildEquipmentChartBySite(scopedRows),
    }),
    [scopedRows],
  );

  const tableRows = useMemo(() => {
    const filtered = scopedRows.filter((row) => !siteFilter || String(row.site_id ?? "") === siteFilter);
    return filtered.map((row) => ({
      ...row,
      _row_key: buildInventoryRowKey(row),
    }));
  }, [scopedRows, siteFilter]);

  const siteCounterRows = useMemo(() => buildSiteEquipmentCounterRows(scopedRows), [scopedRows]);

  const selectedRow = useMemo(
    () => tableRows.find((row) => String(row._row_key ?? "") === selectedRowKey) ?? null,
    [selectedRowKey, tableRows],
  );

  if (!payload.effective_dates.length && !payload.selected_dates.length) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        {fr ? "Sélectionnez au moins un snapshot dans les filtres." : "Select at least one snapshot in filters."}
      </p>
    );
  }

  return (
    <div id="inventory-detail" className="space-y-3">
      <section className="platform-surface-soft p-3">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-red-700">
          {t(filters.language, "table_inventory_registry_title")}
        </p>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <article className="rounded-xl border border-red-100 bg-red-50/30 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">
              {fr ? "Équipements totaux" : "Total equipment"}
            </p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{inventorySummary.totalEquipment.toLocaleString()}</p>
          </article>
          <article className="rounded-xl border border-red-100 bg-red-50/30 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">
              {fr ? "Sites uniques" : "Unique sites"}
            </p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{inventorySummary.uniqueSites.toLocaleString()}</p>
          </article>
          <article className="rounded-xl border border-red-100 bg-red-50/30 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">
              {fr ? "Types uniques" : "Unique types"}
            </p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{inventorySummary.uniqueTypes.toLocaleString()}</p>
          </article>
          <article className="rounded-xl border border-red-100 bg-red-50/30 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">
              {fr ? "Moy. équipement/site" : "Avg equip/site"}
            </p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{inventorySummary.avgEquipmentPerSite}</p>
          </article>
          <article className="rounded-xl border border-red-100 bg-red-50/30 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">
              {fr ? "Type dominant" : "Top type"}
            </p>
            <p className="mt-1 truncate text-base font-extrabold text-slate-900">{inventorySummary.topType}</p>
            <p className="text-[10px] text-slate-500">
              {inventorySummary.topTypeQty.toLocaleString()} ({inventorySummary.topTypeShare}%)
            </p>
          </article>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
          <article className="rounded-xl border border-red-100 bg-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">
              {fr ? "Équipements par type (top 8)" : "Equipment by type (top 8)"}
            </p>
            <MultiBarChart
              data={charts.byType}
              xKey="object_type"
              height={200}
              framed={false}
              bars={[{ key: "total_equipment", color: CHART_PRIMARY }]}
            />
          </article>
          <article className="rounded-xl border border-red-100 bg-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">
              {fr ? "Équipements par site (top 8)" : "Equipment by site (top 8)"}
            </p>
            <MultiBarChart
              data={charts.bySite}
              xKey="site_id"
              height={200}
              framed={false}
              bars={[{ key: "total_equipment", color: CHART_SECONDARY }]}
            />
          </article>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-platform-navy">
            {t(filters.language, "table_inventory_site_counter_title")}
          </p>
          {siteFilter ? (
            <button
              type="button"
              onClick={() => setSiteFilter("")}
              className="rounded-lg border border-red-200 px-2.5 py-1 text-[10px] font-semibold text-red-700 hover:bg-red-50"
            >
              {fr ? `Filtre site ${siteFilter} · Effacer` : `Site filter ${siteFilter} · Clear`}
            </button>
          ) : null}
        </div>
        <DataTable
          rows={siteCounterRows}
          showControls
          sortableLargeDataset
          virtualize
          exportFileName={t(filters.language, "table_inventory_site_counter_title")}
          visibleColumns={[...SITE_EQUIPMENT_COUNTER_COLUMNS]}
          onRowClick={(row) => {
            const siteId = String(row.site_id ?? "");
            if (siteId) setSiteFilter((current) => (current === siteId ? "" : siteId));
          }}
        />
      </section>

      <div className="space-y-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-platform-navy">
            {t(filters.language, "table_inventory_registry_title")}
          </p>
          <p className="text-xs text-slate-500">
            {fr
              ? `${tableRows.length.toLocaleString()} ligne(s) affichée(s) · ${scopedRows.length.toLocaleString()} sur ${totalCount.toLocaleString()} · cochez Enquête pour ouvrir le dossier site/équipement`
              : `${tableRows.length.toLocaleString()} row(s) shown · ${scopedRows.length.toLocaleString()} of ${totalCount.toLocaleString()} · check Investigate to open site/equipment dossier`}
          </p>
        </div>
        <DataTable
          rows={tableRows}
          showControls
          sortableLargeDataset
          virtualize
          exportFileName={t(filters.language, "table_inventory_registry_title")}
          onRowClick={(row) => {
            const key = String(row._row_key ?? buildInventoryRowKey(row));
            setSelectedRowKey((current) => (current === key ? null : key));
          }}
          rowSelection={{
            rowKey: "_row_key",
            selectedKeys: selectedRowKey ? [selectedRowKey] : [],
            headerLabel: fr ? "Enquête" : "Investigate",
            onToggle: (key, checked) => setSelectedRowKey(checked ? key : null),
          }}
        />
      </div>

      <InventoryInvestigationPanel
        open={Boolean(selectedRowKey && selectedRow)}
        row={selectedRow}
        language={filters.language}
        payload={payload}
        onClose={() => setSelectedRowKey(null)}
      />
    </div>
  );
}
