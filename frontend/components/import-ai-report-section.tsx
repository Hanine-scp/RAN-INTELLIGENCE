"use client";

import { useCallback, useState } from "react";
import { ImportAiReportModal } from "@/components/import-ai-report-modal";
import { PremiumPageReportBar } from "@/components/premium-page-report-bar";
import { useAppContext } from "@/components/app-provider";
import {
  askAssistantInsight,
  getAiReport,
  getAnomalies,
  type AiReport,
  type AssistantInsightResponse,
} from "@/lib/api";
import { buildReportExportText, openStyledReportPdf } from "@/lib/import-report-export";
import {
  buildSnapshotPayload,
  loadImportReportTableData,
  type ImportReportTableData,
} from "@/lib/import-report-data";
import { t, type Locale } from "@/lib/i18n";

type ReportFocus = "executive" | "risks" | "quality" | "full";

type ImportStats = {
  sites_count: number;
  equipment_count: number;
  xml_count: number;
  processing_seconds: number;
};

type ImportAiReportSectionProps = {
  snapshotDate: string | null;
  importStats?: ImportStats;
};

const FOCUS_OPTIONS: ReportFocus[] = ["executive", "risks", "quality", "full"];

function focusLabel(language: Locale, focus: ReportFocus) {
  const key = {
    executive: "import_report_focus_executive",
    risks: "import_report_focus_risks",
    quality: "import_report_focus_quality",
    full: "import_report_focus_full",
  }[focus] as Parameters<typeof t>[1];
  return t(language, key);
}

function buildAiPrompt(
  fr: boolean,
  focus: ReportFocus,
  snapshotDate: string,
  stats: ImportStats | undefined,
  customNeeds: string,
  report: AiReport,
  tableData: ImportReportTableData | null,
) {
  const focusText = {
    executive: fr ? "synthese executive" : "executive summary",
    risks: fr ? "detection des risques" : "risk detection",
    quality: fr ? "qualite des donnees" : "data quality",
    full: fr ? "rapport complet NOC" : "full NOC report",
  }[focus];

  const metrics = report.metrics;
  const needs = customNeeds.trim() || (fr ? "Analyse standard post-import" : "Standard post-import analysis");
  const typeSummary = tableData?.charts.byType
    .slice(0, 6)
    .map((row) => `${String(row.object_type ?? "?")}:${Number(row.total_equipment ?? 0)}`)
    .join(", ");

  return fr
    ? `Genere le rapport post-import pour le snapshot ${snapshotDate}. Focus: ${focusText}. Besoins: ${needs}. Contexte: ${stats?.sites_count ?? metrics.total_sites ?? 0} sites, ${stats?.equipment_count ?? tableData?.inventoryRows.length ?? metrics.new_equipment ?? 0} equipements, ${tableData?.assetsPivotRows.length ?? 0} codes produit, types: ${typeSummary || "n/a"}, indice risque ${report.risk_index ?? 0}/100. Reponds UNIQUEMENT avec le contenu final du rapport en markdown (sections ##), sans repeter cette consigne.`
    : `Generate the post-import report for snapshot ${snapshotDate}. Focus: ${focusText}. Needs: ${needs}. Context: ${stats?.sites_count ?? metrics.total_sites ?? 0} sites, ${stats?.equipment_count ?? tableData?.inventoryRows.length ?? metrics.new_equipment ?? 0} equipment, ${tableData?.assetsPivotRows.length ?? 0} product codes, types: ${typeSummary || "n/a"}, risk index ${report.risk_index ?? 0}/100. Reply ONLY with the final report content in markdown (## sections), without repeating this instruction.`;
}

export function ImportAiReportSection({ snapshotDate, importStats }: ImportAiReportSectionProps) {
  const { filters } = useAppContext();
  const fr = filters.language === "Français";
  const language = filters.language;

  const [focus, setFocus] = useState<ReportFocus>("full");
  const [customNeeds, setCustomNeeds] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [report, setReport] = useState<AiReport | null>(null);
  const [aiInsight, setAiInsight] = useState<AssistantInsightResponse | null>(null);
  const [severityChart, setSeverityChart] = useState<{ level: string; count: number }[]>([]);
  const [tableData, setTableData] = useState<ImportReportTableData | null>(null);

  const ready = Boolean(snapshotDate);
  const hasAiQuery = customNeeds.trim().length > 0;

  const generate = useCallback(async () => {
    if (!snapshotDate) return;
    setLoading(true);
    setError("");
    setReport(null);
    setAiInsight(null);
    setSeverityChart([]);
    setTableData(null);
    setModalOpen(true);

    const payload = buildSnapshotPayload(filters, snapshotDate);

    try {
      const [structured, anomalies, tables] = await Promise.all([
        getAiReport(payload),
        getAnomalies(payload),
        loadImportReportTableData(filters, snapshotDate),
      ]);
      setReport(structured);
      setSeverityChart(anomalies.severity_chart ?? []);
      setTableData(tables);

      const needsQuery = customNeeds.trim();
      if (needsQuery) {
        try {
          const prompt = buildAiPrompt(fr, focus, snapshotDate, importStats, needsQuery, structured, tables);
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
  }, [customNeeds, filters, focus, fr, importStats, snapshotDate]);

  const downloadPdf = useCallback(() => {
    if (!report || !snapshotDate) return;
    openStyledReportPdf(fr, report, aiInsight, focus, snapshotDate, severityChart, tableData);
  }, [aiInsight, focus, fr, report, severityChart, snapshotDate, tableData]);

  const downloadText = useCallback(() => {
    if (!report || !snapshotDate) return;
    const content = buildReportExportText(fr, report, aiInsight, focus, snapshotDate, tableData);
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ran_import_report_${snapshotDate.replace(/[^\d-]/g, "-")}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }, [aiInsight, focus, fr, report, snapshotDate, tableData]);

  const focusExtra = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        {t(language, "import_report_focus")}
      </span>
      {FOCUS_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setFocus(option)}
          className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
            focus === option
              ? "bg-teal-600 text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-teal-700"
          }`}
        >
          {focusLabel(language, option)}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <PremiumPageReportBar
        title={t(language, "import_report_title")}
        contextBadge={snapshotDate ?? undefined}
        isReady={ready}
        idleMessage={t(language, "import_report_idle")}
        queryId="import-report-query"
        queryLabel={t(language, "delta_report_query_label")}
        queryPlaceholder={t(language, "import_report_needs_placeholder")}
        queryValue={customNeeds}
        onQueryChange={setCustomNeeds}
        loading={loading}
        hasAiQuery={hasAiQuery}
        generatePageLabel={t(language, "import_report_generate")}
        generateAiLabel={t(language, "import_report_generate")}
        generatingLabel={t(language, "import_report_generating")}
        viewLabel={t(language, "import_report_view")}
        onGenerate={() => void generate()}
        onView={() => setModalOpen(true)}
        showViewButton={Boolean(report && !loading)}
        error={error}
        extra={ready ? focusExtra : undefined}
      />

      {snapshotDate ? (
        <ImportAiReportModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          language={language}
          snapshotDate={snapshotDate}
          focus={focus}
          loading={loading}
          error={error}
          report={report}
          aiInsight={aiInsight}
          severityChart={severityChart}
          tableData={tableData}
          importStats={importStats}
          onDownloadPdf={downloadPdf}
          onDownloadText={downloadText}
        />
      ) : null}
    </>
  );
}
