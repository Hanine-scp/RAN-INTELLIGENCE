import type { AssistantInsightResponse } from "@/lib/api";
import { cleanAiReportMessage } from "@/lib/import-report-export";
import type { GuardianPageReport } from "@/lib/guardian-report-data";
import { getTabReportKpis, getTabReportTables, tabViewLabel } from "@/lib/guardian-report-data";

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

export function buildGuardianReportExportText(
  fr: boolean,
  report: GuardianPageReport,
  aiInsight: AssistantInsightResponse | null,
) {
  const view = tabViewLabel(report.activeView, fr);
  const kpis = getTabReportKpis(report, fr);
  const tables = getTabReportTables(report);
  const lines = [
    fr ? "RAPPORT GUARDIAN" : "GUARDIAN REPORT",
    "═".repeat(48),
    `${fr ? "Vue" : "View"}: ${view}`,
    `${fr ? "Snapshot" : "Snapshot"}: ${report.snapshotDate ?? "—"}`,
    `${fr ? "Mode" : "Mode"}: ${report.mode === "ai" ? (fr ? "Requête IA" : "AI query") : fr ? "Contenu page" : "Page content"}`,
    `${fr ? "Généré" : "Generated"}: ${report.generatedAt}`,
    "",
    fr ? "— Indicateurs —" : "— KPIs —",
    ...kpis.map((kpi) => `${kpi.label}: ${kpi.value}`),
  ];

  if (report.mode === "page") {
    tables.forEach((table) => {
      lines.push("", tableToText(table.title, table.columns, table.rows));
    });
  } else {
    const aiText = aiInsight?.message ? cleanAiReportMessage(aiInsight.message) : "";
    lines.push("", fr ? "— Analyse IA —" : "— AI analysis —", aiText || (fr ? "Non disponible." : "Not available."));
  }

  return lines.join("\n");
}

export function openGuardianReportPdf(
  fr: boolean,
  report: GuardianPageReport,
  aiInsight: AssistantInsightResponse | null,
) {
  const view = tabViewLabel(report.activeView, fr);
  const kpis = getTabReportKpis(report, fr);
  const tables = getTabReportTables(report);
  const aiText = aiInsight?.message ? cleanAiReportMessage(aiInsight.message) : "";
  const modeLabel =
    report.mode === "ai" ? (fr ? "Rapport IA" : "AI report") : fr ? "Rapport page" : "Page report";

  const kpiHtml = kpis
    .map(
      (kpi) =>
        `<div class="kpi"><span>${escapeHtml(kpi.label)}</span><strong>${escapeHtml(kpi.value)}</strong></div>`,
    )
    .join("");

  const tablesHtml =
    report.mode === "page"
      ? tables
          .map((table) => {
            const head = table.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
            const body = table.rows
              .map(
                (row) =>
                  `<tr>${table.columns.map((col) => `<td>${escapeHtml(rowCell(row[col]))}</td>`).join("")}</tr>`,
              )
              .join("");
            return `<section><h2>${escapeHtml(table.title)}</h2><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></section>`;
          })
          .join("")
      : `<section class="ai"><h2>${fr ? "Analyse IA" : "AI analysis"}</h2>${aiText ? markdownToHtml(aiText) : `<p>${fr ? "Non disponible." : "Not available."}</p>`}</section>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Guardian Report</title>
<style>
  body{font-family:Segoe UI,system-ui,sans-serif;margin:0;padding:32px;color:#0f172a;background:#f8fafc}
  .header{background:linear-gradient(135deg,#334155,#475569);color:#fff;padding:24px 28px;border-radius:12px;margin-bottom:20px}
  .header h1{margin:0;font-size:22px}
  .header p{margin:8px 0 0;opacity:.85;font-size:12px}
  .badge{display:inline-block;background:#e74c3c;color:#fff;padding:4px 10px;border-radius:999px;font-size:10px;font-weight:700;text-transform:uppercase;margin-top:10px}
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:20px}
  .kpi{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px}
  .kpi span{display:block;font-size:9px;text-transform:uppercase;color:#64748b;font-weight:700}
  .kpi strong{font-size:16px;color:#0f172a}
  section{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin-bottom:14px}
  section h2{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#e74c3c;margin:0 0 10px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th,td{border:1px solid #e2e8f0;padding:6px 8px;text-align:left}
  th{background:#f1f5f9}
  .ai h3.section{font-size:12px;color:#b91c1c;border-bottom:1px solid #fecaca;padding-bottom:4px;margin:16px 0 8px}
  .ai p,.ai li{font-size:12px;line-height:1.55;color:#334155}
  @media print{body{background:#fff;padding:16px}}
</style></head><body>
<div class="header">
  <h1>${fr ? "Rapport Guardian" : "Guardian report"} — ${escapeHtml(view)}</h1>
  <p>${escapeHtml(report.snapshotDate ?? "—")} · ${escapeHtml(modeLabel)}</p>
  <span class="badge">RAN Guardian Copilot</span>
</div>
<div class="kpis">${kpiHtml}</div>
${tablesHtml}
<script>window.onload=function(){window.print()}</script>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
