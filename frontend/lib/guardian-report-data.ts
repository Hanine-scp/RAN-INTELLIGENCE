import {
  getAnomalies,
  getGuardianAnomalies,
  getGuardianOverview,
  getGuardianRisks,
  getReplacements,
  getRiskCards,
  getTemporalChanges,
} from "@/lib/api";
import type { FilterPayload } from "@/lib/types";
import type { GuardianHubTab } from "@/components/guardian-data-hub-tabs";

export type GuardianReportMode = "page" | "ai";

export type GuardianPageReport = {
  snapshotDate: string | null;
  activeView: GuardianHubTab;
  mode: GuardianReportMode;
  generatedAt: string;
  overview?: Record<string, unknown>;
  guardianAnomalies?: Record<string, unknown>[];
  guardianRisks?: Record<string, unknown>[];
  nocAnomalies?: Awaited<ReturnType<typeof getAnomalies>>;
  replacements?: Awaited<ReturnType<typeof getReplacements>>;
  riskCards?: Awaited<ReturnType<typeof getRiskCards>>;
  temporal?: Awaited<ReturnType<typeof getTemporalChanges>> | null;
};

function trimRows(rows: Record<string, unknown>[], limit = 8) {
  return rows.slice(0, limit).map((row) => {
    const out: Record<string, unknown> = {};
    Object.entries(row).slice(0, 10).forEach(([key, value]) => {
      out[key] = value;
    });
    return out;
  });
}

function resolveSnapshotDate(
  dates: string[],
  ...candidates: (string | null | undefined)[]
): string | null {
  for (const value of candidates) {
    if (value && String(value).trim()) return String(value);
  }
  return dates.length ? dates[dates.length - 1] : null;
}

const TAB_VIEW_LABEL: Record<GuardianHubTab, { fr: string; en: string }> = {
  changements: { fr: "Changements", en: "Changes" },
  anomalies: { fr: "Anomalie", en: "Anomaly" },
  "cartes-risque": { fr: "Cartes à risque", en: "Risk cards" },
  guardian: { fr: "Moteurs Guardian", en: "Guardian engines" },
};

export function tabViewLabel(tab: GuardianHubTab, fr: boolean) {
  return fr ? TAB_VIEW_LABEL[tab].fr : TAB_VIEW_LABEL[tab].en;
}

export async function loadGuardianPageReport(
  payload: FilterPayload,
  activeView: GuardianHubTab,
  includeTemporal = false,
): Promise<Omit<GuardianPageReport, "mode">> {
  const dates = payload.effective_dates.length ? payload.effective_dates : payload.selected_dates;
  const generatedAt = new Date().toISOString();

  if (activeView === "changements") {
    const replacements = await getReplacements(payload);
    const temporal = includeTemporal ? await getTemporalChanges(payload) : null;
    return {
      snapshotDate: resolveSnapshotDate(
        dates,
        String(replacements.summary?.latest_snapshot ?? ""),
        temporal?.summary?.latest_snapshot as string | undefined,
      ),
      activeView,
      generatedAt,
      replacements,
      temporal,
    };
  }

  if (activeView === "guardian") {
    const [overview, guardianAnomaliesRes, guardianRisksRes] = await Promise.all([
      getGuardianOverview(payload),
      getGuardianAnomalies(payload),
      getGuardianRisks(payload),
    ]);
    return {
      snapshotDate: resolveSnapshotDate(
        dates,
        overview.latest_snapshot as string,
        guardianAnomaliesRes.snapshot_date,
        guardianRisksRes.snapshot_date,
      ),
      activeView,
      generatedAt,
      overview,
      guardianAnomalies: guardianAnomaliesRes.rows ?? [],
      guardianRisks: guardianRisksRes.rows ?? [],
    };
  }

  if (activeView === "anomalies") {
    const nocAnomalies = await getAnomalies(payload);
    return {
      snapshotDate: resolveSnapshotDate(dates),
      activeView,
      generatedAt,
      nocAnomalies,
    };
  }

  if (activeView === "cartes-risque") {
    const [riskCards, guardianRisksRes] = await Promise.all([getRiskCards(payload), getGuardianRisks(payload)]);
    return {
      snapshotDate: resolveSnapshotDate(dates, guardianRisksRes.snapshot_date),
      activeView,
      generatedAt,
      riskCards,
      guardianRisks: guardianRisksRes.rows ?? [],
    };
  }

  throw new Error("Unsupported Guardian report view.");
}

