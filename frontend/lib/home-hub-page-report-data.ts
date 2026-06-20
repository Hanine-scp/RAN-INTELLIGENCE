import type { HomeHubTab } from "@/components/home-data-hub-tabs";
import { getGlobalCounters, getInventoryV2 } from "@/lib/api";
import {
  buildEquipmentChartBySite,
  buildEquipmentChartByType,
  computeInventorySummaryFromRows,
} from "@/lib/equipment-analytics";
import { buildOccurrenceMap, occurrenceEntries } from "@/lib/occurrence-counters";
import {
  buildProductCodeNamePivotRows,
  buildSerialPivotRows,
} from "@/lib/asset-pivot-sheets";
import { loadHomeSitesReportContext, type HomeSitesReportContext } from "@/lib/home-sites-report-data";
import { UNLIMITED_PAGE_QUERY } from "@/lib/pagination";
import { filterUniqueSerialRows } from "@/lib/serial-utils";
import { buildSiteEquipmentCounterRows } from "@/lib/site-equipment-counters";
import { normalizeParsedFieldKey } from "@/lib/parsed-field-value";
import type { FilterPayload } from "@/lib/types";

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function normalizeField(value: unknown) {
  return normalizeParsedFieldKey(value);
}

export type HomeInventaireReportContext = {
  totalCount: number;
  summary: ReturnType<typeof computeInventorySummaryFromRows>;
  charts: {
    byType: Record<string, unknown>[];
    bySite: Record<string, unknown>[];
  };
  siteCounterPreview: Record<string, unknown>[];
};

export type HomeAssetsReportContext = {
  summary: {
    totalRows: number;
    uniqueSites: number;
    uniqueCodes: number;
    uniqueTypes: number;
  };
  topProductCodes: Record<string, unknown>[];
  chartsByType: Record<string, unknown>[];
  pivotPreview: {
    productCodeName: Record<string, unknown>[];
    serial: Record<string, unknown>[];
  };
};

export type HomeCompteursReportContext = {
  summary: Record<string, unknown>;
  metrics: {
    raw: number;
    unique: number;
    empty: number;
    duplicated: number;
    types: number;
    qualityRate: number;
    emptyRate: number;
    dupRate: number;
    avgPerType: number;
  };
  topTypes: Record<string, unknown>[];
  rowsPreview: Record<string, unknown>[];
};

export type HomeHubPageContext =
  | { tab: "sites"; data: HomeSitesReportContext }
  | { tab: "inventaire"; data: HomeInventaireReportContext }
  | { tab: "assets"; data: HomeAssetsReportContext }
  | { tab: "compteurs"; data: HomeCompteursReportContext };

function buildInventaireContext(rows: Record<string, unknown>[]): HomeInventaireReportContext {
  const summary = computeInventorySummaryFromRows(rows);
  return {
    totalCount: rows.length,
    summary,
    charts: {
      byType: buildEquipmentChartByType(rows),
      bySite: buildEquipmentChartBySite(rows),
    },
    siteCounterPreview: buildSiteEquipmentCounterRows(rows).slice(0, 20),
  };
}

function buildAssetsContext(rows: Record<string, unknown>[]): HomeAssetsReportContext {
  const productCodeMap = buildOccurrenceMap(rows, "product_code", normalizeField);
  const productCodeOccurrences = occurrenceEntries(productCodeMap);
  const topProductCodes = productCodeOccurrences.slice(0, 12).map((entry) => ({
    product_code: entry.value,
    compteur: entry.count,
  }));

  const registerRows = rows.map((row) => {
    const code = normalizeField(row.product_code);
    const qty = Number(row.nb_equipment ?? 1);
    const codeCount = code ? productCodeMap.get(code) ?? 1 : 1;
    return {
      ...row,
      compteur: Number.isFinite(qty) && qty > 0 ? qty : codeCount,
    };
  });

  const sites = new Set<string>();
  const types = new Set<string>();
  rows.forEach((row) => {
    const site = String(row.site_id ?? "").trim();
    const type = String(row.object_type ?? "").trim();
    if (site) sites.add(site);
    if (type) types.add(type);
  });

  return {
    summary: {
      totalRows: registerRows.length,
      uniqueSites: sites.size,
      uniqueCodes: productCodeOccurrences.length,
      uniqueTypes: types.size,
    },
    topProductCodes,
    chartsByType: buildEquipmentChartByType(rows, 12),
    pivotPreview: {
      productCodeName: buildProductCodeNamePivotRows(registerRows).slice(0, 15),
      serial: buildSerialPivotRows(registerRows).slice(0, 15),
    },
  };
}

