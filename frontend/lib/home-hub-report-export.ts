import type { AiReport, AssistantInsightResponse } from "@/lib/api";
import { cleanAiReportMessage } from "@/lib/import-report-export";
import type { HomeHubPageContext } from "@/lib/home-hub-page-report-data";
import { getHomeHubPageKpis } from "@/lib/home-hub-page-report-data";

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

function appendPageDataText(lines: string[], fr: boolean, pageContext: HomeHubPageContext) {
  lines.push("", fr ? "— DONNÉES DE LA PAGE —" : "— PAGE DATA —");

  if (pageContext.tab === "sites") {
    const { kpiGraph, overview, latestCellsTable, cellShare } = pageContext.data;
    lines.push(
      `${fr ? "Sites réseau" : "Network sites"}: ${kpiGraph.sites}`,
      `${fr ? "Disponibilité" : "Availability"}: ${kpiGraph.availability}%`,
      `${fr ? "Taux actifs" : "Active rate"}: ${overview.activeRate}%`,
      `${fr ? "Équipements / site" : "Equipment / site"}: ${kpiGraph.equipmentPerSite}`,
    );
    lines.push("", fr ? "Détail cellules (dernier snapshot)" : "Cell details (latest snapshot)");
    latestCellsTable.forEach((row) => lines.push(`  ${row.label}: ${row.value}`));
    lines.push("", fr ? "Répartition cellulaire" : "Cellular distribution", `  Total: ${cellShare.total}`);
    cellShare.items.forEach((item) => lines.push(`  ${item.key}: ${item.count} (${item.percent.toFixed(1)}%)`));
    return;
  }

  if (pageContext.tab === "inventaire") {
    const { summary, charts } = pageContext.data;
    lines.push(
      `${fr ? "Équipements" : "Equipment"}: ${summary.totalEquipment}`,
      `${fr ? "Sites uniques" : "Unique sites"}: ${summary.uniqueSites}`,
      `${fr ? "Type dominant" : "Top type"}: ${summary.topType} (${summary.topTypeShare}%)`,
    );
    lines.push("", fr ? "Top types" : "Top types");
    charts.byType.slice(0, 8).forEach((row) => lines.push(`  ${row.object_type}: ${row.total_equipment}`));
    return;
  }

  if (pageContext.tab === "assets") {
    const { summary, topProductCodes } = pageContext.data;
    lines.push(
      `${fr ? "Lignes assets" : "Asset rows"}: ${summary.totalRows}`,
      `${fr ? "Codes produit" : "Product codes"}: ${summary.uniqueCodes}`,
      `${fr ? "Types équipement" : "Equipment types"}: ${summary.uniqueTypes}`,
    );
    lines.push("", fr ? "Top codes produit" : "Top product codes");
    topProductCodes.slice(0, 10).forEach((row) => lines.push(`  ${row.product_code}: ${row.compteur}`));
    return;
  }

  const { metrics } = pageContext.data;
  lines.push(
    `${fr ? "Taux qualité" : "Quality rate"}: ${metrics.qualityRate}%`,
    `${fr ? "Enregistrements" : "Records"}: ${metrics.raw}`,
    `${fr ? "Serials uniques" : "Unique serials"}: ${metrics.unique}`,
    `${fr ? "Vides" : "Empty"}: ${metrics.empty} · ${fr ? "Doublons" : "Duplicates"}: ${metrics.duplicated}`,
  );
}

