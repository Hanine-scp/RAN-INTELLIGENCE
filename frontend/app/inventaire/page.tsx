"use client";

import { useEffect, useMemo, useState } from "react";
import { MultiBarChart } from "@/components/charts";
import { DataTable } from "@/components/data-table";
import { PageShell } from "@/components/page-shell";
import { useAppContext } from "@/components/app-provider";
import { getInventoryV2 } from "@/lib/api";
import { t } from "@/lib/i18n";

export default function InventairePage() {
  const { payload, filters } = useAppContext();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState({
    totalEquipment: 0,
    uniqueSites: 0,
    uniqueTypes: 0,
    avgEquipmentPerSite: 0,
    topType: "-",
    topTypeQty: 0,
    topTypeShare: 0,
  });
  const [charts, setCharts] = useState<{ byType: Record<string, unknown>[]; bySite: Record<string, unknown>[] }>({
    byType: [],
    bySite: [],
  });
  const pageSize = 500;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const load = async () => {
      if (!payload.effective_dates.length && !payload.selected_dates.length) {
        setRows([]);
        setTotalCount(0);
        setSummary({
          totalEquipment: 0,
          uniqueSites: 0,
          uniqueTypes: 0,
          avgEquipmentPerSite: 0,
          topType: "-",
          topTypeQty: 0,
          topTypeShare: 0,
        });
        setCharts({ byType: [], bySite: [] });
        return;
      }
      const data = await getInventoryV2(payload, { page, page_size: pageSize, search }, []);
      setRows(data.rows);
      setTotalCount(Number(data.total_count ?? 0));
      setSummary({
        totalEquipment: Number(data.summary?.total_equipment ?? 0),
        uniqueSites: Number(data.summary?.unique_sites ?? 0),
        uniqueTypes: Number(data.summary?.unique_types ?? 0),
        avgEquipmentPerSite: Number(data.summary?.avg_equipment_per_site ?? 0),
        topType: String(data.summary?.top_type ?? "-"),
        topTypeQty: Number(data.summary?.top_type_qty ?? 0),
        topTypeShare: Number(data.summary?.top_type_share ?? 0),
      });
      setCharts({
        byType: Array.isArray(data.charts?.by_type) ? data.charts.by_type : [],
        bySite: Array.isArray(data.charts?.by_site) ? data.charts.by_site : [],
      });
    };
    void load();
  }, [payload, page, pageSize, search]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const inventorySummary = useMemo(() => summary, [summary]);

  return (
    <PageShell title={t(filters.language, "page_inv_title")} subtitle="Inventaire hardware installe par date">
      <section className="mb-3 rounded-2xl border border-red-100 bg-white p-3 shadow-[0_10px_26px_rgba(220,38,38,0.08)]">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <article className="rounded-xl border border-red-100 bg-red-50/30 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">
              {filters.language === "Français" ? "Équipements totaux" : "Total equipment"}
            </p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{inventorySummary.totalEquipment.toLocaleString()}</p>
            <p className="text-[10px] text-slate-500">SUM(nb_equipment)</p>
          </article>
          <article className="rounded-xl border border-red-100 bg-red-50/30 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">
              {filters.language === "Français" ? "Sites uniques" : "Unique sites"}
            </p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{inventorySummary.uniqueSites.toLocaleString()}</p>
            <p className="text-[10px] text-slate-500">COUNT(DISTINCT site_id)</p>
          </article>
          <article className="rounded-xl border border-red-100 bg-red-50/30 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">
              {filters.language === "Français" ? "Types uniques" : "Unique types"}
            </p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{inventorySummary.uniqueTypes.toLocaleString()}</p>
            <p className="text-[10px] text-slate-500">COUNT(DISTINCT object_type)</p>
          </article>
          <article className="rounded-xl border border-red-100 bg-red-50/30 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">
              {filters.language === "Français" ? "Moy. équipement/site" : "Avg equip/site"}
            </p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{inventorySummary.avgEquipmentPerSite}</p>
            <p className="text-[10px] text-slate-500">AVG(nb_equipment/site)</p>
          </article>
          <article className="rounded-xl border border-red-100 bg-red-50/30 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">
              {filters.language === "Français" ? "Type dominant" : "Top type"}
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
              {filters.language === "Français" ? "Équipements par type (top 8)" : "Equipment by type (top 8)"}
            </p>
            <MultiBarChart
              data={charts.byType}
              xKey="object_type"
              height={200}
              framed={false}
              bars={[{ key: "total_equipment", color: "#dc2626" }]}
            />
          </article>
          <article className="rounded-xl border border-red-100 bg-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">
              {filters.language === "Français" ? "Équipements par site (top 8)" : "Equipment by site (top 8)"}
            </p>
            <MultiBarChart
              data={charts.bySite}
              xKey="site_id"
              height={200}
              framed={false}
              bars={[{ key: "total_equipment", color: "#ef4444" }]}
            />
          </article>
        </div>
      </section>
      <section className="mb-3 rounded-2xl border border-red-100 bg-white p-3 shadow-[0_8px_24px_rgba(220,38,38,0.08)]">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto_auto]">
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={filters.language === "Français" ? "Recherche" : "Search"}
            className="h-9 rounded-xl border border-red-100 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
          />
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page <= 1}
            className="h-9 rounded-xl border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {filters.language === "Français" ? "Précédent" : "Previous"}
          </button>
          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={page >= totalPages}
            className="h-9 rounded-xl border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {filters.language === "Français" ? "Suivant" : "Next"}
          </button>
          <p className="flex items-center justify-end text-xs font-medium text-slate-600">
            {filters.language === "Français"
              ? `Page ${page}/${totalPages} · ${totalCount.toLocaleString()} lignes`
              : `Page ${page}/${totalPages} · ${totalCount.toLocaleString()} rows`}
          </p>
        </div>
      </section>
      <DataTable rows={rows} showControls={false} showSelection={false} />
    </PageShell>
  );
}
