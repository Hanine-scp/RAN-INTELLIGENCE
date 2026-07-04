"use client";

import { useCallback, useEffect, useState } from "react";
import { HomeHubReportModal } from "@/components/reports/home-hub-report-modal";
import { PremiumPageReportBar } from "@/components/ui/premium-page-report-bar";
import { useAppContext } from "@/components/providers/app-provider";
import { askAssistantInsight, getAiReport, type AiReport, type AssistantInsightResponse } from "@/lib/api";
import { buildHomeHubReportExportText, openHomeHubReportPdf } from "@/lib/reports/home-hub-report-export";
import { t } from "@/lib/i18n";

type StandardPageReportSectionProps = {
  scopeId: string;
  title: string;
  contextBadge: string;
};

export function StandardPageReportSection({ scopeId, title, contextBadge }: StandardPageReportSectionProps) {
  const { payload, filters } = useAppContext();
  const fr = filters.language === "Français";
  const language = filters.language;

  const [customNeeds, setCustomNeeds] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [report, setReport] = useState<AiReport | null>(null);
  const [aiInsight, setAiInsight] = useState<AssistantInsightResponse | null>(null);

  const hasDates = payload.effective_dates.length > 0 || payload.selected_dates.length > 0;
  const hasAiQuery = customNeeds.trim().length > 0;

  useEffect(() => {
    setReport(null);
    setAiInsight(null);
    setError("");
    setModalOpen(false);
    setCustomNeeds("");
  }, [scopeId]);

  const generate = useCallback(async () => {
    if (!hasDates) return;

    setLoading(true);
    setError("");
    setReport(null);
    setAiInsight(null);
    setModalOpen(true);

    try {
      const structured = await getAiReport(payload);
      setReport(structured);

      if (hasAiQuery) {
        const prompt = fr
          ? `Genere un rapport expert pour « ${title} ». Requete: ${customNeeds.trim()}. Periode ${structured.period.start} → ${structured.period.end}. Reponds en markdown (sections ##), concis et decisionnel.`
          : `Generate an expert report for « ${title} ». Query: ${customNeeds.trim()}. Period ${structured.period.start} → ${structured.period.end}. Reply in markdown (## sections), concise and decision-oriented.`;
        try {
          const insight = await askAssistantInsight(payload, prompt);
          setAiInsight(insight);
        } catch {
          setAiInsight(null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report generation failed.");
    } finally {
      setLoading(false);
    }
  }, [customNeeds, fr, hasAiQuery, hasDates, payload, title]);

  const downloadPdf = useCallback(() => {
    if (!report) return;
    openHomeHubReportPdf(fr, title, report, aiInsight, null);
  }, [aiInsight, fr, report, title]);

  const downloadText = useCallback(() => {
    if (!report) return;
    const content = buildHomeHubReportExportText(fr, title, report, aiInsight, null);
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${scopeId}_${report.period.start}_${report.period.end}.txt`.replace(/[^\w.-]/g, "-");
    link.click();
    URL.revokeObjectURL(url);
  }, [aiInsight, fr, report, scopeId, title]);

  return (
    <>
      <PremiumPageReportBar
        title={title}
        contextBadge={contextBadge}
        isReady={hasDates}
        idleMessage={t(language, "home_report_idle")}
        queryId={`page-report-query-${scopeId}`}
        queryLabel={t(language, "delta_report_query_label")}
        queryPlaceholder={t(language, "delta_report_needs_placeholder")}
        queryValue={customNeeds}
        onQueryChange={setCustomNeeds}
        loading={loading}
        hasAiQuery={hasAiQuery}
        generatePageLabel={t(language, "delta_report_generate_page")}
        generateAiLabel={t(language, "delta_report_generate_ai")}
        generatingLabel={t(language, "delta_report_generating")}
        viewLabel={t(language, "delta_report_view")}
        onGenerate={() => void generate()}
        onView={() => setModalOpen(true)}
        showViewButton={Boolean(report && !loading)}
        error={error}
      />

      <HomeHubReportModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        language={language}
        activeTab="sites"
        title={title}
        loading={loading}
        error={error}
        report={report}
        aiInsight={aiInsight}
        pageContext={null}
        onDownloadPdf={downloadPdf}
        onDownloadText={downloadText}
      />
    </>
  );
}
