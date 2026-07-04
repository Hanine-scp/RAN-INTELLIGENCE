import type { FilterPayload } from "@/lib/types";
import { getDeltaCompare } from "@/lib/api";

export type DeltaComparePayload = {
  comparison: Record<string, unknown>[];
  details: Record<string, unknown>[];
  equipment_changes: Record<string, unknown>[];
};

export type DeltaReportMode = "page" | "ai";

export type DeltaPageReport = {
  referenceDate: string;
  comparisonDate: string;
  mode: DeltaReportMode;
  generatedAt: string;
  compare: DeltaComparePayload;
  kpis: {
    sitesAdded: number;
    sitesRemoved: number;
    degradations: number;
    equipmentDelta: number;
  };
  sitesComparison: {
    oldValue: number;
    newValue: number;
    delta: number;
    deltaPct: number;
    rows: { axis: string; ancien: number; nouveau: number }[];
  };
  equipmentComparison: {
    oldValue: number;
    newValue: number;
    delta: number;
    deltaPct: number;
    rows: { axis: string; ancien: number; nouveau: number }[];
  };
  cellsComparison: {
    chartRows: { cellule: string; ancienne_valeur: number; nouvelle_valeur: number }[];
    tableRows: { cellule: string; ancienne_valeur: number; nouvelle_valeur: number }[];
  };
  fourGRows: { indicateur: string; ancienne_valeur: number; nouvelle_valeur: number; delta: number }[];
  impactRows: Record<string, unknown>[];
  topImpactChartRows: { metrique: string; impact: number }[];
  newSitesRows: Record<string, unknown>[];
  removedSitesRows: Record<string, unknown>[];
  equipmentChangeRows: Record<string, unknown>[];
  equipmentChangeKpis: { added: number; removed: number; total: number };
};

const METRIC_LABELS: Record<string, string> = {
  total_sites: "Total sites",
  added_sites: "Sites ajoutés",
  removed_sites: "Sites supprimés",
  active_sites: "Sites actifs",
  blocked_sites: "Sites bloqués",
  total_equipment: "Total équipements",
  serial_rows: "Serial numbers (Total)",
  unique_serials: "Serials uniques",
  missing_serials: "Serials manquants",
  cells_2g: "Cellules 2G",
  cells_3g: "Cellules 3G",
  cells_4g: "Cellules 4G",
  cells_4g_fdd: "Cellules 4G FDD",
  cells_4g_tdd: "Cellules 4G TDD",
  cells_5g: "Cellules 5G",
};

function buildMetricMap(comparison: Record<string, unknown>[]) {
  return new Map(comparison.map((row) => [String(row.metric ?? ""), row]));
}

