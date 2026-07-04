"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/ui/data-table";
import { MultiBarChart } from "@/components/charts/charts";
import { InvestigationPanel, InvestigationSection, InvestigationStatCard } from "@/components/ui/investigation-panel";
import { DeltaAiReportSection } from "@/components/reports/delta-ai-report-section";
import { PageShell } from "@/components/layout/page-shell";
import { getDeltaCompare, investigateSite } from "@/lib/api";
import { useAppContext } from "@/components/providers/app-provider";
import { DELTA_COLORS } from "@/lib/chart-theme";
import { columnLabel, t } from "@/lib/i18n";

type DeltaUnifiedPageProps = {
  title: string;
  subtitle: string;
  embedded?: boolean;
};

export function DeltaUnifiedPage({ title, subtitle, embedded = false }: DeltaUnifiedPageProps) {
  const { payload, filters } = useAppContext();
  const lang = filters.language;
  const [compareDate1, setCompareDate1] = useState("");
  const [compareDate2, setCompareDate2] = useState("");
  const [show4gInvestigation, setShow4gInvestigation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedAddedSiteId, setSelectedAddedSiteId] = useState<string | null>(null);
  const [addedSiteDetail, setAddedSiteDetail] = useState<{ site_history: Record<string, unknown>[]; equipment: Record<string, unknown>[] }>({
    site_history: [],
    equipment: [],
  });
  const [addedSiteLoading, setAddedSiteLoading] = useState(false);
  const [addedSiteError, setAddedSiteError] = useState("");
  const [compare, setCompare] = useState<{
    comparison: Record<string, unknown>[];
    details: Record<string, unknown>[];
    equipment_changes: Record<string, unknown>[];
  }>({
    comparison: [],
    details: [],
    equipment_changes: [],
  });

  const hasSelection = Boolean(payload.effective_dates.length || payload.selected_dates.length);
  const availableDates = useMemo(() => {
    const dates = payload.effective_dates.length ? payload.effective_dates : payload.selected_dates;
    return [...dates].sort().reverse();
  }, [payload.effective_dates, payload.selected_dates]);

  const effectiveDate2 = compareDate2 || availableDates[0] || "";
  const effectiveDate1 = compareDate1 || availableDates[1] || availableDates[0] || "";
  const isReadyToCompare = Boolean(hasSelection && effectiveDate1 && effectiveDate2 && effectiveDate1 !== effectiveDate2);

  useEffect(() => {
    if (!isReadyToCompare) {
      setCompare({ comparison: [], details: [], equipment_changes: [] });
      return;
    }
    setLoading(true);
    void getDeltaCompare(payload, effectiveDate1, effectiveDate2)
      .then((data) =>
        setCompare({
          comparison: data.comparison ?? [],
          details: data.details ?? [],
          equipment_changes: data.equipment_changes ?? [],
        }),
      )
      .finally(() => setLoading(false));
  }, [effectiveDate1, effectiveDate2, isReadyToCompare, payload]);

  const metricMap = useMemo(
    () => new Map(compare.comparison.map((row) => [String(row.metric ?? ""), row])),
    [compare.comparison],
  );

  const kpiView = useMemo(() => {
    const added = compare.details.filter((row) => String(row.change_type ?? "").toUpperCase().includes("ADDED")).length;
    const removed = compare.details.filter((row) => String(row.change_type ?? "").toUpperCase().includes("REMOVED")).length;
    const equipmentDelta = Number(metricMap.get("total_equipment")?.delta ?? 0);
    const degradations = compare.comparison.filter((row) => {
      const metric = String(row.metric ?? "");
      const delta = Number(row.delta ?? 0);
      const riskMetric = metric === "blocked_sites" || metric === "missing_serials" || metric === "removed_sites";
      return riskMetric ? delta > 0 : delta < 0;
    }).length;
    return { added, removed, degradations, equipmentDelta };
  }, [compare.comparison, compare.details, metricMap]);

  const sitesComparison = useMemo(() => {
    const row = metricMap.get("total_sites");
    const oldValue = Number(row?.value_1 ?? 0);
    const newValue = Number(row?.value_2 ?? 0);
    const delta = newValue - oldValue;
    const deltaPct = oldValue > 0 ? Number(((delta / oldValue) * 100).toFixed(1)) : 0;
    return { rows: [{ axis: columnLabel(lang, "total_sites"), ancien: oldValue, nouveau: newValue }], oldValue, newValue, delta, deltaPct };
  }, [metricMap, lang]);

  const equipmentComparison = useMemo(() => {
    const row = metricMap.get("total_equipment");
    const oldValue = Number(row?.value_1 ?? 0);
    const newValue = Number(row?.value_2 ?? 0);
    const delta = newValue - oldValue;
    const deltaPct = oldValue > 0 ? Number(((delta / oldValue) * 100).toFixed(1)) : 0;
    return { rows: [{ axis: columnLabel(lang, "total_equipment"), ancien: oldValue, nouveau: newValue }], oldValue, newValue, delta, deltaPct };
  }, [metricMap, lang]);

  const cellsComparison = useMemo(() => {
    const chartMetrics = [
      { key: "cells_2g", label: "2G" },
      { key: "cells_3g", label: "3G" },
      { key: "cells_4g", label: "4G" },
      { key: "cells_5g", label: "5G" },
    ];
    const tableBaseMetrics = [
      { key: "cells_2g", label: "Cellules 2G" },
      { key: "cells_3g", label: "Cellules 3G" },
      { key: "cells_4g", label: "Cellules 4G (Total)" },
      { key: "cells_5g", label: "Cellules 5G" },
    ];

    const chartRows = chartMetrics.map((metric) => {
      const entry = metricMap.get(metric.key);
      const ancien = Number(entry?.value_1 ?? 0);
      const nouveau = Number(entry?.value_2 ?? 0);
      return {
        _cell_key: metric.key,
        cellule: metric.label,
        ancienne_valeur: ancien,
        nouvelle_valeur: nouveau,
      };
    });

    const tableRows = tableBaseMetrics.map((metric) => {
      const entry = metricMap.get(metric.key);
      return {
        _cell_key: metric.key,
        cellule: columnLabel(lang, metric.key),
        ancienne_valeur: Number(entry?.value_1 ?? 0),
        nouvelle_valeur: Number(entry?.value_2 ?? 0),
      };
    });

    return {
      chartRows,
      tableRows,
    };
  }, [metricMap, lang]);

  const fourGInvestigationRows = useMemo(
    () =>
      (["cells_4g", "cells_4g_fdd", "cells_4g_tdd"] as const)
        .map((key) => ({
          indicateur: columnLabel(lang, key),
          ancienne_valeur: Number(metricMap.get(key)?.value_1 ?? 0),
          nouvelle_valeur: Number(metricMap.get(key)?.value_2 ?? 0),
        }))
        .map((row) => ({
          ...row,
          delta: Number(row.nouvelle_valeur ?? 0) - Number(row.ancienne_valeur ?? 0),
        })),
    [metricMap, lang],
  );

  const impactRows = useMemo(() => {
    return compare.comparison
      .map((row) => {
        const metric = String(row.metric ?? "");
        const delta = Number(row.delta ?? 0);
        return {
          metric,
          date_1: effectiveDate1,
          value_1: Number(row.value_1 ?? 0),
          date_2: effectiveDate2,
          value_2: Number(row.value_2 ?? 0),
          delta,
          impact: Math.abs(delta),
        };
      })
      .sort((a, b) => b.impact - a.impact);
  }, [compare.comparison, effectiveDate1, effectiveDate2]);

  const topImpactChartRows = useMemo(
    () =>
      impactRows.slice(0, 6).map((row) => ({
        metrique: columnLabel(lang, String(row.metric ?? "")),
        impact: Number(row.impact ?? 0),
      })),
    [impactRows, lang],
  );

  const newSitesRows = useMemo(
    () => compare.details.filter((row) => String(row.change_type ?? "").toUpperCase().includes("ADDED")),
    [compare.details],
  );

  const equipmentChangeRows = useMemo(() => compare.equipment_changes, [compare.equipment_changes]);

  const equipmentChangeKpis = useMemo(() => {
    const added = equipmentChangeRows.filter((row) => String(row.change_type ?? "").toUpperCase() === "ADDED").length;
    const removed = equipmentChangeRows.filter((row) => String(row.change_type ?? "").toUpperCase() === "REMOVED").length;
    return { added, removed, total: equipmentChangeRows.length };
  }, [equipmentChangeRows]);

  const exportDateSuffix = useMemo(
    () => `${effectiveDate1}_vs_${effectiveDate2}`.replace(/[^\w\-]+/g, "_"),
    [effectiveDate1, effectiveDate2],
  );

  useEffect(() => {
    if (!selectedAddedSiteId) return;
    const exists = newSitesRows.some((row) => String(row.site_id ?? "") === selectedAddedSiteId);
    if (!exists) {
      setSelectedAddedSiteId(null);
      setAddedSiteDetail({ site_history: [], equipment: [] });
    }
  }, [newSitesRows, selectedAddedSiteId]);

  useEffect(() => {
    const loadSiteDetail = async () => {
      if (!selectedAddedSiteId) {
        setAddedSiteDetail({ site_history: [], equipment: [] });
        setAddedSiteError("");
        return;
      }
      setAddedSiteLoading(true);
      setAddedSiteError("");
      try {
        const detail = await investigateSite(payload, selectedAddedSiteId);
        setAddedSiteDetail({
          site_history: detail.site_history ?? [],
          equipment: detail.equipment ?? [],
        });
      } catch (error) {
        setAddedSiteDetail({ site_history: [], equipment: [] });
        setAddedSiteError(error instanceof Error ? error.message : t(lang, "investigation_failed"));
      } finally {
        setAddedSiteLoading(false);
      }
    };
    void loadSiteDetail();
  }, [payload, selectedAddedSiteId]);

  const addedSiteLatestSnapshot = useMemo(
    () => (addedSiteDetail.site_history.length ? addedSiteDetail.site_history[0] : null),
    [addedSiteDetail.site_history],
  );

  const addedSiteSerialSummaryRows = useMemo(() => {
    const grouped = new Map<
      string,
      {
        serial_number: string;
        equipment_count: number;
        object_types: Set<string>;
        product_codes: Set<string>;
        product_names: Set<string>;
      }
    >();

    addedSiteDetail.equipment.forEach((row) => {
      const serial = String(row.serial_number ?? "").trim() || "N/A";
      const objectType = String(row.object_type ?? "").trim();
      const productCode = String(row.product_code ?? "").trim();
      const productName = String(row.product_name ?? "").trim();

      if (!grouped.has(serial)) {
        grouped.set(serial, {
          serial_number: serial,
          equipment_count: 0,
          object_types: new Set<string>(),
          product_codes: new Set<string>(),
          product_names: new Set<string>(),
        });
      }
      const current = grouped.get(serial)!;
      current.equipment_count += Number(row.nb_equipment ?? 1);
      if (objectType) current.object_types.add(objectType);
      if (productCode) current.product_codes.add(productCode);
      if (productName) current.product_names.add(productName);
    });

    return Array.from(grouped.values())
      .map((row) => ({
        serial_number: row.serial_number,
        equipment_count: row.equipment_count,
        object_types: Array.from(row.object_types).join(", "),
        product_codes: Array.from(row.product_codes).join(", "),
        product_names: Array.from(row.product_names).join(", "),
      }))
      .sort((a, b) => b.equipment_count - a.equipment_count);
  }, [addedSiteDetail.equipment]);

  const addedSiteKpis = useMemo(() => {
    const historyCount = addedSiteDetail.site_history.length;
    const equipmentCount = addedSiteDetail.equipment.reduce(
      (sum, row) => sum + Number(row.nb_equipment ?? 1),
      0,
    );
    const uniqueSerials = addedSiteSerialSummaryRows.filter((row) => String(row.serial_number ?? "").trim() && String(row.serial_number ?? "") !== "N/A").length;
    const repeatedSerials = addedSiteSerialSummaryRows.filter((row) => Number(row.equipment_count ?? 0) > 1).length;
    const latestState = String(addedSiteLatestSnapshot?.site_state ?? "-");
    return { historyCount, equipmentCount, uniqueSerials, repeatedSerials, latestState };
  }, [addedSiteDetail.equipment.length, addedSiteDetail.site_history.length, addedSiteLatestSnapshot, addedSiteSerialSummaryRows]);

  const body = (
    <>
      <DeltaAiReportSection
        referenceDate={effectiveDate1}
        comparisonDate={effectiveDate2}
        isReady={isReadyToCompare && !loading}
        compare={compare}
      />

      <section className="rounded-2xl border border-red-100 bg-gradient-to-r from-white to-red-50/50 p-4 shadow-[0_10px_28px_rgba(220,38,38,0.08)]">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">{t(lang, "delta_period_title")}</p>
          <span className="rounded-full border border-red-200 bg-white px-2 py-0.5 text-xs font-medium text-red-700">
            {effectiveDate1 && effectiveDate2 ? `${effectiveDate1} -> ${effectiveDate2}` : t(lang, "delta_selection_pending")}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-sm font-medium text-zinc-700">
            {t(lang, "delta_ref_date")}
            <select
              className="mt-1 w-full rounded-xl border border-red-100 bg-white px-3 py-2 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
              value={effectiveDate1}
              onChange={(e) => setCompareDate1(e.target.value)}
            >
              <option value="">-</option>
              {availableDates.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-zinc-700">
            {t(lang, "delta_compare_date")}
            <select
              className="mt-1 w-full rounded-xl border border-red-100 bg-white px-3 py-2 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
              value={effectiveDate2}
              onChange={(e) => setCompareDate2(e.target.value)}
            >
              <option value="">-</option>
              {availableDates.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {!hasSelection ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">{t(lang, "delta_no_data")}</p>
      ) : !isReadyToCompare ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">{t(lang, "delta_pick_two_snapshots")}</p>
      ) : loading ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">{t(lang, "loading")}</p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{t(lang, "delta_added_sites")}</p>
              <p className="mt-1 text-2xl font-bold text-emerald-900">{kpiView.added}</p>
            </article>
            <article className="rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">{t(lang, "delta_removed_sites")}</p>
              <p className="mt-1 text-2xl font-bold text-red-900">{kpiView.removed}</p>
            </article>
            <article className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">{t(lang, "delta_degradations")}</p>
              <p className="mt-1 text-2xl font-bold text-amber-900">{kpiView.degradations}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">{t(lang, "delta_equipment_delta_label")}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{kpiView.equipmentDelta}</p>
            </article>
          </section>

          <section className="rounded-2xl border border-red-100 bg-white p-3 shadow-[0_8px_24px_rgba(220,38,38,0.08)]">
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <article className="rounded-xl border border-red-100 bg-white p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">{t(lang, "delta_sites_compare_chart")}</p>
                <MultiBarChart
                  data={sitesComparison.rows}
                  xKey="axis"
                  height={170}
                  framed={false}
                  forceDualAxis
                  bars={[{ key: "ancien", color: DELTA_COLORS.before }, { key: "nouveau", color: DELTA_COLORS.after }]}
                />
                <p className="mt-2 rounded-lg border border-rose-100 bg-rose-50/40 p-2 text-sm font-semibold text-slate-700">
                  {t(lang, "delta_sites_delta")}: {sitesComparison.delta >= 0 ? "+" : ""}
                  {sitesComparison.delta} ({sitesComparison.delta >= 0 ? "+" : ""}
                  {sitesComparison.deltaPct}%)
                </p>
                <p className="mt-1 text-[11px] text-slate-500">{t(lang, "delta_chart_sites_help")}</p>
              </article>

              <article className="rounded-xl border border-red-100 bg-white p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">{t(lang, "delta_equipment_compare_chart")}</p>
                <MultiBarChart
                  data={equipmentComparison.rows}
                  xKey="axis"
                  height={170}
                  framed={false}
                  forceDualAxis
                  bars={[{ key: "ancien", color: DELTA_COLORS.before }, { key: "nouveau", color: DELTA_COLORS.after }]}
                />
                <p className="mt-2 rounded-lg border border-red-100 bg-red-50/40 p-2 text-sm font-semibold text-slate-700">
                  {t(lang, "delta_equipment_delta_label")}: {equipmentComparison.delta >= 0 ? "+" : ""}
                  {equipmentComparison.delta} ({equipmentComparison.delta >= 0 ? "+" : ""}
                  {equipmentComparison.deltaPct}%)
                </p>
                <p className="mt-1 text-[11px] text-slate-500">{t(lang, "delta_chart_equipment_help")}</p>
              </article>

              <article className="rounded-xl border border-red-100 bg-white p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">
                  {t(lang, "delta_cells_compare_chart")}
                </p>
                <MultiBarChart
                  data={cellsComparison.chartRows}
                  xKey="cellule"
                  height={180}
                  framed={false}
                  forceDualAxis
                  onCategoryClick={(point) => {
                    if (String(point._cell_key ?? "") === "cells_4g") {
                      setShow4gInvestigation(true);
                    }
                  }}
                  bars={[
                    { key: "ancienne_valeur", color: DELTA_COLORS.ancienne_valeur },
                    { key: "nouvelle_valeur", color: DELTA_COLORS.nouvelle_valeur },
                  ]}
                />
                <p className="mt-1 text-[11px] text-slate-500">{t(lang, "delta_chart_cells_help")}</p>
              </article>

              <article className="rounded-xl border border-red-100 bg-white p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">{t(lang, "delta_top_impacts_chart")}</p>
                <MultiBarChart
                  data={topImpactChartRows}
                  xKey="metrique"
                  height={180}
                  framed={false}
                  bars={[{ key: "impact", color: "#991b1b" }]}
                />
                <p className="mt-1 text-[11px] text-slate-500">{t(lang, "delta_chart_impacts_help")}</p>
              </article>
            </div>
          </section>

          <section className="rounded-2xl border border-red-100 bg-white p-4 shadow-[0_8px_24px_rgba(220,38,38,0.08)]">
            <p className="mb-2 text-sm font-semibold text-slate-800">{t(lang, "delta_added_sites_detected")}</p>
            {newSitesRows.length ? (
              <DataTable
                rows={newSitesRows}
                showControls={false}
                maxHeightClassName="max-h-[46vh]"
                onRowClick={(row) => {
                  const siteId = String(row.site_id ?? "");
                  if (siteId) setSelectedAddedSiteId(siteId);
                }}
                rowSelection={{
                  rowKey: "site_id",
                  selectedKeys: selectedAddedSiteId ? [selectedAddedSiteId] : [],
                  onToggle: (siteId, checked) => setSelectedAddedSiteId(checked ? siteId : null),
                  headerLabel: t(lang, "table_select"),
                }}
              />
            ) : (
              <p className="text-sm text-slate-500">{t(lang, "delta_no_new_sites")}</p>
            )}
          </section>

          <section className="rounded-2xl border border-red-100 bg-white p-4 shadow-[0_8px_24px_rgba(220,38,38,0.08)]">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800">{t(lang, "delta_table_1_cells")}</p>
              <span className="text-[11px] font-medium text-slate-500">{t(lang, "delta_technology_legend")}</span>
            </div>
            <DataTable
              rows={cellsComparison.tableRows}
              exportFileName={`delta_table_1_cellules_${exportDateSuffix}`}
              showControls={true}
              showIndex={false}
              showSelection={false}
              enableSorting={false}
              visibleColumns={["cellule", "ancienne_valeur", "nouvelle_valeur"]}
              maxHeightClassName="max-h-[46vh]"
              onRowClick={(row) => {
                if (String(row._cell_key ?? "") === "cells_4g") {
                  setShow4gInvestigation(true);
                }
              }}
            />
          </section>

          <section className="rounded-2xl border border-red-100 bg-white p-4 shadow-[0_8px_24px_rgba(220,38,38,0.08)]">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800">{t(lang, "delta_table_2_equipment")}</p>
              <div className="flex items-center gap-2 text-[11px] font-semibold">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">
                  {t(lang, "delta_added_badge")}: {equipmentChangeKpis.added}
                </span>
                <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-red-700">
                  {t(lang, "delta_removed_badge")}: {equipmentChangeKpis.removed}
                </span>
              </div>
            </div>
            {equipmentChangeRows.length ? (
              <DataTable
                rows={equipmentChangeRows}
                exportFileName={`delta_table_2_equipements_${exportDateSuffix}`}
                showControls={true}
                showSelection={false}
                visibleColumns={[
                  "change_type",
                  "site_id",
                  "object_type",
                  "id",
                  "serial_number",
                  "product_code",
                  "product_name",
                  "nb_equipment",
                ]}
                maxHeightClassName="max-h-[56vh]"
              />
            ) : (
              <p className="text-sm text-slate-500">{t(lang, "delta_no_equipment_changes")}</p>
            )}
          </section>

          <section className="rounded-2xl border border-red-100 bg-white p-4 shadow-[0_8px_24px_rgba(220,38,38,0.08)]">
            <p className="mb-2 text-sm font-semibold text-slate-800">{t(lang, "delta_top_impacts_table")}</p>
            <DataTable
              rows={impactRows}
              exportFileName={`delta_impacts_${exportDateSuffix}`}
              showControls={true}
              showSelection={false}
              maxHeightClassName="max-h-[56vh]"
            />
          </section>

          <InvestigationPanel
            open={Boolean(selectedAddedSiteId)}
            onClose={() => setSelectedAddedSiteId(null)}
            eyebrow={t(lang, "investigation_eyebrow")}
            title={`Site ${selectedAddedSiteId ?? ""}`}
            subtitle={t(lang, "delta_added_site_subtitle")}
            loading={addedSiteLoading}
            loadingLabel={t(lang, "loading")}
            error={addedSiteError || undefined}
          >
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-5">
                <InvestigationStatCard label={columnLabel(lang, "site_state")} value={addedSiteKpis.latestState} tone="success" />
                <InvestigationStatCard label={t(lang, "kpi_snapshots")} value={addedSiteKpis.historyCount} />
                <InvestigationStatCard label={columnLabel(lang, "total_equipment")} value={addedSiteKpis.equipmentCount} />
                <InvestigationStatCard label={t(lang, "kpi_unique_serials")} value={addedSiteKpis.uniqueSerials} tone="info" />
                <InvestigationStatCard label={t(lang, "kpi_redundancy")} value={addedSiteKpis.repeatedSerials} tone="warning" />
              </div>

              <InvestigationSection title={t(lang, "delta_site_profile")}>
                <div className="grid grid-cols-1 gap-1 text-[11px] text-slate-700 md:grid-cols-2">
                  <p>
                    <span className="font-semibold">{t(lang, "delta_name_label")}: </span>
                    {String(addedSiteLatestSnapshot?.site_name ?? "-")}
                  </p>
                  <p>
                    <span className="font-semibold">{t(lang, "delta_state_label")}: </span>
                    {String(addedSiteLatestSnapshot?.site_state ?? "-")}
                  </p>
                  <p>
                    <span className="font-semibold">IP: </span>
                    {String(addedSiteLatestSnapshot?.ip_address ?? "-")}
                  </p>
                  <p>
                    <span className="font-semibold">SW: </span>
                    {String(addedSiteLatestSnapshot?.sw_version ?? "-")}
                  </p>
                </div>
              </InvestigationSection>

              <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                <InvestigationSection title={t(lang, "delta_site_history")}>
                  <DataTable rows={addedSiteDetail.site_history} showControls={false} showSelection={false} maxHeightClassName="max-h-[16vh]" />
                </InvestigationSection>
                <InvestigationSection title={t(lang, "delta_equipment_serials")}>
                  <DataTable rows={addedSiteSerialSummaryRows} showControls={false} showSelection={false} maxHeightClassName="max-h-[16vh]" />
                </InvestigationSection>
              </div>
            </div>
          </InvestigationPanel>

          <InvestigationPanel
            open={show4gInvestigation}
            onClose={() => setShow4gInvestigation(false)}
            eyebrow={t(lang, "investigation_eyebrow")}
            title={t(lang, "delta_4g_analysis")}
            subtitle={`Total, FDD, TDD · ${effectiveDate1} vs ${effectiveDate2}`}
          >
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-1.5 md:grid-cols-3">
                {fourGInvestigationRows.map((row) => (
                  <InvestigationStatCard
                    key={row.indicateur}
                    label={row.indicateur}
                    value={
                      <span>
                        <span className={`${row.delta >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                          {row.delta >= 0 ? "+" : ""}
                          {row.delta}
                        </span>
                        <span className="mt-0.5 block text-[10px] font-normal text-slate-500">
                          {row.ancienne_valeur} → {row.nouvelle_valeur}
                        </span>
                      </span>
                    }
                    tone={row.delta >= 0 ? "success" : "danger"}
                  />
                ))}
              </div>
              <InvestigationSection title={t(lang, "delta_indicator_detail")}>
                <DataTable
                  rows={fourGInvestigationRows}
                  showControls={false}
                  showSelection={false}
                  showIndex={false}
                  enableSorting={false}
                  maxHeightClassName="max-h-[18vh]"
                />
              </InvestigationSection>
            </div>
          </InvestigationPanel>
        </>
      )}
    </>
  );

  return embedded ? (
    <div className="space-y-4">{body}</div>
  ) : (
    <PageShell title={title} subtitle={subtitle}>
      {body}
    </PageShell>
  );
}