function buildCompteursContext(
  rows: Record<string, unknown>[],
  summary: Record<string, unknown>,
): HomeCompteursReportContext {
  const raw = Number(summary.raw_records ?? 0);
  const unique = Number(summary.unique_serials ?? 0);
  const empty = Number(summary.empty_serials ?? 0);
  const duplicated = Number(summary.duplicated_serials ?? 0);
  const types = Number(summary.object_type_count ?? 0);

  const chartRows = rows.map((row) => ({
    object_type: String(row.object_type ?? ""),
    unique_serials: Number(row.unique_serials ?? 0),
    empty_serials: Number(row.empty_serials ?? 0),
    duplicated_serials: Number(row.duplicated_serials ?? 0),
    raw_records: Number(row.raw_records ?? 0),
    quality_rate: Number(row.quality_rate ?? 0),
  }));

  return {
    summary,
    metrics: {
      raw,
      unique,
      empty,
      duplicated,
      types,
      qualityRate: pct(unique, raw),
      emptyRate: pct(empty, raw),
      dupRate: pct(duplicated, raw),
      avgPerType: types > 0 ? Math.round(raw / types) : 0,
    },
    topTypes: [...chartRows].sort((a, b) => b.raw_records - a.raw_records).slice(0, 8),
    rowsPreview: rows.slice(0, 20),
  };
}

export async function loadHomeHubPageContext(
  tab: HomeHubTab,
  payload: FilterPayload,
  uniqueSerialOnly = false,
): Promise<HomeHubPageContext> {
  if (tab === "sites") {
    const data = await loadHomeSitesReportContext(payload);
    return { tab: "sites", data };
  }

  if (tab === "compteurs") {
    const counters = await getGlobalCounters(payload);
    return {
      tab: "compteurs",
      data: buildCompteursContext(counters.rows ?? [], counters.summary ?? {}),
    };
  }

  const inventory = await getInventoryV2(payload, { ...UNLIMITED_PAGE_QUERY }, []);
  const rows = uniqueSerialOnly ? filterUniqueSerialRows(inventory.rows ?? []) : inventory.rows ?? [];

  if (tab === "assets") {
    return { tab: "assets", data: buildAssetsContext(rows) };
  }

  return { tab: "inventaire", data: buildInventaireContext(rows) };
}

export function getHomeHubPageKpis(
  pageContext: HomeHubPageContext | null,
  fr: boolean,
): { label: string; value: string }[] {
  if (!pageContext) return [];

  if (pageContext.tab === "sites") {
    const { kpiGraph, overview, cellShare } = pageContext.data;
    return [
      { label: fr ? "Sites réseau" : "Network sites", value: String(kpiGraph.sites) },
      { label: fr ? "Disponibilité" : "Availability", value: `${kpiGraph.availability}%` },
      { label: fr ? "Taux actifs" : "Active rate", value: `${overview.activeRate}%` },
      { label: fr ? "Total cellules" : "Total cells", value: cellShare.total.toLocaleString() },
    ];
  }

  if (pageContext.tab === "inventaire") {
    const s = pageContext.data.summary;
    return [
      { label: fr ? "Équipements" : "Equipment", value: s.totalEquipment.toLocaleString() },
      { label: fr ? "Sites uniques" : "Unique sites", value: s.uniqueSites.toLocaleString() },
      { label: fr ? "Types uniques" : "Unique types", value: s.uniqueTypes.toLocaleString() },
      { label: fr ? "Moy./site" : "Avg/site", value: String(s.avgEquipmentPerSite) },
    ];
  }

  if (pageContext.tab === "assets") {
    const s = pageContext.data.summary;
    return [
      { label: fr ? "Lignes assets" : "Asset rows", value: s.totalRows.toLocaleString() },
      { label: fr ? "Sites" : "Sites", value: s.uniqueSites.toLocaleString() },
      { label: fr ? "Codes produit" : "Product codes", value: s.uniqueCodes.toLocaleString() },
      { label: fr ? "Types équipement" : "Equipment types", value: s.uniqueTypes.toLocaleString() },
    ];
  }

  const m = pageContext.data.metrics;
  return [
    { label: fr ? "Taux qualité" : "Quality rate", value: `${m.qualityRate}%` },
    { label: fr ? "Enregistrements" : "Records", value: m.raw.toLocaleString() },
    { label: fr ? "Serials uniques" : "Unique serials", value: m.unique.toLocaleString() },
    { label: fr ? "Anomalies" : "Anomalies", value: (m.empty + m.duplicated).toLocaleString() },
  ];
}
