"use client";

import { useMemo } from "react";
import { MultiBarChart } from "@/components/charts";
import {
  InvestigationPanel,
  InvestigationSection,
  InvestigationStatCard,
} from "@/components/investigation-panel";
import type { AiReport, AssistantInsightResponse } from "@/lib/api";
import { CHART_PRIMARY, CHART_SECONDARY, CHART_TERTIARY, SEVERITY_COLORS } from "@/lib/chart-theme";
import { cleanAiReportMessage } from "@/lib/import-report-export";
import { buildEquipmentCounterRows, type ImportReportTableData } from "@/lib/import-report-data";
import { columnLabel, t, type Locale } from "@/lib/i18n";

type ReportFocus = "executive" | "risks" | "quality" | "full";

type ImportStats = {
  sites_count: number;
  equipment_count: number;
  xml_count: number;
  processing_seconds: number;
};

type ImportAiReportModalProps = {
  open: boolean;
  onClose: () => void;
  language: Locale;
  snapshotDate: string;
  focus: ReportFocus;
  loading: boolean;
  error?: string;
  report: AiReport | null;
  aiInsight: AssistantInsightResponse | null;
  severityChart: { level: string; count: number }[];
  tableData: ImportReportTableData | null;
  importStats?: ImportStats;
  onDownloadPdf: () => void;
  onDownloadText: () => void;
};

function focusLabel(language: Locale, focus: ReportFocus) {
  const key = {
    executive: "import_report_focus_executive",
    risks: "import_report_focus_risks",
    quality: "import_report_focus_quality",
    full: "import_report_focus_full",
  }[focus] as Parameters<typeof t>[1];
  return t(language, key);
}

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