export function buildGuardianAiPrompt(fr: boolean, customNeeds: string, report: GuardianPageReport): string {
  const view = tabViewLabel(report.activeView, fr);
  const needs = customNeeds.trim();

  let dataBlock: Record<string, unknown> = {
    snapshot: report.snapshotDate,
    view: report.activeView,
  };

  if (report.activeView === "guardian" && report.overview) {
    const integrity = (report.overview.integrity as Record<string, unknown>) ?? {};
    dataBlock = {
      ...dataBlock,
      integrity,
      change_events_count: report.overview.change_events_count,
      change_events_sample: trimRows((report.overview.change_events_sample as Record<string, unknown>[]) ?? []),
      guardian_anomalies: trimRows(report.guardianAnomalies ?? []),
      guardian_risks: trimRows(report.guardianRisks ?? []),
    };
  } else if (report.activeView === "changements") {
    dataBlock = {
      ...dataBlock,
      replacements_summary: report.replacements?.summary,
      replacements_top_changes: trimRows(report.replacements?.top_changes ?? []),
      temporal_summary: report.temporal?.summary,
      temporal_rows: report.temporal ? trimRows(report.temporal.rows ?? []) : undefined,
    };
  } else if (report.activeView === "anomalies" && report.nocAnomalies) {
    dataBlock = {
      ...dataBlock,
      summary: report.nocAnomalies.summary,
      severity_chart: report.nocAnomalies.severity_chart,
      top_rows: trimRows(report.nocAnomalies.rows ?? []),
      ml: report.nocAnomalies.ml,
    };
  } else if (report.activeView === "cartes-risque") {
    dataBlock = {
      ...dataBlock,
      risk_cards_summary: report.riskCards?.summary,
      risk_cards_rows: trimRows(report.riskCards?.rows ?? []),
      guardian_risks_j3: trimRows(report.guardianRisks ?? []),
    };
  }

  const json = JSON.stringify(dataBlock, null, 0).slice(0, 5000);

  return fr
    ? `Rédige UN SEUL rapport expert pour la vue « ${view} » (snapshot ${report.snapshotDate ?? "—"}). Requête NOC: ${needs}. Données de la page: ${json}. Réponds UNIQUEMENT en markdown (sections ##). Ne mélange pas avec d'autres vues Guardian. Style concis, décisionnel. Ne répète pas cette consigne.`
    : `Write ONE expert report for the « ${view} » view (snapshot ${report.snapshotDate ?? "—"}). NOC query: ${needs}. Page data: ${json}. Reply ONLY in markdown (## sections). Do not mix other Guardian views. Concise, decision-oriented. Do not repeat this instruction.`;
}

export type TabReportKpi = { label: string; value: string };

