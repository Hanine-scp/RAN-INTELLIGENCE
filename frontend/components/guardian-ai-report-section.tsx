"use client";

import { useCallback, useEffect, useState } from "react";
import { GuardianAiReportModal } from "@/components/guardian-ai-report-modal";
import { PremiumPageReportBar } from "@/components/premium-page-report-bar";
import type { GuardianHubTab } from "@/components/guardian-data-hub-tabs";
import { useAppContext } from "@/components/app-provider";
import { askAssistantInsight, type AssistantInsightResponse } from "@/lib/api";
import {
  buildGuardianAiPrompt,
  loadGuardianPageReport,
  tabViewLabel,
  type GuardianPageReport,
} from "@/lib/guardian-report-data";
import { buildGuardianReportExportText, openGuardianReportPdf } from "@/lib/guardian-report-export";
import { t } from "@/lib/i18n";

type GuardianAiReportSectionProps = {
  activeTab: GuardianHubTab;
  showEvolutionsPanel?: boolean;
};

export function GuardianAiReportSection({ activeTab, showEvolutionsPanel = false }: GuardianAiReportSectionProps) {
  const { payload, filters } = useAppContext();
  const fr = filters.language === "Français";
  const language = filters.language;

  const [customNeeds, setCustomNeeds] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [report, setReport] = useState<GuardianPageReport | null>(null);
  const [aiInsight, setAiInsight] = useState<AssistantInsightResponse | null>(null);

  const hasDates = payload.effective_dates.length > 0 || payload.selected_dates.length > 0;
  const hasAiQuery = customNeeds.trim().length > 0;
  const viewLabel = tabViewLabel(activeTab, fr);
  const snapshotBadge =
    payload.effective_dates[payload.effective_dates.length - 1] ??
    payload.selected_dates[payload.selected_dates.length - 1] ??
    "";

  useEffect(() => {
    setReport(null);
    setAiInsight(null);
    setError("");
    setModalOpen(false);
  }, [activeTab]);

  const generate = useCallback(async () => {
    if (!hasDates) return;

    setLoading(true);
    setError("");
    setReport(null);
    setAiInsight(null);
    setModalOpen(true);

    try {
      const base = await loadGuardianPageReport(payload, activeTab, showEvolutionsPanel);
      const mode = hasAiQuery ? "ai" : "page";
      const nextReport: GuardianPageReport = { ...base, mode };
      setReport(nextReport);

      if (hasAiQuery) {
        try {
          const prompt = buildGuardianAiPrompt(fr, customNeeds, nextReport);
          const insight = await askAssistantInsight(payload, prompt);
          setAiInsight(insight);
        } catch {
          setAiInsight(null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Guardian report failed.");
    } finally {
      setLoading(false);
    }
  }, [activeTab, customNeeds, fr, hasAiQuery, hasDates, payload, showEvolutionsPanel]);

  const downloadPdf = useCallback(() => {
    if (!report) return;
    openGuardianReportPdf(fr, report, aiInsight);
  }, [aiInsight, fr, report]);

  const downloadText = useCallback(() => {
    if (!report) return;
    const content = buildGuardianReportExportText(fr, report, aiInsight);
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `guardian_${report.activeView}_${(report.snapshotDate ?? "snapshot").replace(/[^\d-]/g, "-")}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }, [aiInsight, fr, report]);

  return (
    <>
      <PremiumPageReportBar
        title={t(language, "guardian_report_title")}
        contextBadge={snapshotBadge ? `${viewLabel} · ${snapshotBadge}` : viewLabel}
        isReady={hasDates}
        idleMessage={t(language, "guardian_report_idle")}
        queryId="guardian-report-query"
        queryLabel={t(language, "guardian_report_query_label")}
        queryPlaceholder={t(language, "guardian_report_needs_placeholder")}
        queryValue={customNeeds}
        onQueryChange={setCustomNeeds}
        loading={loading}
        hasAiQuery={hasAiQuery}
        generatePageLabel={t(language, "guardian_report_generate_page")}
        generateAiLabel={t(language, "guardian_report_generate_ai")}
        generatingLabel={t(language, "guardian_report_generating")}
        viewLabel={t(language, "guardian_report_view")}
        onGenerate={() => void generate()}
        onView={() => setModalOpen(true)}
        showViewButton={Boolean(report && !loading)}
        error={error}
      />

      <GuardianAiReportModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        language={language}
        loading={loading}
        error={error}
        report={report}
        aiInsight={aiInsight}
        onDownloadPdf={downloadPdf}
        onDownloadText={downloadText}
      />
    </>
  );
}
