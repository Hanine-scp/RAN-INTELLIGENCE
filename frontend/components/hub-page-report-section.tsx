"use client";

import { StandardPageReportSection } from "@/components/standard-page-report-section";
import { useAppContext } from "@/components/app-provider";
import { buildReportContextBadge, resolveHubPageReportConfig } from "@/lib/page-report-meta";

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
