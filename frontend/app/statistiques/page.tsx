"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import { MultiBarChart } from "@/components/charts";
import { InvestigationPanel, InvestigationSection, InvestigationStatCard } from "@/components/investigation-panel";
import { PageShell } from "@/components/page-shell";
import { useAppContext } from "@/components/app-provider";
import { getStatistics, investigateObjectType } from "@/lib/api";
import { t } from "@/lib/i18n";

type ObjectTypeInvestigation = Awaited<ReturnType<typeof investigateObjectType>>;

function signalTone(level: string) {
  if (level === "success") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (level === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  if (level === "critical") return "border-red-200 bg-red-50 text-red-800";
  return "border-sky-200 bg-sky-50 text-sky-800";
}

export default function StatistiquesPage() {
  const { payload, filters } = useAppContext();
  const language = filters.language;
  const isFr = language === "Français";

  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [selectedObjectTypes, setSelectedObjectTypes] = useState<string[]>([]);
  const [investigation, setInvestigation] = useState<ObjectTypeInvestigation | null>(null);
  const [investigationLoading, setInvestigationLoading] = useState(false);
  const [investigationError, setInvestigationError] = useState("");

  const selectedObjectType = selectedObjectTypes[0] ?? "";

  useEffect(() => {
    const load = async () => {
      if (!payload.effective_dates.length && !payload.selected_dates.length) {
        setRows([]);
        return;
      }
      const data = await getStatistics(payload);
      setRows(data);
    };
    void load();
  }, [payload]);

  const loadInvestigation = useCallback(async () => {
    if (!selectedObjectType) {
      setInvestigation(null);
      setInvestigationError("");
      return;
    }
    setInvestigationLoading(true);
    try {
      const result = await investigateObjectType(payload, selectedObjectType);
      setInvestigation(result);
      setInvestigationError(result.available ? "" : result.reason ?? "Investigation unavailable.");
    } catch (error) {
      setInvestigation(null);
      setInvestigationError(error instanceof Error ? error.message : "Investigation failed.");
    } finally {
      setInvestigationLoading(false);
    }
  }, [payload, selectedObjectType]);

  useEffect(() => {
    void loadInvestigation();
  }, [loadInvestigation]);

  const closeInvestigation = () => {
    setSelectedObjectTypes([]);
    setInvestigation(null);
    setInvestigationError("");
  };

  const topSitesText = useMemo(() => {
    const sites = investigation?.top_sites ?? [];
    if (!sites.length) return "—";
    return sites.map((site) => `${site.site_id} (${Number(site.equipment_count).toLocaleString()})`).join(" · ");
  }, [investigation]);

  return (
    <PageShell title={t(language, "page_stats_title")} subtitle={t(language, "subtitle_stats")}>
      <MultiBarChart data={rows} xKey="object_type" bars={[{ key: "total_equipment", color: "#dc2626" }]} />
      <DataTable
        rows={rows}
        rowSelection={{
          rowKey: "object_type",
          selectedKeys: selectedObjectTypes,
          onToggle: (rowKey, checked) => {
            if (!rowKey) return;
            setSelectedObjectTypes(checked ? [rowKey] : []);
          },
          headerLabel: isFr ? "Enquête" : "Investigate",
        }}
      />

      <InvestigationPanel
        open={Boolean(selectedObjectType)}
        onClose={closeInvestigation}
        eyebrow={t(language, "investigation_eyebrow")}
        title={t(language, "stats_investigation_title")}
        subtitle={`${t(language, "stats_investigation_subtitle")} · ${selectedObjectType}`}
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
              <InvestigationStatCard
                label={t(language, "inventory_object_type")}
                value={String(investigation.object_type ?? selectedObjectType)}
              />
              <InvestigationStatCard
                label={t(language, "kpi_total_equipment")}
                value={Number(investigation.summary?.total_equipment ?? 0).toLocaleString()}
              />
              <InvestigationStatCard
                label={t(language, "stats_share_network")}
                value={`${Number(investigation.summary?.share_pct ?? 0).toFixed(1)}%`}
                tone="info"
              />
              <InvestigationStatCard label={t(language, "kpi_sites")} value={Number(investigation.summary?.sites_count ?? 0).toLocaleString()} />
            </div>

            <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
              <InvestigationStatCard label="Rank" value={`#${investigation.summary?.rank ?? "-"}`} tone="success" />
              <InvestigationStatCard
                label={t(language, "kpi_unique_serials")}
                value={Number(investigation.summary?.unique_serials ?? 0).toLocaleString()}
              />
              <InvestigationStatCard
                label={t(language, "kpi_empty_serials")}
                value={Number(investigation.summary?.empty_serial_equipment ?? 0).toLocaleString()}
                tone="warning"
              />
              <InvestigationStatCard
                label={t(language, "kpi_avg_assets_site")}
                value={Number(investigation.summary?.avg_per_site ?? 0).toLocaleString()}
              />
            </div>

            <InvestigationSection title={t(language, "stats_top_sites")}>
              <p className="text-xs text-slate-700">{topSitesText}</p>
            </InvestigationSection>

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
    </PageShell>
  );
}
