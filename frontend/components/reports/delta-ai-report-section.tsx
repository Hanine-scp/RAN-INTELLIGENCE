"use client";

import { useCallback, useEffect, useState } from "react";
import { DeltaAiReportModal } from "@/components/reports/delta-ai-report-modal";
import { PremiumPageReportBar } from "@/components/ui/premium-page-report-bar";
import { useAppContext } from "@/components/providers/app-provider";
import { askAssistantInsight, type AssistantInsightResponse } from "@/lib/api";
import {
  buildDeltaAiPrompt,
  buildDeltaLocalAiMarkdown,
  buildDeltaPageReport,
  type DeltaComparePayload,
  type DeltaPageReport,
} from "@/lib/reports/delta-report-data";
import { buildDeltaReportExportText, openDeltaReportPdf } from "@/lib/reports/delta-report-export";
import { cleanAiReportMessage } from "@/lib/reports/import-report-export";
import { t } from "@/lib/i18n";

type DeltaAiReportSectionProps = {
  referenceDate: string;
  comparisonDate: string;
  isReady: boolean;
  compare: DeltaComparePayload;
};

export function DeltaAiReportSection({
  referenceDate,
  comparisonDate,
  isReady,
  compare,
}: DeltaAiReportSectionProps) {
  const { payload, filters } = useAppContext();
  const fr = filters.language === "Français";
  const language = filters.language;

  const [customNeeds, setCustomNeeds] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [report, setReport] = useState<DeltaPageReport | null>(null);
  const [aiInsight, setAiInsight] = useState<AssistantInsightResponse | null>(null);

  const hasAiQuery = customNeeds.trim().length > 0;

  useEffect(() => {
    setReport(null);
    setAiInsight(null);
    setError("");
    setModalOpen(false);
  }, [referenceDate, comparisonDate]);

  const generate = useCallback(async () => {
    if (!isReady) return;

    setLoading(true);
    setError("");
    setReport(null);
    setAiInsight(null);
    setModalOpen(true);

    try {
      const mode = hasAiQuery ? "ai" : "page";
      const nextReport = buildDeltaPageReport(compare, referenceDate, comparisonDate, mode);
      setReport(nextReport);

      if (hasAiQuery) {
        try {
          const prompt = buildDeltaAiPrompt(fr, customNeeds, nextReport);
          const insight = await askAssistantInsight(
            { ...payload, compare_date_1: referenceDate, compare_date_2: comparisonDate } as typeof payload,
            prompt,
          );
          const cleaned = insight.message ? cleanAiReportMessage(insight.message) : "";
          setAiInsight({
            ...insight,
            message: cleaned || buildDeltaLocalAiMarkdown(fr, nextReport, customNeeds),
          });
        } catch {
          setAiInsight({
            message: buildDeltaLocalAiMarkdown(fr, nextReport, customNeeds),
            intent: "expert_report",
            rows: [],
            details: [],
            sources: [],
            suggested_questions: [],
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delta report failed.");
    } finally {
      setLoading(false);
    }
  }, [compare, comparisonDate, customNeeds, fr, hasAiQuery, isReady, payload, referenceDate]);

  const downloadPdf = useCallback(() => {
    if (!report) return;
    openDeltaReportPdf(fr, report, aiInsight);
  }, [aiInsight, fr, report]);

  const downloadText = useCallback(() => {
    if (!report) return;
    const content = buildDeltaReportExportText(fr, report, aiInsight);
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `delta_report_${referenceDate}_vs_${comparisonDate}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }, [aiInsight, comparisonDate, fr, referenceDate, report]);

  return (
    <>
      <PremiumPageReportBar
        title={t(language, "delta_report_title")}
        contextBadge={`${referenceDate} → ${comparisonDate}`}
        isReady={isReady}
        idleMessage={t(language, "delta_report_idle")}
        queryId="delta-report-query"
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

      <DeltaAiReportModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        language={language}
        loading={loading}
        error={error}
        report={report}
        aiInsight={aiInsight}
        nocQuery={customNeeds}
        onDownloadPdf={downloadPdf}
        onDownloadText={downloadText}
      />
    </>
  );
}
