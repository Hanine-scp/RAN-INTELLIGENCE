"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HomeHubReportModal } from "@/components/reports/home-hub-report-modal";
import { PremiumPageReportBar } from "@/components/ui/premium-page-report-bar";
import type { HomeHubTab } from "@/components/features/home/home-data-hub-tabs";
import { useAppContext } from "@/components/providers/app-provider";
import { askAssistantInsight, getAiReport, type AiReport, type AssistantInsightResponse } from "@/lib/api";
import { buildHomeHubReportExportText, openHomeHubReportPdf } from "@/lib/reports/home-hub-report-export";
import { loadHomeHubPageContext, type HomeHubPageContext } from "@/lib/reports/home-hub-page-report-data";
import { t } from "@/lib/i18n";

const TAB_TITLE_KEY: Record<HomeHubTab, "home_report_title_sites" | "home_report_title_inventaire" | "home_report_title_assets" | "home_report_title_compteurs"> = {
  sites: "home_report_title_sites",
  inventaire: "home_report_title_inventaire",
  assets: "home_report_title_assets",
  compteurs: "home_report_title_compteurs",
};

type HomeHubReportSectionProps = {
  activeTab: HomeHubTab;
  uniqueSerialOnly?: boolean;
};

export function HomeHubReportSection({ activeTab, uniqueSerialOnly = false }: HomeHubReportSectionProps) {
  const { payload, filters } = useAppContext();
  const fr = filters.language === "Français";
  const language = filters.language;

  const [customNeeds, setCustomNeeds] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [report, setReport] = useState<AiReport | null>(null);
  const [aiInsight, setAiInsight] = useState<AssistantInsightResponse | null>(null);
  const [pageContext, setPageContext] = useState<HomeHubPageContext | null>(null);

  const hasDates = payload.effective_dates.length > 0 || payload.selected_dates.length > 0;
  const hasAiQuery = customNeeds.trim().length > 0;

  const contextBadge = useMemo(() => {
    const dates = payload.effective_dates.length ? payload.effective_dates : payload.selected_dates;
    if (!dates.length) return "";
    if (dates.length === 1) return dates[0];
    const sorted = [...dates].sort();
    return `${sorted[0]} → ${sorted[sorted.length - 1]}`;
  }, [payload.effective_dates, payload.selected_dates]);

  useEffect(() => {
    setReport(null);
    setAiInsight(null);
    setPageContext(null);
    setError("");
    setModalOpen(false);
    setCustomNeeds("");
  }, [activeTab]);

  const generate = useCallback(async () => {
    if (!hasDates) return;

    setLoading(true);
    setError("");
    setReport(null);
    setAiInsight(null);
    setPageContext(null);
    setModalOpen(true);

    try {
      const [structured, context] = await Promise.all([
        getAiReport(payload),
        loadHomeHubPageContext(activeTab, payload, uniqueSerialOnly).catch(() => null),
      ]);
      setReport(structured);
      setPageContext(context);

      if (hasAiQuery) {
        const tabTitle = t(language, TAB_TITLE_KEY[activeTab]);
        const prompt = fr
          ? `Genere un rapport expert pour la vue « ${tabTitle} ». Requete: ${customNeeds.trim()}. Periode ${structured.period.start} → ${structured.period.end}. Reponds en markdown (sections ##), concis et decisionnel.`
          : `Generate an expert report for the « ${tabTitle} » view. Query: ${customNeeds.trim()}. Period ${structured.period.start} → ${structured.period.end}. Reply in markdown (## sections), concise and decision-oriented.`;
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
  }, [activeTab, customNeeds, fr, hasAiQuery, hasDates, language, payload, uniqueSerialOnly]);

  const reportTitle = t(language, TAB_TITLE_KEY[activeTab]);

  const downloadPdf = useCallback(() => {
    if (!report) return;
    openHomeHubReportPdf(fr, reportTitle, report, aiInsight, pageContext);
  }, [aiInsight, fr, pageContext, report, reportTitle]);

  const downloadText = useCallback(() => {
    if (!report) return;
    const content = buildHomeHubReportExportText(fr, reportTitle, report, aiInsight, pageContext);
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `home_${activeTab}_${report.period.start}_${report.period.end}.txt`.replace(/[^\w.-]/g, "-");
    link.click();
    URL.revokeObjectURL(url);
  }, [activeTab, aiInsight, fr, pageContext, report, reportTitle]);

  return (
    <>
      <PremiumPageReportBar
        title={t(language, TAB_TITLE_KEY[activeTab])}
        contextBadge={contextBadge}
        isReady={hasDates}
        idleMessage={t(language, "home_report_idle")}
        queryId={`home-report-query-${activeTab}`}
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
        activeTab={activeTab}
        title={reportTitle}
        loading={loading}
        error={error}
        report={report}
        aiInsight={aiInsight}
        pageContext={pageContext}
        onDownloadPdf={downloadPdf}
        onDownloadText={downloadText}
      />
    </>
  );
}