export function buildDeltaPageReport(
  compare: DeltaComparePayload,
  referenceDate: string,
  comparisonDate: string,
  mode: DeltaReportMode = "page",
): DeltaPageReport {
  const metricMap = buildMetricMap(compare.comparison);

  const sitesAdded = compare.details.filter((row) =>
    String(row.change_type ?? "").toUpperCase().includes("ADDED"),
  ).length;
  const sitesRemoved = compare.details.filter((row) =>
    String(row.change_type ?? "").toUpperCase().includes("REMOVED"),
  ).length;
  const equipmentDelta = Number(metricMap.get("total_equipment")?.delta ?? 0);
  const degradations = compare.comparison.filter((row) => {
    const metric = String(row.metric ?? "");
    const delta = Number(row.delta ?? 0);
    const riskMetric = metric === "blocked_sites" || metric === "missing_serials" || metric === "removed_sites";
    return riskMetric ? delta > 0 : delta < 0;
  }).length;

  const sitesOld = Number(metricMap.get("total_sites")?.value_1 ?? 0);
  const sitesNew = Number(metricMap.get("total_sites")?.value_2 ?? 0);
  const sitesDelta = sitesNew - sitesOld;
  const sitesDeltaPct = sitesOld > 0 ? Number(((sitesDelta / sitesOld) * 100).toFixed(1)) : 0;

  const eqOld = Number(metricMap.get("total_equipment")?.value_1 ?? 0);
  const eqNew = Number(metricMap.get("total_equipment")?.value_2 ?? 0);
  const eqDelta = eqNew - eqOld;
  const eqDeltaPct = eqOld > 0 ? Number(((eqDelta / eqOld) * 100).toFixed(1)) : 0;

  const chartMetrics = [
    { key: "cells_2g", label: "2G" },
    { key: "cells_3g", label: "3G" },
    { key: "cells_4g", label: "4G" },
    { key: "cells_5g", label: "5G" },
  ];
  const tableBaseMetrics = [
    { key: "cells_2g", label: "Cellules 2G" },
    { key: "cells_3g", label: "Cellules 3G" },
    { key: "cells_4g", label: "Cellules 4G (Total)" },
    { key: "cells_5g", label: "Cellules 5G" },
  ];

  const chartRows = chartMetrics.map((metric) => {
    const entry = metricMap.get(metric.key);
    return {
      cellule: metric.label,
      ancienne_valeur: Number(entry?.value_1 ?? 0),
      nouvelle_valeur: Number(entry?.value_2 ?? 0),
    };
  });

  const tableRows = tableBaseMetrics.map((metric) => {
    const entry = metricMap.get(metric.key);
    return {
      cellule: metric.label,
      ancienne_valeur: Number(entry?.value_1 ?? 0),
      nouvelle_valeur: Number(entry?.value_2 ?? 0),
    };
  });

  const fourGRows = [
    { key: "cells_4g", label: "4G Total" },
    { key: "cells_4g_fdd", label: "4G FDD" },
    { key: "cells_4g_tdd", label: "4G TDD" },
  ].map(({ key, label }) => {
    const entry = metricMap.get(key);
    const ancienne_valeur = Number(entry?.value_1 ?? 0);
    const nouvelle_valeur = Number(entry?.value_2 ?? 0);
    return { indicateur: label, ancienne_valeur, nouvelle_valeur, delta: nouvelle_valeur - ancienne_valeur };
  });

  const impactRows = compare.comparison
    .map((row) => {
      const metric = String(row.metric ?? "");
      const delta = Number(row.delta ?? 0);
      return {
        metric: METRIC_LABELS[metric] ?? metric,
        date_1: referenceDate,
        value_1: Number(row.value_1 ?? 0),
        date_2: comparisonDate,
        value_2: Number(row.value_2 ?? 0),
        delta,
        impact: Math.abs(delta),
      };
    })
    .sort((a, b) => Number(b.impact) - Number(a.impact));

  const topImpactChartRows = impactRows.slice(0, 6).map((row) => ({
    metrique: String(row.metric ?? ""),
    impact: Number(row.impact ?? 0),
  }));

  const newSitesRows = compare.details.filter((row) =>
    String(row.change_type ?? "").toUpperCase().includes("ADDED"),
  );
  const removedSitesRows = compare.details.filter((row) =>
    String(row.change_type ?? "").toUpperCase().includes("REMOVED"),
  );

  const equipmentChangeRows = compare.equipment_changes;
  const equipmentAdded = equipmentChangeRows.filter(
    (row) => String(row.change_type ?? "").toUpperCase() === "ADDED",
  ).length;
  const equipmentRemoved = equipmentChangeRows.filter(
    (row) => String(row.change_type ?? "").toUpperCase() === "REMOVED",
  ).length;

  return {
    referenceDate,
    comparisonDate,
    mode,
    generatedAt: new Date().toISOString(),
    compare,
    kpis: {
      sitesAdded,
      sitesRemoved,
      degradations,
      equipmentDelta,
    },
    sitesComparison: {
      oldValue: sitesOld,
      newValue: sitesNew,
      delta: sitesDelta,
      deltaPct: sitesDeltaPct,
      rows: [{ axis: "Sites", ancien: sitesOld, nouveau: sitesNew }],
    },
    equipmentComparison: {
      oldValue: eqOld,
      newValue: eqNew,
      delta: eqDelta,
      deltaPct: eqDeltaPct,
      rows: [{ axis: "Equipements", ancien: eqOld, nouveau: eqNew }],
    },
    cellsComparison: { chartRows, tableRows },
    fourGRows,
    impactRows,
    topImpactChartRows,
    newSitesRows,
    removedSitesRows,
    equipmentChangeRows,
    equipmentChangeKpis: {
      added: equipmentAdded,
      removed: equipmentRemoved,
      total: equipmentChangeRows.length,
    },
  };
}

export async function loadDeltaPageReport(
  payload: FilterPayload,
  referenceDate: string,
  comparisonDate: string,
): Promise<Omit<DeltaPageReport, "mode">> {
  const data = await getDeltaCompare(payload, referenceDate, comparisonDate);
  const compare: DeltaComparePayload = {
    comparison: data.comparison ?? [],
    details: data.details ?? [],
    equipment_changes: data.equipment_changes ?? [],
  };
  const report = buildDeltaPageReport(compare, referenceDate, comparisonDate);
  const { mode: _mode, ...rest } = report;
  return rest;
}