function buildPageDataHtml(fr: boolean, pageContext: HomeHubPageContext) {
  if (pageContext.tab === "sites") {
    const { kpiGraph, overview, latestCellsTable, cellShare } = pageContext.data;
    const cellsTable = latestCellsTable.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${row.value}</td></tr>`).join("");
    const share = cellShare.items
      .map((item) => `<div class="share-item"><strong>${item.key}</strong><span>${item.count} · ${item.percent.toFixed(1)}%</span></div>`)
      .join("");
    return `
      <div class="kpi-grid">
        <div class="kpi"><span class="kpi-label">${fr ? "Sites" : "Sites"}</span><span class="kpi-value">${kpiGraph.sites}</span></div>
        <div class="kpi"><span class="kpi-label">${fr ? "Disponibilité" : "Availability"}</span><span class="kpi-value">${kpiGraph.availability}%</span></div>
        <div class="kpi"><span class="kpi-label">${fr ? "Taux actifs" : "Active rate"}</span><span class="kpi-value">${overview.activeRate}%</span></div>
        <div class="kpi"><span class="kpi-label">${fr ? "Cellules" : "Cells"}</span><span class="kpi-value">${cellShare.total}</span></div>
      </div>
      <h3>${fr ? "Détail cellules" : "Cell details"}</h3><table><tbody>${cellsTable}</tbody></table>
      <h3>${fr ? "Répartition cellulaire" : "Cellular distribution"}</h3><div class="share-grid">${share}</div>
    `;
  }

  const kpis = getHomeHubPageKpis(pageContext, fr);
  const kpiHtml = kpis.map((kpi) => `<div class="kpi"><span class="kpi-label">${escapeHtml(kpi.label)}</span><span class="kpi-value">${escapeHtml(kpi.value)}</span></div>`).join("");
  return `<div class="kpi-grid">${kpiHtml}</div>`;
}

export function buildHomeHubReportExportText(
  fr: boolean,
  title: string,
  report: AiReport,
  aiInsight: AssistantInsightResponse | null,
  pageContext?: HomeHubPageContext | null,
) {
  const lang = fr ? "fr" : "en";
  const aiText = aiInsight?.message ? cleanAiReportMessage(aiInsight.message) : "";
  const m = report.metrics;
  const lines: string[] = [
    title.toUpperCase(),
    "═".repeat(52),
    `${fr ? "Période" : "Period"}: ${report.period.start} → ${report.period.end}`,
    `${fr ? "Généré" : "Generated"}: ${report.generated_at}`,
    `${fr ? "Indice risque" : "Risk index"}: ${report.risk_index ?? 0}/100`,
    "",
    fr ? "— RÉSUMÉ GLOBAL —" : "— GLOBAL SUMMARY —",
    `${fr ? "Sites" : "Sites"}: ${m.total_sites ?? 0} · ${fr ? "Actifs" : "Active"}: ${m.active_sites ?? 0} · ${fr ? "Équipements" : "Equipment"}: ${m.total_equipment ?? 0}`,
    report.executive[lang],
  ];

  if (pageContext) {
    appendPageDataText(lines, fr, pageContext);
  }

  lines.push("", fr ? "— ANALYSES STRUCTURÉES —" : "— STRUCTURED ANALYSIS —");

  (report.critical_findings ?? []).forEach((item) => {
    lines.push(`  [${item.severity.toUpperCase()}] ${item[lang]}`);
  });

  (report.decisions ?? []).forEach((item) => {
    lines.push(`  ${item.priority} · ${item.category} — ${item[lang]}`);
  });

  report.sections.forEach((section) => {
    lines.push("", section.title[lang].toUpperCase());
    section.lines[lang].forEach((line) => lines.push(`  - ${line}`));
  });

  if (report.trend.length > 1) {
    lines.push("", fr ? "Tendance cellules" : "Cell trend");
    report.trend.forEach((row) => {
      lines.push(
        `  ${row.snapshot_date}: 2G=${row.cells_2g ?? 0} · 3G=${row.cells_3g ?? 0} · 4G=${row.cells_4g ?? 0} · 5G=${row.cells_5g ?? 0}`,
      );
    });
  }

  if (aiText) {
    lines.push("", fr ? "— ANALYSE IA —" : "— AI ANALYSIS —", aiText);
  }

  return lines.join("\n");
}

export function openHomeHubReportPdf(
  fr: boolean,
  title: string,
  report: AiReport,
  aiInsight: AssistantInsightResponse | null,
  pageContext?: HomeHubPageContext | null,
) {
  const lang = fr ? "fr" : "en";
  const aiText = aiInsight?.message ? cleanAiReportMessage(aiInsight.message) : "";
  const m = report.metrics;
  const riskScore = report.risk_index ?? 0;
  const riskColor = riskScore >= 70 ? "#dc2626" : riskScore >= 40 ? "#ea580c" : "#64748b";

  const findingsHtml = (report.critical_findings ?? [])
    .map((item) => `<div class="finding"><strong>${escapeHtml(item.severity.toUpperCase())}</strong> ${escapeHtml(item[lang])}</div>`)
    .join("");

  const decisionsHtml = (report.decisions ?? [])
    .map(
      (item) =>
        `<div class="decision"><span class="priority">${escapeHtml(item.priority)}</span><div><span class="cat">${escapeHtml(item.category)}</span><p>${escapeHtml(item[lang])}</p></div></div>`,
    )
    .join("");

  const sectionsHtml = report.sections
    .map(
      (section) =>
        `<article class="insight-card"><h3>${escapeHtml(section.title[lang])}</h3><ul>${section.lines[lang].map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul></article>`,
    )
    .join("");

  const trendHtml =
    report.trend.length > 1
      ? `<table><thead><tr><th>Snapshot</th><th>2G</th><th>3G</th><th>4G</th><th>5G</th></tr></thead><tbody>${report.trend
          .map(
            (row) =>
              `<tr><td>${escapeHtml(String(row.snapshot_date ?? ""))}</td><td>${row.cells_2g ?? 0}</td><td>${row.cells_3g ?? 0}</td><td>${row.cells_4g ?? 0}</td><td>${row.cells_5g ?? 0}</td></tr>`,
          )
          .join("")}</tbody></table>`
      : "";

  const pageDataHtml = pageContext ? buildPageDataHtml(fr, pageContext) : "";

  const aiHtml = aiText
    ? `<section><h2>${fr ? "Analyse IA" : "AI analysis"}</h2><div class="ai">${markdownToHtml(aiText)}</div></section>`
    : "";

  const html = `<!DOCTYPE html><html lang="${fr ? "fr" : "en"}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: Segoe UI, Arial, sans-serif; color: #0f172a; margin: 0; padding: 32px; max-width: 820px; }
  h1 { font-size: 22px; color: #475569; margin: 0 0 4px; }
  h2 { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .12em; color: #64748b; margin: 24px 0 10px; }
  h3 { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #475569; margin: 16px 0 8px; }
  .meta { color: #64748b; font-size: 12px; margin-bottom: 16px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 12px 0; }
  .kpi { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; background: #f8fafc; text-align: center; }
  .kpi-label { display: block; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #94a3b8; }
  .kpi-value { font-size: 18px; font-weight: 800; margin-top: 4px; display: block; }
  .summary { padding: 14px; border-radius: 10px; background: #f0fdfa; border: 1px solid #99f6e4; font-size: 13px; line-height: 1.5; margin-top: 10px; }
  .risk { display: inline-block; padding: 4px 10px; border-radius: 999px; background: ${riskColor}15; color: ${riskColor}; font-weight: 700; font-size: 11px; }
  .finding { padding: 8px 10px; border-radius: 8px; border: 1px solid #fde68a; background: #fffbeb; margin-bottom: 6px; font-size: 11px; }
  .decision { display: flex; gap: 10px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; margin-bottom: 6px; }
  .priority { width: 28px; height: 28px; border-radius: 6px; background: #64748b; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; }
  .cat { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #94a3b8; }
  .decision p { margin: 2px 0 0; font-size: 11px; }
  .insight-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .insight-card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; background: #fafafa; }
  .insight-card h3 { margin: 0 0 6px; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #475569; }
  .insight-card ul { margin: 0; padding-left: 16px; font-size: 11px; }
  .share-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .share-item { border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px; text-align: center; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin: 8px 0; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
  th { background: #ecfeff; font-size: 9px; text-transform: uppercase; }
  .ai { padding: 14px; border-radius: 10px; background: #f8fafc; border: 1px solid #e2e8f0; font-size: 12px; }
  .page-break { page-break-before: always; padding-top: 8px; }
  @media print { body { padding: 16px; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">${escapeHtml(report.period.start)} → ${escapeHtml(report.period.end)} · ${escapeHtml(report.generated_at)}</p>
  <span class="risk">${fr ? "Indice risque" : "Risk index"}: ${riskScore}/100</span>

  <h2>${fr ? "Résumé global" : "Global summary"}</h2>
  <div class="kpi-grid">
    <div class="kpi"><span class="kpi-label">${fr ? "Sites" : "Sites"}</span><span class="kpi-value">${m.total_sites ?? 0}</span></div>
    <div class="kpi"><span class="kpi-label">${fr ? "Actifs" : "Active"}</span><span class="kpi-value">${m.active_sites ?? 0}</span></div>
    <div class="kpi"><span class="kpi-label">${fr ? "Équipements" : "Equipment"}</span><span class="kpi-value">${m.total_equipment ?? 0}</span></div>
    <div class="kpi"><span class="kpi-label">${fr ? "Risque" : "Risk"}</span><span class="kpi-value">${riskScore}/100</span></div>
  </div>
  <div class="summary">${escapeHtml(report.executive[lang])}</div>

  ${pageDataHtml ? `<div class="page-break"><h2>${fr ? "Données de la page" : "Page data"}</h2>${pageDataHtml}</div>` : ""}

  <h2>${fr ? "Analyses structurées" : "Structured analysis"}</h2>
  ${findingsHtml || decisionsHtml ? `<div>${findingsHtml}${decisionsHtml}</div>` : ""}
  ${sectionsHtml ? `<div class="insight-grid">${sectionsHtml}</div>` : ""}
  ${trendHtml ? `<h3>${fr ? "Tendance cellules" : "Cell trend"}</h3>${trendHtml}` : ""}

  ${aiHtml}
  <script>window.onload = () => window.print();</script>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
