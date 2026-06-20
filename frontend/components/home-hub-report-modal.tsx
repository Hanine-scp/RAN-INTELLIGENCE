"use client";

import { InvestigationPanel } from "@/components/investigation-panel";
import { HomeHubStructuredReportBody } from "@/components/home-hub-structured-report-body";
import type { HomeHubTab } from "@/components/home-data-hub-tabs";
import type { AiReport, AssistantInsightResponse } from "@/lib/api";
import type { HomeHubPageContext } from "@/lib/home-hub-page-report-data";
import { t, type Locale } from "@/lib/i18n";

type HomeHubReportModalProps = {
  open: boolean;
  onClose: () => void;
  language: Locale;
  activeTab: HomeHubTab;
  title: string;
  loading: boolean;
  error?: string;
  report: AiReport | null;
  aiInsight: AssistantInsightResponse | null;
  pageContext: HomeHubPageContext | null;
  onDownloadPdf: () => void;
  onDownloadText: () => void;
};

export function HomeHubReportModal({
  open,
  onClose,
  language,
  title,
  loading,
  error,
  report,
  aiInsight,
  pageContext,
  onDownloadPdf,
  onDownloadText,
}: HomeHubReportModalProps) {
  return (
    <InvestigationPanel
      open={open}
      onClose={onClose}
      title={title}
      subtitle={report ? `${report.period.start} → ${report.period.end}` : t(language, "delta_report_generating")}
      size="xl"
      loading={loading && !report}
      loadingLabel={t(language, "delta_report_generating")}
      error={error}
    >
      {report ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onDownloadPdf}
              className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-teal-700"
            >
              {t(language, "delta_report_download_pdf")}
            </button>
            <button
              type="button"
              onClick={onDownloadText}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-teal-300"
            >
              {t(language, "delta_report_download_txt")}
            </button>
          </div>

          <HomeHubStructuredReportBody
            language={language}
            report={report}
            pageContext={pageContext}
            aiInsight={aiInsight}
          />
        </div>
      ) : null}
    </InvestigationPanel>
  );
}
