import type { AssistantInsightResponse } from "@/lib/api";
import { cleanAiReportMessage } from "@/lib/import-report-export";
import type { DeltaPageReport } from "@/lib/delta-report-data";
import { getDeltaReportKpis, getDeltaReportTables } from "@/lib/delta-report-data";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markdownToHtml(text: string) {
  return escapeHtml(text)
    .replace(/^## (.+)$/gm, '<h3 class="section">$1</h3>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (block) => `<ul>${block}</ul>`)
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(.+)$/gm, (line) => (line.startsWith("<") ? line : `<p>${line}</p>`));
}

function rowCell(value: unknown) {
  return String(value ?? "—");
}

function tableToText(title: string, columns: string[], rows: Record<string, unknown>[]) {
  const lines = [title, columns.join(" | ")];
  rows.forEach((row) => lines.push(columns.map((col) => rowCell(row[col])).join(" | ")));
  return lines.join("\n");
}

export function buildDeltaReportExportText(
  fr: boolean,
  report: DeltaPageReport,
  aiInsight: AssistantInsightResponse | null,
) {
  const kpis = getDeltaReportKpis(report, fr);
  const tables = getDeltaReportTables(report, fr);
  const lines = [
    fr ? "RAPPORT DELTA RAN INTELLIGENCE" : "RAN INTELLIGENCE DELTA REPORT",
    "═".repeat(52),
    `${fr ? "Date de référence" : "Reference date"}: ${report.referenceDate}`,
    `${fr ? "Date de comparaison" : "Comparison date"}: ${report.comparisonDate}`,
    `${fr ? "Mode" : "Mode"}: ${report.mode === "ai" ? (fr ? "Requête IA" : "AI query") : fr ? "Contenu page" : "Page content"}`,
    `${fr ? "Généré" : "Generated"}: ${report.generatedAt}`,
    "",
    fr ? "— Synthèse KPI —" : "— KPI summary —",
    ...kpis.map((kpi) => `${kpi.label}: ${kpi.value}`),
    "",
    fr ? "— Comparaison sites —" : "— Sites comparison —",
    `${fr ? "Ancien" : "Before"}: ${report.sitesComparison.oldValue} · ${fr ? "Nouveau" : "After"}: ${report.sitesComparison.newValue} · Delta: ${report.sitesComparison.delta >= 0 ? "+" : ""}${report.sitesComparison.delta} (${report.sitesComparison.deltaPct}%)`,
    "",
    fr ? "— Comparaison équipements —" : "— Equipment comparison —",
    `${fr ? "Ancien" : "Before"}: ${report.equipmentComparison.oldValue} · ${fr ? "Nouveau" : "After"}: ${report.equipmentComparison.newValue} · Delta: ${report.equipmentComparison.delta >= 0 ? "+" : ""}${report.equipmentComparison.delta} (${report.equipmentComparison.deltaPct}%)`,
  ];

  tables.forEach((table) => {
    lines.push("", tableToText(table.title, table.columns, table.rows));
  });

  if (report.mode === "ai") {
    const aiText = aiInsight?.message ? cleanAiReportMessage(aiInsight.message) : "";
    lines.push("", fr ? "— Analyse IA expert —" : "— Expert AI analysis —", aiText || (fr ? "Non disponible." : "Not available."));
  }

  return lines.join("\n");
}

export function openDeltaReportPdf(
  fr: boolean,
  report: DeltaPageReport,
  aiInsight: AssistantInsightResponse | null,
) {
  const kpis = getDeltaReportKpis(report, fr);
  const tables = getDeltaReportTables(report, fr);
  const aiText = aiInsight?.message ? cleanAiReportMessage(aiInsight.message) : "";
  const modeLabel =
    report.mode === "ai" ? (fr ? "Rapport IA" : "AI report") : fr ? "Rapport page" : "Page report";

  const kpiHtml = kpis
    .map(
      (kpi) =>
        `<div class="kpi"><span class="kpi-label">${escapeHtml(kpi.label)}</span><span class="kpi-value">${escapeHtml(kpi.value)}</span></div>`,
    )
    .join("");

  const chartSummary = [
    `${fr ? "Sites" : "Sites"}: ${report.sitesComparison.oldValue} → ${report.sitesComparison.newValue} (Δ ${report.sitesComparison.delta >= 0 ? "+" : ""}${report.sitesComparison.delta})`,
    `${fr ? "Équipements" : "Equipment"}: ${report.equipmentComparison.oldValue} → ${report.equipmentComparison.newValue} (Δ ${report.equipmentComparison.delta >= 0 ? "+" : ""}${report.equipmentComparison.delta})`,
    ...report.topImpactChartRows.slice(0, 4).map((row) => `${row.metrique}: impact ${row.impact}`),
  ]
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");

  const tablesHtml = tables
    .map((table) => {
      const head = table.columns.map((col) => `<th>${escapeHtml(col)}</th>`).join("");
      const body = table.rows
        .slice(0, 120)
        .map(
          (row) =>
            `<tr>${table.columns.map((col) => `<td>${escapeHtml(rowCell(row[col]))}</td>`).join("")}</tr>`,
        )
        .join("");
      const note =
        table.rows.length > 120
          ? `<p class="note">${fr ? `${table.rows.length} lignes (120 affichées)` : `${table.rows.length} rows (120 shown)`}</p>`
          : "";
      return `<h3>${escapeHtml(table.title)}</h3><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${note}`;
    })
    .join("");

  const aiHtml =
    report.mode === "ai" && aiText
      ? `<section><h2>${fr ? "Analyse IA expert" : "Expert AI analysis"}</h2>${markdownToHtml(aiText)}</section>`
      : "";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Delta Report</title>
<style>
  body { font-family: Segoe UI, Arial, sans-serif; color: #1e293b; padding: 32px; max-width: 960px; margin: 0 auto; }
  h1 { font-size: 22px; color: #475569; margin-bottom: 4px; }
  .meta { color: #64748b; font-size: 12px; margin-bottom: 24px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
  .kpi { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; background: #f8fafc; }
  .kpi-label { display: block; font-size: 10px; text-transform: uppercase; color: #64748b; }
  .kpi-value { font-size: 20px; font-weight: 800; }
  h2, h3 { color: #0e7490; font-size: 14px; margin-top: 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
  th { background: #ecfeff; }
  ul { padding-left: 18px; }
  .note { font-size: 10px; color: #64748b; }
  .section { font-size: 13px; margin-top: 16px; }
  @media print { body { padding: 16px; } }
</style></head><body>
  <h1>${fr ? "Rapport Delta RAN Intelligence" : "RAN Intelligence Delta Report"}</h1>
  <p class="meta">${escapeHtml(report.referenceDate)} → ${escapeHtml(report.comparisonDate)} · ${escapeHtml(modeLabel)} · ${escapeHtml(report.generatedAt)}</p>
  <div class="kpis">${kpiHtml}</div>
  <h2>${fr ? "Synthèse graphiques" : "Chart summary"}</h2>
  <ul>${chartSummary}</ul>
  ${tablesHtml}
  ${aiHtml}
  <script>window.onload = () => window.print();</script>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
