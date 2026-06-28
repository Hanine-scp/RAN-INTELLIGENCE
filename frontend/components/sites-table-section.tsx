"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CellTechnologyShareCard } from "@/components/cell-technology-share-card";
import { DataTable } from "@/components/data-table";
import { SummaryLineChart } from "@/components/charts";
import { InvestigationPanel, InvestigationSection, InvestigationStatCard } from "@/components/investigation-panel";
import { PageLoadingSkeleton } from "@/components/skeleton";
import { useAppContext } from "@/components/app-provider";
import { getSiteKpiTimeseries, getSitesV2, investigateSite, type SiteKpiTimeseries } from "@/lib/api";
import { t } from "@/lib/i18n";
import { DEFAULT_TABLE_PAGE_SIZE } from "@/lib/pagination";
import { buildSiteCellRow } from "@/lib/site-cell-metrics";
import type { FilterPayload } from "@/lib/types";

type SitesTableSectionProps = {
  payload: FilterPayload;
  language: "Français" | "English";
};

export function SitesTableSection({ payload, language }: SitesTableSectionProps) {
  const router = useRouter();
  const fr = language === "Français";
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [siteHistoryRows, setSiteHistoryRows] = useState<Record<string, unknown>[]>([]);
  const [siteEquipmentRows, setSiteEquipmentRows] = useState<Record<string, unknown>[]>([]);
  const [investigationLoading, setInvestigationLoading] = useState(false);
  const [investigationError, setInvestigationError] = useState("");
  const [kpiData, setKpiData] = useState<SiteKpiTimeseries | null>(null);
  const [kpiLoading, setKpiLoading] = useState(false);

  const payloadKey = useMemo(
    () =>
      [
        payload.vendor,
        ...(payload.effective_dates ?? []).sort(),
        ...(payload.selected_dates ?? []).sort(),
        ...(payload.selected_files ?? []).sort(),
        ...(payload.selected_sites ?? []).sort(),
      ].join(":"),
    [payload],
  );

  useEffect(() => {
    setPage(1);
  }, [payloadKey]);

  const totalPages = Math.max(1, Math.ceil(totalCount / DEFAULT_TABLE_PAGE_SIZE));

  useEffect(() => {
    const load = async () => {
      if (!payload.effective_dates.length && !payload.selected_dates.length) {
        setRows([]);
        setTotalCount(0);
        setSelectedSiteId(null);
        setSiteHistoryRows([]);
        setSiteEquipmentRows([]);
        return;
      }
      setLoading(true);
      setLoadError("");
      try {
        const data = await getSitesV2(payload, {
          page,
          page_size: DEFAULT_TABLE_PAGE_SIZE,
          search: payload.site_search ?? "",
        });
        setRows(data.rows);
        setTotalCount(Number(data.total_count ?? data.rows.length));
        setSelectedSiteId((current) =>
          current && !data.rows.some((row) => String(row.site_id ?? "") === current) ? null : current,
        );
      } catch (error) {
        setRows([]);
        setTotalCount(0);
        setLoadError(error instanceof Error ? error.message : "Failed to load sites.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [payload, payloadKey, page]);

  useEffect(() => {
    const loadInvestigation = async () => {
      if (!selectedSiteId) {
        setSiteHistoryRows([]);
        setSiteEquipmentRows([]);
        setInvestigationError("");
        setKpiData(null);
        return;
      }
      setInvestigationLoading(true);
      try {
        const data = await investigateSite(payload, selectedSiteId);
        setSiteHistoryRows(data.site_history ?? []);
        setSiteEquipmentRows(data.equipment ?? []);
        setInvestigationError("");
      } catch (error) {
        setSiteHistoryRows([]);
        setSiteEquipmentRows([]);
        setInvestigationError(error instanceof Error ? error.message : "Investigation failed.");
      } finally {
        setInvestigationLoading(false);
      }
    };
    void loadInvestigation();
  }, [payload, selectedSiteId]);

  useEffect(() => {
    const loadKpi = async () => {
      if (!selectedSiteId) return;
      setKpiLoading(true);
      try {
        const data = await getSiteKpiTimeseries({
          ...payload,
          site_id: selectedSiteId,
          metrics: ["CSSR", "DCR", "PRB_UTIL", "AVAILABILITY"],
          days: 30,
        });
        setKpiData(data);
      } catch {
        setKpiData(null);
      } finally {
        setKpiLoading(false);
      }
    };
    void loadKpi();
  }, [payload, selectedSiteId]);

  const latestSnapshot = useMemo(() => {
    if (!siteHistoryRows.length) return null;
    return siteHistoryRows[0];
  }, [siteHistoryRows]);

  const serialSummaryRows = useMemo(() => {
    const grouped = new Map<
      string,
      {
        serial_number: string;
        equipment_count: number;
        object_types: Set<string>;
        product_codes: Set<string>;
        product_names: Set<string>;
        snapshots: Set<string>;
      }
    >();

    siteEquipmentRows.forEach((row) => {
      const serial = String(row.serial_number ?? "").trim() || "N/A";
      const objectType = String(row.object_type ?? "").trim();
      const productCode = String(row.product_code ?? "").trim();
      const productName = String(row.product_name ?? "").trim();
      const snapshot = String(row.snapshot_date ?? "").trim();

      if (!grouped.has(serial)) {
        grouped.set(serial, {
          serial_number: serial,
          equipment_count: 0,
          object_types: new Set<string>(),
          product_codes: new Set<string>(),
          product_names: new Set<string>(),
          snapshots: new Set<string>(),
        });
      }
      const current = grouped.get(serial)!;
      current.equipment_count += 1;
      if (objectType) current.object_types.add(objectType);
      if (productCode) current.product_codes.add(productCode);
      if (productName) current.product_names.add(productName);
      if (snapshot) current.snapshots.add(snapshot);
    });

    return Array.from(grouped.values())
      .map((row) => ({
        serial_number: row.serial_number,
        equipment_count: row.equipment_count,
        object_types: Array.from(row.object_types).join(", "),
        product_codes: Array.from(row.product_codes).join(", "),
        product_names: Array.from(row.product_names).join(", "),
        snapshots_count: row.snapshots.size,
      }))
      .sort((a, b) => b.equipment_count - a.equipment_count);
  }, [siteEquipmentRows]);

  const investigationKpis = useMemo(() => {
    const historyCount = siteHistoryRows.length;
    const equipmentCount = siteEquipmentRows.length;
    const uniqueSerials = serialSummaryRows.filter((row) => String(row.serial_number ?? "").trim() && String(row.serial_number ?? "") !== "N/A").length;
    const repeatedSerials = serialSummaryRows.filter((row) => Number(row.equipment_count ?? 0) > 1).length;
    const latestState = String(latestSnapshot?.site_state ?? "-");
    return { historyCount, equipmentCount, uniqueSerials, repeatedSerials, latestState };
  }, [latestSnapshot, serialSummaryRows, siteEquipmentRows.length, siteHistoryRows.length]);

  const cssrChartData = useMemo(
    () =>
      (kpiData?.series?.CSSR ?? []).map((p) => ({
        time: String(p.time).slice(0, 10),
        value: p.value,
      })),
    [kpiData],
  );

  const prbChartData = useMemo(
    () =>
      (kpiData?.series?.PRB_UTIL ?? []).map((p) => ({
        time: String(p.time).slice(0, 10),
        value: p.value,
      })),
    [kpiData],
  );

  const siteTableRows = useMemo(
    () =>
      rows.map((row) => {
        const next = { ...row };
        delete next.nb_cells_2g;
        delete next.nb_cells_3g;
        delete next.nb_cells_lte_4g;
        delete next.nb_cells_lte_fdd;
        delete next.nb_cells_lte_tdd;
        delete next.nb_cells_5g;
        delete next.cells_2g;
        delete next.cells_3g;
        delete next.cells_4g_lte;
        delete next.cells_4g_fdd;
        delete next.cells_4g_tdd;
        delete next.cells_5g;
        return next;
      }),
    [rows],
  );

  const cellTableRows = useMemo(() => rows.map((row) => buildSiteCellRow(row)), [rows]);

  const openSiteAi = () => {
    if (!selectedSiteId) return;
    router.push(`/ai-assistant?site_id=${encodeURIComponent(selectedSiteId)}&action=rca`);
  };

  if (!payload.effective_dates.length && !payload.selected_dates.length) {
    return null;
  }

  return (
    <section id="sites-table" className="space-y-4">
      {loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{loadError}</div>
      ) : null}

      {loading && rows.length === 0 ? (
        <PageLoadingSkeleton />
      ) : (
        <>
          <div className="space-y-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2C3E50]">
                {t(language, "table_sites_atlas_title")}
              </p>
              <p className="text-xs text-slate-500">
                {fr
                  ? `${siteTableRows.length.toLocaleString()} site(s) affiché(s) · ${totalCount.toLocaleString()} total`
                  : `${siteTableRows.length.toLocaleString()} site row(s) · ${totalCount.toLocaleString()} total`}
              </p>
            </div>
            <DataTable
              rows={siteTableRows}
              showControls
              sortableLargeDataset
              virtualize
              exportFileName="RAN_Atlas_Sites"
              onRowClick={(row) => {
                const siteId = String(row.site_id ?? "");
                if (siteId) setSelectedSiteId(siteId);
              }}
              rowSelection={{
                rowKey: "site_id",
                selectedKeys: selectedSiteId ? [selectedSiteId] : [],
                headerLabel: fr ? "Enquête" : "Investigate",
                onToggle: (siteId, checked) => setSelectedSiteId(checked ? siteId : null),
              }}
            />
          </div>

          <CellTechnologyShareCard rows={rows} language={language} />

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2C3E50]">
              {t(language, "table_sites_radio_matrix_title")}
            </p>
            <p className="text-xs text-slate-500">
              {fr
                ? `${cellTableRows.length.toLocaleString()} ligne(s) sur ${totalCount.toLocaleString()} · page ${page}/${totalPages}`
                : `${cellTableRows.length.toLocaleString()} row(s) of ${totalCount.toLocaleString()} · page ${page}/${totalPages}`}
            </p>
            <DataTable
              rows={cellTableRows}
              showControls
              showSelection={false}
              showIndex
              indexHeaderLabel={fr ? "Enquête" : "Investigate"}
              sortableLargeDataset
              virtualize
              exportFileName={t(language, "table_sites_radio_matrix_title")}
              visibleColumns={[
                "snapshot_date",
                "site_id",
                "site_name",
                "nb_cells",
                "cells_2g",
                "cells_3g",
                "cells_4g_total",
                "cells_4g_fdd",
                "cells_4g_tdd",
                "cells_5g",
                "technologies",
              ]}
              onRowClick={(row) => {
                const siteId = String(row.site_id ?? "");
                if (siteId) setSelectedSiteId(siteId);
              }}
            />
          </div>

          {totalCount > DEFAULT_TABLE_PAGE_SIZE ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <span className="text-slate-600">
                {fr ? `Page ${page} / ${totalPages}` : `Page ${page} of ${totalPages}`}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  {fr ? "Précédent" : "Previous"}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  {fr ? "Suivant" : "Next"}
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <InvestigationPanel
        open={Boolean(selectedSiteId)}
        onClose={() => setSelectedSiteId(null)}
        eyebrow={t(language, "investigation_eyebrow")}
        title={fr ? `Site ${selectedSiteId ?? ""}` : `Site ${selectedSiteId ?? ""}`}
        subtitle={fr ? "Enquête détaillée du site" : "Detailed site investigation"}
        loading={investigationLoading}
        loadingLabel={t(language, "loading")}
        error={investigationError || undefined}
        badge={
          selectedSiteId ? (
            <button
              type="button"
              onClick={openSiteAi}
              className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-red-700 transition hover:bg-red-100"
            >
              {t(language, "site_ai_analyze")}
            </button>
          ) : null
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-5">
            <InvestigationStatCard label="State" value={investigationKpis.latestState} tone="success" />
            <InvestigationStatCard label="Snapshots" value={investigationKpis.historyCount} />
            <InvestigationStatCard label="Equipment" value={investigationKpis.equipmentCount} />
            <InvestigationStatCard label="Unique serials" value={investigationKpis.uniqueSerials} tone="info" />
            <InvestigationStatCard label="Redondance" value={investigationKpis.repeatedSerials} tone="warning" />
          </div>

          <InvestigationSection title={fr ? "KPI PM (TimescaleDB)" : "PM KPIs (TimescaleDB)"}>
            {kpiLoading ? (
              <p className="text-[11px] text-slate-500">{t(language, "loading")}</p>
            ) : kpiData?.violations?.length ? (
              <div className="mb-2 flex flex-wrap gap-1">
                {kpiData.violations.map((v) => (
                  <span
                    key={`${v.metric}-${v.time}`}
                    className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800"
                  >
                    {v.metric} {v.value} (seuil {v.threshold})
                  </span>
                ))}
              </div>
            ) : (
              <p className="mb-2 text-[10px] text-slate-500">
                {fr ? "CSSR · DCR · PRB · Disponibilité" : "CSSR · DCR · PRB · Availability"}
              </p>
            )}
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <SummaryLineChart data={cssrChartData} xKey="time" yKey="value" height={140} framed />
              <SummaryLineChart data={prbChartData} xKey="time" yKey="value" height={140} framed />
            </div>
          </InvestigationSection>

          <InvestigationSection title={fr ? "Profil site" : "Site profile"}>
            <div className="grid grid-cols-1 gap-1 text-[11px] text-slate-700 md:grid-cols-2">
              <p>
                <span className="font-semibold">{fr ? "Nom" : "Name"}: </span>
                {String(latestSnapshot?.site_name ?? "-")}
              </p>
              <p>
                <span className="font-semibold">{fr ? "Etat" : "State"}: </span>
                {String(latestSnapshot?.site_state ?? "-")}
              </p>
              <p>
                <span className="font-semibold">IP: </span>
                {String(latestSnapshot?.ip_address ?? "-")}
              </p>
              <p>
                <span className="font-semibold">SW: </span>
                {String(latestSnapshot?.sw_version ?? "-")}
              </p>
              <p>
                <span className="font-semibold">{fr ? "Cellules" : "Cells"}: </span>
                {String(latestSnapshot?.nb_cells ?? "0")}
              </p>
              <p>
                <span className="font-semibold">Tech: </span>
                {String(latestSnapshot?.technologies ?? "-")}
              </p>
            </div>
          </InvestigationSection>

          <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
            <InvestigationSection title={fr ? "Historique site" : "Site history"}>
              <DataTable rows={siteHistoryRows} showControls={false} showSelection={false} maxHeightClassName="max-h-[16vh]" />
            </InvestigationSection>
            <InvestigationSection title={fr ? "Serials équipements" : "Equipment serials"}>
              <DataTable rows={serialSummaryRows} showControls={false} showSelection={false} maxHeightClassName="max-h-[16vh]" />
            </InvestigationSection>
          </div>
        </div>
      </InvestigationPanel>
    </section>
  );
}
