"use client";

import { useMemo } from "react";
import { MultiBarChart } from "@/components/charts/charts";
import {
  InvestigationPanel,
  InvestigationSection,
  InvestigationStatCard,
} from "@/components/ui/investigation-panel";
import type { AssistantInsightResponse } from "@/lib/api";
import { DELTA_COLORS, CHART_PRIMARY, CHART_PRO } from "@/lib/chart-theme";
import type { DeltaPageReport } from "@/lib/reports/delta-report-data";
import { buildDeltaLocalAiMarkdown, getDeltaReportKpis, getDeltaReportTables } from "@/lib/reports/delta-report-data";
import { cleanAiReportMessage } from "@/lib/reports/import-report-export";
import { columnLabel, t, type Locale } from "@/lib/i18n";

type DeltaAiReportModalProps = {
  open: boolean;
  onClose: () => void;
  language: Locale;
  loading: boolean;
  error?: string;
  report: DeltaPageReport | null;
  aiInsight: AssistantInsightResponse | null;
  nocQuery?: string;
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
    <div className="space-y-4 text-sm leading-relaxed text-[#475569]">
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith("## ")) {
          return (
            <h4
              key={i}
              className="border-b border-[#E8EDF2] pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#64748B]"
            >
              {trimmed.replace(/^##\s*/, "")}
            </h4>
          );
        }
        const lines = trimmed.split("\n");
        if (lines.every((line) => /^[-·*]\s/.test(line))) {
          return (
            <ul key={i} className="space-y-1.5">
              {lines.map((line, j) => (
                <li key={j} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#64748B]" />
                  <span>{renderRichText(line.replace(/^[-·*]\s*/, ""))}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap text-[#2C3E50]">
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
  nocQuery = "",
  onDownloadPdf,
  onDownloadText,
}: DeltaAiReportModalProps) {
  const fr = language === "Français";
  const aiInsightMessage = aiInsight?.message;
  const aiMessage = useMemo(() => {
    const cleaned = aiInsightMessage ? cleanAiReportMessage(aiInsightMessage) : "";
    if (cleaned) return cleaned;
    if (report?.mode === "ai") return buildDeltaLocalAiMarkdown(fr, report, nocQuery);
    return "";
  }, [aiInsightMessage, fr, nocQuery, report]);

  const kpis = report ? getDeltaReportKpis(report, fr) : [];
  const tables = report ? getDeltaReportTables(report, fr) : [];
  const showAiBlock = report?.mode === "ai" && (loading || aiMessage);

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
              className="rounded-lg px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:brightness-95"
              style={{ background: CHART_PRIMARY }}
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
                  { key: "ancien", color: DELTA_COLORS.before },
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
                bars={[{ key: "impact", color: CHART_PRIMARY }]}
              />
            </InvestigationSection>
          </section>

          {showAiBlock ? (
            <InvestigationSection title={t(language, "delta_report_ai_analysis")}>
              <div className={`${CHART_PRO.card} space-y-4`}>
                {nocQuery.trim() ? (
                  <p className={`${CHART_PRO.cardTitle} normal-case tracking-normal text-[#64748B]`}>
                    {fr ? "Requête NOC" : "NOC query"} ·{" "}
                    <span className="font-medium normal-case text-[#2C3E50]">{nocQuery.trim()}</span>
                  </p>
                ) : null}
                {loading && !aiMessage ? (
                  <p className="text-sm text-[#94A3B8]">{t(language, "delta_report_ai_pending")}</p>
                ) : aiMessage ? (
                  <AiMarkdownBody content={aiMessage} />
                ) : (
                  <p className="text-sm text-[#94A3B8]">{t(language, "delta_report_ai_unavailable")}</p>
                )}
                {aiInsight?.ai_model ? (
                  <p className="text-[10px] text-[#94A3B8]">
                    {aiInsight.ai_engine ?? "AI"} · {aiInsight.ai_model}
                  </p>
                ) : null}
              </div>
            </InvestigationSection>
          ) : null}

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