export function buildDeltaAiPrompt(fr: boolean, customNeeds: string, report: DeltaPageReport): string {
  const needs = customNeeds.trim();
  const summary = {
    reference: report.referenceDate,
    comparison: report.comparisonDate,
    kpis: report.kpis,
    sites_delta: report.sitesComparison.delta,
    equipment_delta: report.equipmentComparison.delta,
    new_sites: report.newSitesRows.length,
    removed_sites: report.removedSitesRows.length,
    equipment_changes: report.equipmentChangeKpis,
    top_impacts: report.impactRows.slice(0, 8).map((row) => ({
      metric: row.metric,
      delta: row.delta,
    })),
    cells: report.cellsComparison.tableRows,
    four_g: report.fourGRows,
  };
  const json = JSON.stringify(summary, null, 0).slice(0, 6000);

  return fr
    ? `Rédige UN rapport expert Delta RAN entre ${report.referenceDate} (référence) et ${report.comparisonDate} (comparaison). Requête NOC: ${needs || "Analyse delta standard"}. Données: ${json}. Réponds UNIQUEMENT en markdown (sections ##). Priorise sites ajoutés/supprimés, delta équipements, cellules 4G/5G, signaux de régression. Style concis, décisionnel. Ne répète pas cette consigne.`
    : `Write ONE expert RAN Delta report between ${report.referenceDate} (reference) and ${report.comparisonDate} (comparison). NOC query: ${needs || "Standard delta analysis"}. Data: ${json}. Reply ONLY in markdown (## sections). Prioritize added/removed sites, equipment delta, 4G/5G cells, regression signals. Concise, decision-oriented. Do not repeat this instruction.`;
}

function metricLabel(metric: unknown, fr: boolean): string {
  const key = String(metric ?? "");
  return METRIC_LABELS[key] ?? key;
}

