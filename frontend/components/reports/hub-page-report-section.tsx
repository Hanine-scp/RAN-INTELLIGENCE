"use client";

import { StandardPageReportSection } from "@/components/reports/standard-page-report-section";
import { useAppContext } from "@/components/providers/app-provider";
import { buildReportContextBadge, resolveHubPageReportConfig } from "@/lib/reports/page-report-meta";

type HubPageReportSectionProps = {
  hub: "insight" | "foresight" | "signals";
  activeTab: string;
};

export function HubPageReportSection({ hub, activeTab }: HubPageReportSectionProps) {
  const { payload, filters } = useAppContext();
  const config = resolveHubPageReportConfig(hub, activeTab, filters.language);
  const contextBadge = buildReportContextBadge(
    config.viewLabel,
    payload.effective_dates,
    payload.selected_dates,
  );

  return (
    <StandardPageReportSection
      scopeId={config.scopeId}
      title={config.title}
      contextBadge={contextBadge}
    />
  );
}
