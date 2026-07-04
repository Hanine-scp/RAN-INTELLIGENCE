"use client";

import { useEffect, useMemo, useState } from "react";
import { MultiBarChart, SummaryLineChart } from "@/components/charts/charts";
import { DataTable } from "@/components/ui/data-table";
import { InvestigationPanel, InvestigationSection, InvestigationStatCard } from "@/components/ui/investigation-panel";
import { useAppContext } from "@/components/providers/app-provider";
import { getAnalytics, investigateAnalyticsSnapshot } from "@/lib/api";
import { t } from "@/lib/i18n";
import { TECH_COLORS, paletteForKeys } from "@/lib/chart-theme";

type SnapshotInvestigation = Awaited<ReturnType<typeof investigateAnalyticsSnapshot>>;

function formatDelta(value: number) {
  if (value > 0) return `+${value.toLocaleString()}`;
  return value.toLocaleString();
}

function signalTone(level: string) {
  if (level === "success") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (level === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  if (level === "critical") return "border-red-200 bg-red-50 text-red-800";
  return "border-sky-200 bg-sky-50 text-sky-800";
}

export function AnalyticsSection() {
  const { payload, filters } = useAppContext();
  const language = filters.language;
  const isFr = language === "Français";

  const [data, setData] = useState<{ summary: Record<string, unknown>[]; equipment: Record<string, unknown>[] }>({
    summary: [],
    equipment: [],
  });
  const [selectedSnapshotKeys, setSelectedSnapshotKeys] = useState<string[]>([]);
  const [investigation, setInvestigation] = useState<SnapshotInvestigation | null>(null);
  const [investigationLoading, setInvestigationLoading] = useState(false);
  const [investigationError, setInvestigationError] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!payload.effective_dates.length && !payload.selected_dates.length) {
        setData({ summary: [], equipment: [] });
        return;
      }
      const response = await getAnalytics(payload);
      setData(response);
    };
    void load();
  }, [payload]);

  const selectedSnapshotDate = selectedSnapshotKeys[0] ?? "";

  useEffect(() => {
    if (!selectedSnapshotDate) {
      setInvestigation(null);
      setInvestigationError("");
      return;
    }

    const loadInvestigation = async () => {
      setInvestigationLoading(true);
      try {
        const result = await investigateAnalyticsSnapshot(payload, selectedSnapshotDate);
        setInvestigation(result);
        setInvestigationError(result.available ? "" : result.reason ?? "Investigation unavailable.");
      } catch (error) {
        setInvestigation(null);
        setInvestigationError(error instanceof Error ? error.message : "Investigation failed.");
      } finally {
        setInvestigationLoading(false);
      }
    };
    void loadInvestigation();
  }, [payload, selectedSnapshotDate]);

  const cellsData = useMemo(
    () =>
      data.summary.map((row) => ({
        snapshot_date: row.snapshot_date,
        cells_2g: row.cells_2g,
        cells_3g: row.cells_3g,
        cells_4g: row.cells_4g,
        cells_4g_fdd: row.cells_4g_fdd,
        cells_4g_tdd: row.cells_4g_tdd,
        cells_5g: row.cells_5g,
      })),
    [data.summary],
  );

  const equipmentByDate = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const row of data.equipment) {
      const date = String(row.snapshot_date ?? "");
      const objectType = String(row.object_type ?? "unknown");
      const count = Number(row.equipment_count ?? 0);
      const current = map.get(date) ?? { snapshot_date: date };
      current[objectType] = count;
      map.set(date, current);
    }
    return Array.from(map.values());
  }, [data.equipment]);

  const equipmentBars = useMemo(() => {
    const keys = new Set<string>();
    for (const row of data.equipment) {
      keys.add(String(row.object_type ?? "unknown"));
    }
    return paletteForKeys(Array.from(keys));
  }, [data.equipment]);

  const closeInvestigation = () => {
    setSelectedSnapshotKeys([]);
    setInvestigation(null);
    setInvestigationError("");
  };

  return (
    <div className="space-y-4">
      <SummaryLineChart data={data.summary} xKey="snapshot_date" yKey="nb_sites" />
      <MultiBarChart
        data={cellsData}
        xKey="snapshot_date"
        bars={[
          { key: "cells_2g", color: TECH_COLORS.cells_2g },
          { key: "cells_3g", color: TECH_COLORS.cells_3g },
          { key: "cells_4g", color: TECH_COLORS.cells_4g },
          { key: "cells_5g", color: TECH_COLORS.cells_5g },
        ]}
      />
      <MultiBarChart data={equipmentByDate} xKey="snapshot_date" bars={equipmentBars} />
      <DataTable
        rows={data.summary}
        rowSelection={{
          rowKey: "snapshot_date",
          selectedKeys: selectedSnapshotKeys,
          onToggle: (rowKey, checked) => {
            if (!rowKey) return;
            setSelectedSnapshotKeys(checked ? [rowKey] : []);
          },
          headerLabel: isFr ? "Choix" : "Select",
        }}
      />

      <InvestigationPanel
        open={Boolean(selectedSnapshotDate)}
        onClose={closeInvestigation}
        eyebrow={t(language, "investigation_eyebrow")}
        title={t(language, "analytics_investigation_title")}
        subtitle={`${t(language, "analytics_investigation_subtitle")} · ${selectedSnapshotDate}`}
        loading={investigationLoading}
        loadingLabel={t(language, "analytics_loading")}
        error={investigationError || undefined}
      >
        {investigation?.available ? (
          <div className="space-y-3">
            <InvestigationSection title={t(language, "analytics_narrative")}>
              <p className="text-xs leading-relaxed text-slate-700">{isFr ? investigation.narrative?.fr : investigation.narrative?.en}</p>
            </InvestigationSection>

            <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
              <InvestigationStatCard label={t(language, "kpi_sites")} value={Number(investigation.sites?.nb_sites ?? 0).toLocaleString()} />
              <InvestigationStatCard
                label={t(language, "kpi_active_sites")}
                value={Number(investigation.sites?.active_sites ?? 0).toLocaleString()}
                tone="success"
              />
              <InvestigationStatCard
                label={t(language, "kpi_blocked_sites")}
                value={Number(investigation.sites?.blocked_sites ?? 0).toLocaleString()}
                tone="danger"
              />
              <InvestigationStatCard
                label={t(language, "kpi_availability")}
                value={`${Number(investigation.sites?.availability_pct ?? 0).toFixed(1)}%`}
              />
            </div>

            <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-6">
              {[
                ["2G", investigation.cells?.cells_2g],
                ["3G", investigation.cells?.cells_3g],
                ["4G", investigation.cells?.cells_4g],
                ["5G", investigation.cells?.cells_5g],
                [t(language, "kpi_total_cells"), investigation.cells?.total_cells],
                [t(language, "kpi_total_equipment"), investigation.equipment?.total],
              ].map(([label, value]) => (
                <InvestigationStatCard key={String(label)} label={String(label)} value={Number(value ?? 0).toLocaleString()} />
              ))}
            </div>

            {investigation.comparison ? (
              <InvestigationSection title={t(language, "analytics_comparison")}>
                <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
                  {[
                    ["delta_nb_sites", t(language, "kpi_sites")],
                    ["delta_total_cells", t(language, "kpi_total_cells")],
                    ["delta_total_equipment", t(language, "kpi_total_equipment")],
                    ["delta_cells_5g", "5G"],
                  ].map(([key, label]) => (
                    <InvestigationStatCard key={key} label={String(label)} value={formatDelta(Number(investigation.comparison?.[key] ?? 0))} tone="info" />
                  ))}
                </div>
                <p className="mt-1.5 text-[10px] text-slate-500">
                  {isFr ? "Référence" : "Reference"}: {String(investigation.comparison.previous_snapshot ?? "")}
                </p>
              </InvestigationSection>
            ) : null}

            {investigation.signals?.length ? (
              <InvestigationSection title={t(language, "analytics_signals")}>
                <div className="space-y-1.5">
                  {investigation.signals.map((signal, index) => (
                    <p key={index} className={`rounded-md border px-2 py-1.5 text-[11px] ${signalTone(signal.level)}`}>
                      {isFr ? signal.fr : signal.en}
                    </p>
                  ))}
                </div>
              </InvestigationSection>
            ) : null}
          </div>
        ) : null}
      </InvestigationPanel>
    </div>
  );
}