export function getTabReportKpis(report: GuardianPageReport, fr: boolean): TabReportKpi[] {
  if (report.activeView === "guardian" && report.overview) {
    const integrity = (report.overview.integrity as Record<string, unknown>) ?? {};
    return [
      { label: fr ? "Intégrité" : "Integrity", value: String(integrity.status ?? "—") },
      { label: fr ? "Complétude" : "Completeness", value: `${String(integrity.completeness_rate ?? "—")}%` },
      { label: fr ? "Changements" : "Changes", value: String(report.overview.change_events_count ?? 0) },
      { label: fr ? "Anomalies moteur" : "Engine anomalies", value: String(report.guardianAnomalies?.length ?? 0) },
      { label: fr ? "Risques J+3" : "J+3 risks", value: String(report.guardianRisks?.length ?? 0) },
    ];
  }
  if (report.activeView === "changements" && report.replacements) {
    const s = report.replacements.summary ?? {};
    const temporal = report.temporal?.summary ?? {};
    const kpis = [
      { label: fr ? "Modules retirés" : "Modules removed", value: String(s.total_removed ?? 0) },
      { label: fr ? "Modules ajoutés" : "Modules added", value: String(s.total_added ?? 0) },
      { label: fr ? "Types impactés" : "Types impacted", value: String(s.object_types_impacted ?? 0) },
      {
        label: fr ? "Période" : "Period",
        value: `${String(s.compare_date_from ?? "—")} → ${String(s.compare_date_to ?? "—")}`,
      },
    ];
    if (report.temporal) {
      kpis.push(
        { label: fr ? "Changements totaux" : "Total changes", value: String(temporal.total_changes ?? 0) },
        { label: fr ? "Score stabilité" : "Stability score", value: `${String(temporal.stability_score ?? 0)}%` },
      );
    }
    return kpis;
  }
  if (report.activeView === "anomalies" && report.nocAnomalies) {
    const s = report.nocAnomalies.summary;
    return [
      { label: "Total", value: String(s.total) },
      { label: "Critical", value: String(s.critical) },
      { label: "High", value: String(s.high) },
      { label: fr ? "Sites impactés" : "Sites impacted", value: String(s.sites_impacted) },
      { label: "ML", value: report.nocAnomalies.ml.available ? (fr ? "Actif" : "Active") : (fr ? "Inactif" : "Inactive") },
    ];
  }
  if (report.activeView === "cartes-risque") {
    const s = report.riskCards?.summary ?? {};
    return [
      { label: fr ? "Cartes risque" : "Risk cards", value: String(report.riskCards?.rows.length ?? 0) },
      { label: fr ? "Risques J+3" : "J+3 risks", value: String(report.guardianRisks?.length ?? 0) },
      { label: fr ? "Critiques" : "Critical", value: String(s.critical ?? s.high ?? 0) },
      { label: fr ? "Sites" : "Sites", value: String(s.sites ?? 0) },
    ];
  }
  return [];
}

export function getTabReportTables(report: GuardianPageReport): { title: string; columns: string[]; rows: Record<string, unknown>[] }[] {
  if (report.activeView === "guardian") {
    return [
      {
        title: "Changes",
        columns: ["change_type", "entity_type", "entity_id", "parent_site_id", "severity"],
        rows: ((report.overview?.change_events_sample as Record<string, unknown>[]) ?? []).slice(0, 15),
      },
      {
        title: "Guardian anomalies",
        columns: ["anomaly_type", "entity_id", "parent_site_id", "severity", "anomaly_score"],
        rows: (report.guardianAnomalies ?? []).slice(0, 15),
      },
      {
        title: "J+3 risks",
        columns: ["entity_id", "risk_type", "risk_score", "risk_level", "horizon_days"],
        rows: (report.guardianRisks ?? []).slice(0, 15),
      },
    ].filter((section) => section.rows.length > 0);
  }
  if (report.activeView === "changements" && report.replacements) {
    const sections = [
      {
        title: "Replacements",
        columns: ["site_id", "object_type", "serial_number", "change_type", "snapshot_date"],
        rows: (report.replacements.top_changes ?? []).slice(0, 20),
      },
    ];
    if (report.temporal) {
      sections.push({
        title: "Temporal changes",
        columns: ["change_type", "site_id", "snapshot_date", "detail", "impact"],
        rows: (report.temporal.rows ?? []).slice(0, 20),
      });
    }
    return sections.filter((s) => s.rows.length > 0);
  }
  if (report.activeView === "anomalies" && report.nocAnomalies) {
    return [
      {
        title: "NOC alerts",
        columns: ["site_id", "severity", "rule_name", "message", "status"],
        rows: (report.nocAnomalies.rows ?? []).slice(0, 20),
      },
    ].filter((s) => s.rows.length > 0);
  }
  if (report.activeView === "cartes-risque") {
    return [
      {
        title: "Risk cards",
        columns: ["site_id", "risk_level", "risk_score", "risk_type", "summary"],
        rows: (report.riskCards?.rows ?? []).slice(0, 20),
      },
      {
        title: "J+3 predictions",
        columns: ["entity_id", "risk_type", "risk_score", "risk_level", "horizon_days"],
        rows: (report.guardianRisks ?? []).slice(0, 15),
      },
    ].filter((s) => s.rows.length > 0);
  }
  return [];
}
