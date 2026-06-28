"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { StandardPageReportSection } from "@/components/standard-page-report-section";
import { useAppContext } from "@/components/app-provider";
import {
  buildReportContextBadge,
  resolvePageReportConfig,
  shouldShowStandardPageReport,
} from "@/lib/page-report-meta";

export function PageReportSectionByRoute() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { payload, filters } = useAppContext();

  if (!shouldShowStandardPageReport(pathname)) return null;

  const config = resolvePageReportConfig(pathname, searchParams.get("view"), filters.language);
  if (!config) return null;

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