/** Rapport markdown local — fallback si l'IA renvoie le narrateur brut */
export function buildDeltaLocalAiMarkdown(fr: boolean, report: DeltaPageReport, customNeeds?: string): string {
  const needs = customNeeds?.trim();
  const topImpacts = report.impactRows.slice(0, 6);

  if (fr) {
    return [
      "## Synthèse exécutive",
      needs
        ? `Période **${report.referenceDate} → ${report.comparisonDate}** — focus NOC : ${needs}.`
        : `Comparaison delta **${report.referenceDate} → ${report.comparisonDate}**.`,
      `${report.kpis.sitesAdded} site(s) ajouté(s), ${report.kpis.sitesRemoved} supprimé(s), **${report.kpis.equipmentDelta >= 0 ? "+" : ""}${report.kpis.equipmentDelta}** équipements, ${report.kpis.degradations} signal(aux) de dégradation.`,
      "",
      "## Évolution du parc",
      `- Sites : ${report.sitesComparison.oldValue.toLocaleString()} → ${report.sitesComparison.newValue.toLocaleString()} (${report.sitesComparison.delta >= 0 ? "+" : ""}${report.sitesComparison.delta}, ${report.sitesComparison.deltaPct}%)`,
      `- Équipements : ${report.equipmentComparison.oldValue.toLocaleString()} → ${report.equipmentComparison.newValue.toLocaleString()} (${report.equipmentComparison.delta >= 0 ? "+" : ""}${report.equipmentComparison.delta})`,
      `- Mouvements : +${report.equipmentChangeKpis.added} / −${report.equipmentChangeKpis.removed} (total ${report.equipmentChangeKpis.total})`,
      "",
      "## Cellules par technologie",
      ...report.cellsComparison.tableRows.map(
        (row) =>
          `- **${row.cellule}** : ${Number(row.ancienne_valeur).toLocaleString()} → ${Number(row.nouvelle_valeur).toLocaleString()} (${Number(row.nouvelle_valeur) - Number(row.ancienne_valeur) >= 0 ? "+" : ""}${Number(row.nouvelle_valeur) - Number(row.ancienne_valeur)})`,
      ),
      "",
      "## Top impacts",
      ...topImpacts.map(
        (row) =>
          `- ${metricLabel(row.metric, true)} : ${Number(row.delta) >= 0 ? "+" : ""}${Number(row.delta ?? 0).toLocaleString()}`,
      ),
      "",
      "## Recommandations NOC",
      report.kpis.sitesAdded > 0
        ? `- Valider l'onboarding des **${report.kpis.sitesAdded}** nouveaux sites (inventaire + cellules).`
        : null,
      report.kpis.degradations > 0
        ? `- Traiter en priorité les **${report.kpis.degradations}** métriques en dégradation.`
        : "- Aucune dégradation majeure détectée sur les KPI delta.",
      report.fourGRows.length
        ? `- 4G : FDD ${report.fourGRows.find((r) => String(r.indicateur).includes("FDD"))?.delta ?? "—"} · TDD ${report.fourGRows.find((r) => String(r.indicateur).includes("TDD"))?.delta ?? "—"}.`
        : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "## Executive summary",
    needs
      ? `Period **${report.referenceDate} → ${report.comparisonDate}** — NOC focus: ${needs}.`
      : `Delta comparison **${report.referenceDate} → ${report.comparisonDate}**.`,
    `${report.kpis.sitesAdded} site(s) added, ${report.kpis.sitesRemoved} removed, equipment **${report.kpis.equipmentDelta >= 0 ? "+" : ""}${report.kpis.equipmentDelta}**, ${report.kpis.degradations} degradation signal(s).`,
    "",
    "## Fleet evolution",
    `- Sites: ${report.sitesComparison.oldValue.toLocaleString()} → ${report.sitesComparison.newValue.toLocaleString()} (${report.sitesComparison.delta >= 0 ? "+" : ""}${report.sitesComparison.delta}, ${report.sitesComparison.deltaPct}%)`,
    `- Equipment: ${report.equipmentComparison.oldValue.toLocaleString()} → ${report.equipmentComparison.newValue.toLocaleString()} (${report.equipmentComparison.delta >= 0 ? "+" : ""}${report.equipmentComparison.delta})`,
    `- Movements: +${report.equipmentChangeKpis.added} / −${report.equipmentChangeKpis.removed} (total ${report.equipmentChangeKpis.total})`,
    "",
    "## Cells by technology",
    ...report.cellsComparison.tableRows.map(
      (row) =>
        `- **${row.cellule}**: ${Number(row.ancienne_valeur).toLocaleString()} → ${Number(row.nouvelle_valeur).toLocaleString()} (${Number(row.nouvelle_valeur) - Number(row.ancienne_valeur) >= 0 ? "+" : ""}${Number(row.nouvelle_valeur) - Number(row.ancienne_valeur)})`,
    ),
    "",
    "## Top impacts",
    ...topImpacts.map(
      (row) =>
        `- ${metricLabel(row.metric, false)}: ${Number(row.delta) >= 0 ? "+" : ""}${Number(row.delta ?? 0).toLocaleString()}`,
    ),
    "",
    "## NOC recommendations",
    report.kpis.sitesAdded > 0
      ? `- Validate onboarding for **${report.kpis.sitesAdded}** new sites (inventory + cells).`
      : null,
    report.kpis.degradations > 0
      ? `- Prioritize **${report.kpis.degradations}** degraded metric(s).`
      : "- No major degradation on delta KPIs.",
  ]
    .filter(Boolean)
    .join("\n");
}

export type DeltaReportTable = {
  title: string;
  columns: string[];
  rows: Record<string, unknown>[];
};

export function getDeltaReportTables(report: DeltaPageReport, fr: boolean): DeltaReportTable[] {
  const tables: DeltaReportTable[] = [];

  if (report.newSitesRows.length) {
    tables.push({
      title: fr ? "Sites ajoutés détectés" : "Added sites detected",
      columns: ["change_type", "site_id"],
      rows: report.newSitesRows,
    });
  }

  if (report.removedSitesRows.length) {
    tables.push({
      title: fr ? "Sites supprimés détectés" : "Removed sites detected",
      columns: ["change_type", "site_id"],
      rows: report.removedSitesRows,
    });
  }

  tables.push({
    title: fr ? "Delta Table 1 — Cellules par technologie" : "Delta Table 1 — Cells by technology",
    columns: ["cellule", "ancienne_valeur", "nouvelle_valeur"],
    rows: report.cellsComparison.tableRows,
  });

  tables.push({
    title: fr ? "Analyse 4G (Total, FDD, TDD)" : "4G analysis (Total, FDD, TDD)",
    columns: ["indicateur", "ancienne_valeur", "nouvelle_valeur", "delta"],
    rows: report.fourGRows,
  });

  if (report.equipmentChangeRows.length) {
    tables.push({
      title: fr ? "Delta Table 2 — Équipements modifiés" : "Delta Table 2 — Modified equipment",
      columns: [
        "change_type",
        "site_id",
        "object_type",
        "id",
        "serial_number",
        "product_code",
        "product_name",
        "nb_equipment",
      ],
      rows: report.equipmentChangeRows,
    });
  }

  tables.push({
    title: fr ? "Top impacts métriques" : "Top metric impacts",
    columns: ["metric", "value_1", "value_2", "delta", "impact"],
    rows: report.impactRows,
  });

  return tables;
}

export function getDeltaReportKpis(report: DeltaPageReport, fr: boolean) {
  return [
    { label: fr ? "Sites ajoutés" : "Sites added", value: String(report.kpis.sitesAdded) },
    { label: fr ? "Sites supprimés" : "Sites removed", value: String(report.kpis.sitesRemoved) },
    { label: fr ? "Dégradations" : "Degradations", value: String(report.kpis.degradations) },
    {
      label: fr ? "Delta équipements" : "Equipment delta",
      value: `${report.kpis.equipmentDelta >= 0 ? "+" : ""}${report.kpis.equipmentDelta}`,
    },
  ];
}
