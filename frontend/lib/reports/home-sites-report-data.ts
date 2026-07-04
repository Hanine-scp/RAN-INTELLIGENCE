import { getDashboard, getSitesV2 } from "@/lib/api";
import { UNLIMITED_PAGE_QUERY } from "@/lib/pagination";
import { aggregateSiteCellTotals } from "@/lib/site-cell-metrics";
import type { DashboardData } from "@/lib/hooks/use-dashboard";
import type { FilterPayload } from "@/lib/types";

export type HomeSitesKpiGraph = {
  sites: number;
  active: number;
  blocked: number;
  equipment: number;
  availability: number;
  activeShare: number;
  blockedShare: number;
  equipmentPerSite: number;
  equipmentDensityRate: number;
};

export type HomeSitesOverview = {
  latestSites: number;
  latestActive: number;
  latestBlocked: number;
  latest4g: number;
  previousAvailability: number;
  availabilityDelta: number;
  activeRate: number;
  blockedRate: number;
};

export type HomeSitesCellRow = { label: string; value: number };

export type HomeSitesCellShare = {
  total: number;
  items: { key: "2G" | "3G" | "4G" | "5G"; count: number; percent: number }[];
};

export type HomeSitesReportContext = {
  dashboard: DashboardData;
  siteRows: Record<string, unknown>[];
  kpiGraph: HomeSitesKpiGraph;
  overview: HomeSitesOverview;
  cellsChartData: Record<string, unknown>[];
  latestCellsTable: HomeSitesCellRow[];
  cellShare: HomeSitesCellShare;
};

function toNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function buildKpiGraph(data: DashboardData): HomeSitesKpiGraph {
  const sites = toNumber(data.kpis.total_sites);
  const active = toNumber(data.kpis.active_sites);
  const blocked = toNumber(data.kpis.blocked_sites);
  const equipment = toNumber(data.kpis.total_equipment);
  const availability = Math.min(100, Math.max(0, toNumber(data.kpis.availability_percent)));
  const safeSites = Math.max(sites, 1);
  const activeShare = Math.min(100, Math.round((active / safeSites) * 100));
  const blockedShare = Math.min(100, Math.round((blocked / safeSites) * 100));
  const equipmentPerSite = sites > 0 ? Math.round((equipment / sites) * 10) / 10 : 0;
  const equipmentDensityRate = Math.min(100, Math.round((equipmentPerSite / 150) * 100));
  return {
    sites,
    active,
    blocked,
    equipment,
    availability,
    activeShare,
    blockedShare,
    equipmentPerSite,
    equipmentDensityRate,
  };
}

export function buildCellsChartData(data: DashboardData) {
  return data.summary.map((row) => {
    const fdd = toNumber(row.cells_4g_fdd);
    const tdd = toNumber(row.cells_4g_tdd);
    const fallback4g = toNumber(row.cells_4g);
    const total4g = fdd + tdd > 0 ? fdd + tdd : fallback4g;
    return {
      ...row,
      cells_4g: total4g,
      cells_4g_fdd: fdd,
      cells_4g_tdd: tdd,
    };
  });
}

export function buildLatestCellsTable(cellsChartData: Record<string, unknown>[]): HomeSitesCellRow[] {
  if (!cellsChartData.length) {
    return [
      { label: "2G", value: 0 },
      { label: "3G", value: 0 },
      { label: "4G (Total)", value: 0 },
      { label: "4G FDD", value: 0 },
      { label: "4G TDD", value: 0 },
      { label: "5G", value: 0 },
    ];
  }
  const last = cellsChartData[cellsChartData.length - 1];
  return [
    { label: "2G", value: toNumber(last.cells_2g) },
    { label: "3G", value: toNumber(last.cells_3g) },
    {
      label: "4G (Total)",
      value:
        toNumber(last.cells_4g_fdd) + toNumber(last.cells_4g_tdd) > 0
          ? toNumber(last.cells_4g_fdd) + toNumber(last.cells_4g_tdd)
          : toNumber(last.cells_4g),
    },
    { label: "4G FDD", value: toNumber(last.cells_4g_fdd) },
    { label: "4G TDD", value: toNumber(last.cells_4g_tdd) },
    { label: "5G", value: toNumber(last.cells_5g) },
  ];
}

export function buildOverview(data: DashboardData): HomeSitesOverview {
  if (!data.summary.length) {
    return {
      latestSites: 0,
      latestActive: 0,
      latestBlocked: 0,
      latest4g: 0,
      previousAvailability: 0,
      availabilityDelta: 0,
      activeRate: 0,
      blockedRate: 0,
    };
  }
  const rows = data.summary;
  const last = rows[rows.length - 1];
  const latestSites = toNumber(last.nb_sites);
  const latestActive = toNumber(last.active_sites);
  const latestBlocked = toNumber(last.blocked_sites);
  const latest4g = toNumber(last.cells_4g);
  const previous = rows.length > 1 ? rows[rows.length - 2] : last;
  const previousSites = Math.max(1, toNumber(previous.nb_sites));
  const previousActive = toNumber(previous.active_sites);
  const previousAvailability = Math.round((previousActive / previousSites) * 10000) / 100;
  const safeTotal = latestSites || Math.max(latestActive + latestBlocked, 1);
  const activeRate = Math.round((latestActive / safeTotal) * 100);
  const blockedRate = Math.round((latestBlocked / safeTotal) * 100);
  const availabilityDelta =
    Math.round((toNumber(data.kpis.availability_percent) - previousAvailability) * 100) / 100;
  return {
    latestSites,
    latestActive,
    latestBlocked,
    latest4g,
    previousAvailability,
    availabilityDelta,
    activeRate,
    blockedRate,
  };
}

export function buildCellShare(siteRows: Record<string, unknown>[]): HomeSitesCellShare {
  const totals = aggregateSiteCellTotals(siteRows);
  const safeTotal = Math.max(totals.total, 1);
  const toPercent = (value: number) => (totals.total > 0 ? (value / safeTotal) * 100 : 0);
  return {
    total: totals.total,
    items: [
      { key: "2G", count: totals.cells_2g, percent: toPercent(totals.cells_2g) },
      { key: "3G", count: totals.cells_3g, percent: toPercent(totals.cells_3g) },
      { key: "4G", count: totals.cells_4g, percent: toPercent(totals.cells_4g) },
      { key: "5G", count: totals.cells_5g, percent: toPercent(totals.cells_5g) },
    ],
  };
}

export function buildHomeSitesReportContext(
  dashboard: DashboardData,
  siteRows: Record<string, unknown>[],
): HomeSitesReportContext {
  const cellsChartData = buildCellsChartData(dashboard);
  return {
    dashboard,
    siteRows,
    kpiGraph: buildKpiGraph(dashboard),
    overview: buildOverview(dashboard),
    cellsChartData,
    latestCellsTable: buildLatestCellsTable(cellsChartData),
    cellShare: buildCellShare(siteRows),
  };
}

export async function loadHomeSitesReportContext(payload: FilterPayload): Promise<HomeSitesReportContext> {
  const [dashboard, sites] = await Promise.all([
    getDashboard(payload),
    getSitesV2(payload, { ...UNLIMITED_PAGE_QUERY }),
  ]);
  return buildHomeSitesReportContext(dashboard, sites.rows);
}
