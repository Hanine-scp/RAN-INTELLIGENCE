"use client";

import { useMemo } from "react";
import { MultiBarChart } from "@/components/charts";
import {
  InvestigationPanel,
  InvestigationSection,
  InvestigationStatCard,
} from "@/components/investigation-panel";
import type { AssistantInsightResponse } from "@/lib/api";
import { CHART_PRIMARY, SEVERITY_COLORS } from "@/lib/chart-theme";
import type { GuardianPageReport } from "@/lib/guardian-report-data";
import { getTabReportKpis, getTabReportTables, tabViewLabel } from "@/lib/guardian-report-data";
import { cleanAiReportMessage } from "@/lib/import-report-export";
import { columnLabel, t, type Locale } from "@/lib/i18n";

type GuardianAiReportModalProps = {
  open: boolean;
  onClose: () => void;
  language: Locale;
  loading: boolean;
  error?: string;
  report: GuardianPageReport | null;
  aiInsight: AssistantInsightResponse | null;
  onDownloadPdf: () => void;
  onDownloadText: () => void;
};

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
            <h4 key={i} className="border-b border-red-100 pb-1 text-xs font-bold uppercase tracking-[0.14em] text-red-800">
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

  return (
    <InvestigationSection title={title}>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-slate-100">
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
            {rows.map((row, index) => (
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
        <p className="border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-medium text-slate-500">
          {rows.length} {fr ? "lignes" : "rows"}
        </p>
      </div>
    </InvestigationSection>
  );
}

export function GuardianAiReportModal({
  open,
  onClose,
  language,
  loading,
  error,
  report,
  aiInsight,
  onDownloadPdf,
  onDownloadText,
}: GuardianAiReportModalProps) {
  const fr = language === "Français";
  const aiMessage = useMemo(() => (aiInsight?.message ? cleanAiReportMessage(aiInsight.message) : ""), [aiInsight?.message]);

  const viewLabel = report ? tabViewLabel(report.activeView, fr) : "—";
  const kpis = report ? getTabReportKpis(report, fr) : [];
  const tables = report ? getTabReportTables(report) : [];

  const severityBars = useMemo(
    () =>
      report?.activeView === "anomalies" && report.nocAnomalies
        ? (report.nocAnomalies.severity_chart ?? []).map((row) => ({
            level: String(row.level),
            count: Number(row.count ?? 0),
          }))
        : [],
    [report],
  );

  const maxSeverity = Math.max(1, ...severityBars.map((row) => row.count));

  const severityColor = (level: string) => {
    const key = level.toLowerCase();
    if (key.includes("crit")) return SEVERITY_COLORS.Critical;
    if (key.includes("high")) return SEVERITY_COLORS.High;
    if (key.includes("med")) return SEVERITY_COLORS.Medium;
    return SEVERITY_COLORS.Low;
  };

  const modeBadge =
    report?.mode === "ai" ? t(language, "guardian_report_badge_ai") : t(language, "guardian_report_badge_page");

  return (
    <InvestigationPanel
      open={open}
      onClose={onClose}
      title={t(language, "guardian_report_title")}
      subtitle={report ? `${report.snapshotDate ?? "—"} · ${viewLabel}` : t(language, "guardian_report_generating")}
      size="xl"
      loading={loading && !report}
      loadingLabel={t(language, "guardian_report_generating")}
      error={error}
      badge={
        report ? (
          <span className="rounded-full bg-red-600 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
            {modeBadge}
          </span>
        ) : null
      }
    >
      {report ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onDownloadPdf}
              className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-red-700"
            >
              {t(language, "guardian_report_download_pdf")}
            </button>
            <button
              type="button"
              onClick={onDownloadText}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
            >
              {t(language, "guardian_report_download_txt")}
            </button>
          </div>

          {kpis.length ? (
            <div className={`grid grid-cols-2 gap-2 ${kpis.length >= 5 ? "md:grid-cols-5" : "md:grid-cols-4"}`}>
              {kpis.map((kpi) => (
                <InvestigationStatCard key={kpi.label} label={kpi.label} value={kpi.value} />
              ))}
            </div>
          ) : null}

          {report.mode === "page" ? (
            <>
              <InvestigationSection title={t(language, "guardian_report_page_content")}>
                <p className="text-sm text-slate-600">{t(language, "guardian_report_page_content_hint")}</p>
              </InvestigationSection>

              {report.activeView === "anomalies" && severityBars.length ? (
                <InvestigationSection title={t(language, "guardian_hub_tab_noc_alerts")}>
                  <div className="space-y-2">
                    {severityBars.map((row) => (
                      <div key={row.level} className="flex items-center gap-3">
                        <span className="w-20 text-xs font-semibold text-slate-600">{row.level}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.max(8, (row.count / maxSeverity) * 100)}%`,
                              backgroundColor: severityColor(row.level),
                            }}
                          />
                        </div>
                        <span className="w-8 text-right text-xs font-bold text-slate-800">{row.count}</span>
                      </div>
                    ))}
                  </div>
                </InvestigationSection>
              ) : null}

              {report.activeView === "guardian" && (report.guardianAnomalies?.length ?? 0) > 0 ? (
                <InvestigationSection title={t(language, "guardian_anomalies_title")}>
                  <MultiBarChart
                    data={(report.guardianAnomalies ?? []).slice(0, 8).map((row) => ({
                      anomaly_type: String(row.anomaly_type ?? row.entity_id ?? "?"),
                      score: Number(row.anomaly_score ?? 1),
                    }))}
                    xKey="anomaly_type"
                    bars={[{ key: "score", color: CHART_PRIMARY }]}
                    height={180}
                    framed={false}
                  />
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
            </>
          ) : (
            <InvestigationSection
              title={t(language, "guardian_report_ai_analysis")}
              className="border-red-200/80 bg-gradient-to-br from-white to-red-50/20"
            >
              {loading && !aiMessage ? (
                <p className="text-sm text-slate-500">{t(language, "guardian_report_ai_pending")}</p>
              ) : aiMessage ? (
                <AiMarkdownBody content={aiMessage} />
              ) : (
                <p className="text-sm text-slate-500">{t(language, "guardian_report_ai_unavailable")}</p>
              )}
              {aiInsight?.ai_model ? (
                <p className="mt-3 text-[10px] text-slate-400">
                  {aiInsight.ai_engine ?? "AI"} · {aiInsight.ai_model}
                </p>
              ) : null}
            </InvestigationSection>
          )}
        </div>
      ) : null}
    </InvestigationPanel>
  );
}
