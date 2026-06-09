"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { SummaryLineChart } from "@/components/charts";
import { InvestigationPanel, InvestigationSection, InvestigationStatCard } from "@/components/investigation-panel";
import { PageShell } from "@/components/page-shell";
import { useAppContext } from "@/components/app-provider";
import { getSiteKpiTimeseries, getSites, investigateSite, type SiteKpiTimeseries } from "@/lib/api";
import { t } from "@/lib/i18n";

export default function SitesPage() {
  const { payload, filters } = useAppContext();
  const router = useRouter();
  const fr = filters.language === "Français";
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [siteHistoryRows, setSiteHistoryRows] = useState<Record<string, unknown>[]>([]);
  const [siteEquipmentRows, setSiteEquipmentRows] = useState<Record<string, unknown>[]>([]);
  const [investigationLoading, setInvestigationLoading] = useState(false);
  const [investigationError, setInvestigationError] = useState("");
  const [kpiData, setKpiData] = useState<SiteKpiTimeseries | null>(null);
  const [kpiLoading, setKpiLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!payload.effective_dates.length && !payload.selected_dates.length) {
        setRows([]);
        setSelectedSiteId(null);
        setSiteHistoryRows([]);
        setSiteEquipmentRows([]);
        return;
      }
      const data = await getSites(payload);
      setRows(data);
      if (selectedSiteId && !data.some((row) => String(row.site_id ?? "") === selectedSiteId)) {
        setSelectedSiteId(null);
      }
    };
    void load();
  }, [payload, selectedSiteId]);

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
        delete next.cells_4g_fdd;
        delete next.cells_4g_tdd;
        return next;
      }),
    [rows],
  );

  const openSiteAi = () => {
    if (!selectedSiteId) return;
    router.push(`/ai-assistant?site_id=${encodeURIComponent(selectedSiteId)}&action=rca`);
  };

  return (
    <PageShell title={t(filters.language, "page_sites_title")} subtitle="Etat des sites RAN Nokia">
      <DataTable
        rows={siteTableRows}
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

      <InvestigationPanel
        open={Boolean(selectedSiteId)}
        onClose={() => setSelectedSiteId(null)}
        eyebrow={t(filters.language, "investigation_eyebrow")}
        title={fr ? `Site ${selectedSiteId ?? ""}` : `Site ${selectedSiteId ?? ""}`}
        subtitle={fr ? "Enquête détaillée du site" : "Detailed site investigation"}
        loading={investigationLoading}
        loadingLabel={t(filters.language, "loading")}
        error={investigationError || undefined}
        badge={
          selectedSiteId ? (
            <button
              type="button"
              onClick={openSiteAi}
              className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-red-700 transition hover:bg-red-100"
            >
              {t(filters.language, "site_ai_analyze")}
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
              <p className="text-[11px] text-slate-500">{t(filters.language, "loading")}</p>
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
    </PageShell>
  );
}