function severityStyles(severity: string) {
  const level = severity.toLowerCase();
  if (level === "critical" || level === "critique") return "border-red-200 bg-red-50 text-red-900";
  if (level === "high" || level === "eleve" || level === "élevé") return "border-orange-200 bg-orange-50 text-orange-900";
  if (level === "medium" || level === "moyen") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function priorityStyles(priority: string) {
  if (priority === "P1") return "bg-red-600 text-white";
  if (priority === "P2") return "bg-orange-500 text-white";
  return "bg-teal-600 text-white";
}

function riskIndexColor(score: number) {
  if (score >= 70) return "text-red-600";
  if (score >= 40) return "text-orange-600";
  return "text-teal-600";
}

function riskIndexRing(score: number) {
  if (score >= 70) return "stroke-red-500";
  if (score >= 40) return "stroke-orange-500";
  return "stroke-teal-500";
}

type StaticColumn = { key: string; label: string };

function ReportStaticTable({
  columns,
  rows,
  fr,
  showFooter = true,
}: {
  columns: StaticColumn[];
  rows: Record<string, unknown>[];
  fr: boolean;
  showFooter?: boolean;
}) {
  if (!rows.length) {
    return <p className="text-xs text-slate-500">{fr ? "Aucune donnée." : "No data."}</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-xs">
        <thead className="bg-slate-100">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="border-b border-slate-200 px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-600"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-slate-100 last:border-0 even:bg-slate-50/70">
              {columns.map((col) => (
                <td key={col.key} className="px-3 py-2.5 text-slate-800">
                  {String(row[col.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {showFooter ? (
        <p className="border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-medium text-slate-500">
          {rows.length} {fr ? "lignes" : "rows"}
        </p>
      ) : null}
    </div>
  );
}

function columnsFor(language: Locale, keys: string[]): StaticColumn[] {
  return keys.map((key) => ({ key, label: columnLabel(language, key) }));
}

export function ImportAiReportModal({
  open,
  onClose,
  language,
  snapshotDate,
  focus,
  loading,
  error,
  report,
  aiInsight,
  severityChart,
  tableData,
  importStats,
  onDownloadPdf,
  onDownloadText,
}: ImportAiReportModalProps) {
  const fr = language === "Français";
  const lang = fr ? "fr" : "en";
  const aiMessage = useMemo(() => (aiInsight?.message ? cleanAiReportMessage(aiInsight.message) : ""), [aiInsight?.message]);

  const riskScore = report?.risk_index ?? 0;
  const decisions = report?.decisions ?? [];
  const findings = report?.critical_findings ?? [];
  const topRisks = report?.top_risks ?? [];
  const metrics = report?.metrics ?? {};

  const severityBars = useMemo(
    () =>
      severityChart.map((row) => ({
        level: String(row.level),
        count: Number(row.count ?? 0),
      })),
    [severityChart],
  );

  const maxSeverity = Math.max(1, ...severityBars.map((row) => row.count));

  const siteRiskChart = useMemo(
    () =>
      topRisks.slice(0, 8).map((row) => ({
        site_id: String(row.site_id ?? "?"),
        anomalies: Number(row.anomalies ?? 0),
      })),
    [topRisks],
  );

  const severityColor = (level: string) => {
    const key = level.toLowerCase();
    if (key.includes("crit")) return SEVERITY_COLORS.Critical;
    if (key.includes("high")) return SEVERITY_COLORS.High;
    if (key.includes("med")) return SEVERITY_COLORS.Medium;
    return SEVERITY_COLORS.Low;
  };

  const assetsChartData = useMemo(
    () =>
      (tableData?.assetsPivotRows ?? []).slice(0, 7).map((row) => ({
        product_code: String(row.product_code ?? ""),
        serial_count: Number(row.serial_count ?? 0),
      })),
    [tableData?.assetsPivotRows],
  );

  const equipmentCounterRows = useMemo(
    () => buildEquipmentCounterRows(tableData?.inventoryRows ?? [], 7),
    [tableData?.inventoryRows],
  );

  const typeChartData = useMemo(
    () => (tableData?.charts.byType ?? []).slice(0, 7),
    [tableData?.charts.byType],
  );

  const siteChartData = useMemo(
    () =>
      (tableData?.sitesRows ?? []).slice(0, 7).map((row) => ({
        site_name: String(row.site_name ?? row.site_id ?? "?"),
        nb_cells: Number(row.nb_cells ?? 0),
      })),
    [tableData?.sitesRows],
  );

  const sitesCount = tableData?.sitesRows.length ?? importStats?.sites_count ?? metrics.total_sites ?? 0;
  const equipmentCount = tableData?.inventoryRows.length ?? importStats?.equipment_count ?? 0;

  return (
    <InvestigationPanel
      open={open}
      onClose={onClose}
      title={t(language, "import_report_title")}
      subtitle={`${snapshotDate} · ${focusLabel(language, focus)}`}
      size="xl"
      loading={loading && !report}
      loadingLabel={t(language, "import_report_generating")}
      error={error}
      badge={
        report ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDownloadPdf}
              className="rounded-lg bg-teal-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-teal-700"
            >
              {t(language, "import_report_download_pdf")}
            </button>
            <button
              type="button"
              onClick={onDownloadText}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              {t(language, "import_report_download")}
            </button>
          </div>
        ) : null
      }
    >
      {report ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
            <InvestigationStatCard label={fr ? "XML" : "XML"} value={importStats?.xml_count ?? 0} tone="neutral" />
            <InvestigationStatCard label={fr ? "Sites" : "Sites"} value={sitesCount} tone="info" />
            <InvestigationStatCard label={fr ? "Equipements" : "Equipment"} value={equipmentCount} tone="info" />
            <InvestigationStatCard label={fr ? "Alertes" : "Alerts"} value={metrics.anomalies_total ?? 0} tone="warning" />
            <InvestigationStatCard label={fr ? "Critiques" : "Critical"} value={metrics.anomalies_critical ?? 0} tone="danger" />
            <InvestigationStatCard
              label={t(language, "import_report_risk_index")}
              value={`${riskScore}/100`}
              tone={riskScore >= 70 ? "danger" : riskScore >= 40 ? "warning" : "success"}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
            <InvestigationSection title={fr ? "Resume executif" : "Executive summary"} className="xl:col-span-8">
              <p className="text-sm leading-relaxed text-slate-700">{report.executive[lang]}</p>
              <p className="mt-2 text-[10px] text-slate-400">
                {fr ? "Genere" : "Generated"}: {report.generated_at}
              </p>
            </InvestigationSection>

            <InvestigationSection title={t(language, "import_report_risk_index")} className="xl:col-span-4">
              <div className="flex flex-col items-center py-2">
                <div className="relative flex h-24 w-24 items-center justify-center">
                  <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.5"
                      fill="none"
                      className={riskIndexRing(riskScore)}
                      strokeWidth="3"
                      strokeDasharray={`${riskScore} 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className={`absolute text-xl font-extrabold ${riskIndexColor(riskScore)}`}>{riskScore}</span>
                </div>
              </div>
            </InvestigationSection>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {severityBars.length ? (
              <InvestigationSection title={fr ? "Repartition des alertes" : "Alert distribution"}>
                <div className="space-y-2 py-1">
                  {severityBars.map((row) => (
                    <div key={row.level} className="flex items-center gap-2 text-xs">
                      <span className="w-16 shrink-0 font-semibold uppercase text-slate-600">{row.level}</span>
                      <div className="h-4 flex-1 overflow-hidden rounded-md bg-slate-100">
                        <div
                          className="h-full rounded-md transition-all"
                          style={{
                            width: `${Math.max(6, (row.count / maxSeverity) * 100)}%`,
                            backgroundColor: severityColor(row.level),
                          }}
                        />
                      </div>
                      <span className="w-8 text-right font-bold text-slate-700">{row.count}</span>
                    </div>
                  ))}
                </div>
              </InvestigationSection>
            ) : null}

            {siteRiskChart.length ? (
              <InvestigationSection title={fr ? "Sites a risque" : "At-risk sites"}>
                <MultiBarChart
                  data={siteRiskChart}
                  xKey="site_id"
                  bars={[{ key: "anomalies", color: CHART_SECONDARY }]}
                  height={200}
                  framed
                />
              </InvestigationSection>
            ) : null}
          </div>

          {findings.length ? (
            <InvestigationSection title={t(language, "import_report_critical")}>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {findings.map((item, index) => (
                  <div key={`${item.severity}-${index}`} className={`rounded-lg border px-3 py-2 text-xs ${severityStyles(item.severity)}`}>
                    <span className="mr-2 inline-flex rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-bold uppercase">{item.severity}</span>
                    {item[lang]}
                  </div>
                ))}
              </div>
            </InvestigationSection>
          ) : null}

          {decisions.length ? (
            <InvestigationSection title={t(language, "import_report_decisions")}>
              <ol className="space-y-2">
                {decisions.map((item, index) => (
                  <li key={`${item.priority}-${index}`} className="flex items-start gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[9px] font-bold ${priorityStyles(item.priority)}`}>
                      {item.priority}
                    </span>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{item.category}</p>
                      <p className="text-xs text-slate-800">{item[lang]}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </InvestigationSection>
          ) : null}

          {aiMessage ? (
            <InvestigationSection title={t(language, "import_report_ai_analysis")}>
              {aiInsight?.ai_engine ? (
                <p className="mb-2 text-[10px] uppercase tracking-wide text-teal-700">
                  {aiInsight.ai_engine}
                  {aiInsight.ai_model ? ` · ${aiInsight.ai_model}` : ""}
                </p>
              ) : null}
              <AiMarkdownBody content={aiMessage} />
            </InvestigationSection>
          ) : null}

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {report.sections.map((section) => (
              <InvestigationSection key={section.id} title={section.title[lang]}>
                <ul className="space-y-1 text-xs text-slate-700">
                  {section.lines[lang].map((line, idx) => (
                    <li key={`${section.id}-${idx}`} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </InvestigationSection>
            ))}
          </div>

          {tableData ? (
            <>
              <div className="border-t border-slate-200 pt-4">
                <h3 className="text-sm font-extrabold text-slate-900">
                  {fr ? "Donnees importees" : "Imported data"}
                </h3>
              </div>

              <InvestigationSection title={fr ? "1 · Sites" : "1 · Sites"}>
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-100 bg-white p-3">
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-red-700">
                      {fr ? "Cellules par site" : "Cells per site"}
                    </p>
                    <MultiBarChart
                      data={siteChartData}
                      xKey="site_name"
                      height={200}
                      framed
                      bars={[{ key: "nb_cells", color: CHART_PRIMARY }]}
                    />
                  </div>
                  <ReportStaticTable
                    fr={fr}
                    rows={tableData.sitesRows}
                    columns={columnsFor(language, ["snapshot_date", "site_id", "site_name", "site_state", "nb_cells", "technologies"])}
                  />
                </div>
              </InvestigationSection>

              <InvestigationSection title={fr ? "2 · Inventaire equipements" : "2 · Equipment inventory"}>
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-100 bg-white p-3">
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-red-700">
                      {fr ? "Equipements par type" : "Equipment by type"}
                    </p>
                    <MultiBarChart
                      data={typeChartData}
                      xKey="object_type"
                      height={220}
                      framed
                      bars={[{ key: "total_equipment", color: CHART_PRIMARY }]}
                    />
                  </div>
                  <ReportStaticTable
                    fr={fr}
                    rows={equipmentCounterRows}
                    showFooter={false}
                    columns={columnsFor(language, ["snapshot_date", "site_id", "object_type", "compteur"])}
                  />
                </div>
              </InvestigationSection>

              <InvestigationSection title={fr ? "3 · Assets (codes produit)" : "3 · Assets (product codes)"}>
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-100 bg-white p-3">
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-700">
                      {fr ? "Top codes produit" : "Top product codes"}
                    </p>
                    <MultiBarChart
                      data={assetsChartData}
                      xKey="product_code"
                      height={220}
                      framed
                      bars={[{ key: "serial_count", color: CHART_TERTIARY }]}
                    />
                  </div>
                  <ReportStaticTable
                    fr={fr}
                    rows={tableData.assetsPivotRows}
                    columns={columnsFor(language, ["product_code", "serial_count"])}
                  />
                </div>
              </InvestigationSection>
            </>
          ) : null}
        </div>
      ) : null}
    </InvestigationPanel>
  );
}
