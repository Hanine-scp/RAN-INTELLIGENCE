"use client";

import { useMemo } from "react";
import { MultiBarChart } from "@/components/charts";
import {
  InvestigationPanel,
  InvestigationSection,
  InvestigationStatCard,
} from "@/components/investigation-panel";
import type { AssistantInsightResponse } from "@/lib/api";
import { DELTA_COLORS } from "@/lib/chart-theme";
import type { DeltaPageReport } from "@/lib/delta-report-data";
import { getDeltaReportKpis, getDeltaReportTables } from "@/lib/delta-report-data";
import { cleanAiReportMessage } from "@/lib/import-report-export";
import { columnLabel, t, type Locale } from "@/lib/i18n";

type DeltaAiReportModalProps = {
  open: boolean;
  onClose: () => void;
  language: Locale;
  loading: boolean;
  error?: string;
  report: DeltaPageReport | null;
  aiInsight: AssistantInsightResponse | null;
  onDownloadPdf: () => void;
  onDownloadText: () => void;
};

const MODAL_TABLE_LIMIT = 150;

function renderRichText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

function AiMarkdownBody({ content }: { content: string }) {
  const blocks = content.split("\n\n");
  return (
    <div className="space-y-3 text-sm leading-relaxed text-slate-700">
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith("## ")) {
          return (
            <h4 key={i} className="border-b border-teal-100 pb-1 text-xs font-bold uppercase tracking-[0.14em] text-teal-800">
              {trimmed.replace(/^##\s*/, "")}
            </h4>
          );
        }
        const lines = trimmed.split("\n");
        if (lines.every((line) => /^[-·*]\s/.test(line))) {
          return (
            <ul key={i} className="list-inside list-disc space-y-1">
              {lines.map((line, j) => (
                <li key={j}>{renderRichText(line.replace(/^[-·*]\s*/, ""))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {renderRichText(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

function ReportTable({
  language,
  title,
  columns,
  rows,
}: {
  language: Locale;
  title: string;
  columns: string[];
  rows: Record<string, unknown>[];
}) {
  const fr = language === "Français";
  if (!rows.length) {
    return <p className="text-xs text-slate-500">{fr ? "Aucune donnée." : "No data."}</p>;
  }

  const visibleRows = rows.slice(0, MODAL_TABLE_LIMIT);

  return (
    <InvestigationSection title={title}>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="max-h-[42vh] overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-teal-50/95 backdrop-blur">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="border-b border-slate-200 px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-600"
                  >
                    {columnLabel(language, col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={index} className="border-b border-slate-100 last:border-0 even:bg-slate-50/70">
                  {columns.map((col) => (
                    <td key={col} className="px-3 py-2.5 text-slate-800">
                      {String(row[col] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-medium text-slate-500">
          {rows.length > MODAL_TABLE_LIMIT
            ? fr
              ? `${visibleRows.length} / ${rows.length} lignes affichées`
              : `${visibleRows.length} / ${rows.length} rows shown`
            : `${rows.length} ${fr ? "lignes" : "rows"}`}
        </p>
      </div>
    </InvestigationSection>
  );
}

export function DeltaAiReportModal({
  open,
  onClose,
  language,
  loading,
  error,
  report,
  aiInsight,
  onDownloadPdf,
  onDownloadText,
}: DeltaAiReportModalProps) {
  const fr = language === "Français";
  const aiMessage = useMemo(() => (aiInsight?.message ? cleanAiReportMessage(aiInsight.message) : ""), [aiInsight?.message]);

  const kpis = report ? getDeltaReportKpis(report, fr) : [];
  const tables = report ? getDeltaReportTables(report, fr) : [];

  return (
    <InvestigationPanel
      open={open}
      onClose={onClose}
      title={t(language, "delta_report_title")}
      subtitle={
        report
          ? `${report.referenceDate} → ${report.comparisonDate}`
          : t(language, "delta_report_generating")
      }
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

          {kpis.length ? (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {kpis.map((kpi) => (
                <InvestigationStatCard key={kpi.label} label={kpi.label} value={kpi.value} />
              ))}
            </div>
          ) : null}

          {report.mode === "ai" && (loading || aiMessage) ? (
            <InvestigationSection
              title={t(language, "delta_report_ai_analysis")}
              className="border-teal-200/80 bg-gradient-to-br from-white to-teal-50/20"
            >
              {loading && !aiMessage ? (
                <p className="text-sm text-slate-500">{t(language, "delta_report_ai_pending")}</p>
              ) : aiMessage ? (
                <AiMarkdownBody content={aiMessage} />
              ) : (
                <p className="text-sm text-slate-500">{t(language, "delta_report_ai_unavailable")}</p>
              )}
              {aiInsight?.ai_model ? (
                <p className="mt-3 text-[10px] text-slate-400">
                  {aiInsight.ai_engine ?? "AI"} · {aiInsight.ai_model}
                </p>
              ) : null}
            </InvestigationSection>
          ) : null}

          <InvestigationSection title={t(language, "delta_report_page_content")}>
            <p className="text-sm text-slate-600">{t(language, "delta_report_page_content_hint")}</p>
          </InvestigationSection>

          <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <InvestigationSection title={fr ? "Comparaison sites (ancien vs nouveau)" : "Sites comparison (before vs after)"}>
              <MultiBarChart
                data={report.sitesComparison.rows}
                xKey="axis"
                height={160}
                framed={false}
                forceDualAxis
                bars={[
                  { key: "ancien", color: DELTA_COLORS.afterLight },
                  { key: "nouveau", color: DELTA_COLORS.after },
                ]}
              />
              <p className="mt-2 text-xs font-semibold text-slate-700">
                Delta: {report.sitesComparison.delta >= 0 ? "+" : ""}
                {report.sitesComparison.delta} ({report.sitesComparison.deltaPct}%)
              </p>
            </InvestigationSection>

            <InvestigationSection title={fr ? "Comparaison équipements (ancien vs nouveau)" : "Equipment comparison (before vs after)"}>
              <MultiBarChart
                data={report.equipmentComparison.rows}
                xKey="axis"
                height={160}
                framed={false}
                forceDualAxis
                bars={[
                  { key: "ancien", color: DELTA_COLORS.before },
                  { key: "nouveau", color: DELTA_COLORS.after },
                ]}
              />
              <p className="mt-2 text-xs font-semibold text-slate-700">
                Delta: {report.equipmentComparison.delta >= 0 ? "+" : ""}
                {report.equipmentComparison.delta} ({report.equipmentComparison.deltaPct}%)
              </p>
            </InvestigationSection>

            <InvestigationSection title={fr ? "Cellules par technologie" : "Cells by technology"}>
              <MultiBarChart
                data={report.cellsComparison.chartRows}
                xKey="cellule"
                height={170}
                framed={false}
                forceDualAxis
                bars={[
                  { key: "ancienne_valeur", color: DELTA_COLORS.ancienne_valeur },
                  { key: "nouvelle_valeur", color: DELTA_COLORS.nouvelle_valeur },
                ]}
              />
            </InvestigationSection>

            <InvestigationSection title={fr ? "Top impacts absolus" : "Top absolute impacts"}>
              <MultiBarChart
                data={report.topImpactChartRows}
                xKey="metrique"
                height={170}
                framed={false}
                bars={[{ key: "impact", color: "#0f766e" }]}
              />
            </InvestigationSection>
          </section>

          {tables.map((table) => (
            <ReportTable
              key={table.title}
              language={language}
              title={table.title}
              columns={table.columns}
              rows={table.rows}
            />
          ))}
        </div>
      ) : null}
    </InvestigationPanel>
  );
}
