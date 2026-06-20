export type CellTechnology =
  | "2G"
  | "3G"
  | "5G"
  | "LTE_GENERIC"
  | "LTE_FDD"
  | "LTE_TDD";

export function classifyCell(className: string | null | undefined): CellTechnology | null {
  if (!className) return null;

  const c = String(className).trim();
  const cLower = c.toLowerCase();

  if (c === "com.nokia.srbts.gsm:GNCEL") return "2G";
  if (c === "com.nokia.srbts.wcdma:WNCEL") return "3G";
  if (c === "com.nokia.srbts.nrbts:NRCELL") return "5G";
  if (cLower === "noklte:lncel") return "LTE_GENERIC";
  if (cLower === "noklte:lncel_fdd") return "LTE_FDD";
  if (cLower === "noklte:lncel_tdd") return "LTE_TDD";

  return null;
}

export function aggregateCellCounts(rows: Record<string, unknown>[]) {
  const counts = {
    cells_2g: 0,
    cells_3g: 0,
    cells_4g_fdd: 0,
    cells_4g_tdd: 0,
    cells_4g_lte: 0,
    cells_5g: 0,
  };

  rows.forEach((row) => {
    const kind = classifyCell(String(row.class_name ?? row.mo_class ?? row.cell_class ?? ""));
    if (!kind) return;
    if (kind === "2G") counts.cells_2g += 1;
    if (kind === "3G") counts.cells_3g += 1;
    if (kind === "5G") counts.cells_5g += 1;
    if (kind === "LTE_FDD") counts.cells_4g_fdd += 1;
    if (kind === "LTE_TDD") counts.cells_4g_tdd += 1;
    if (kind === "LTE_GENERIC") counts.cells_4g_lte += 1;
  });

  if (counts.cells_4g_fdd > 0 || counts.cells_4g_tdd > 0) {
    counts.cells_4g_lte = counts.cells_4g_fdd + counts.cells_4g_tdd;
  }

  return counts;
}

function toCellNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function buildSiteCellRow(row: Record<string, unknown>) {
  const fdd = toCellNumber(row.cells_4g_fdd ?? row.nb_cells_lte_fdd);
  const tdd = toCellNumber(row.cells_4g_tdd ?? row.nb_cells_lte_tdd);
  const lteFromApi = toCellNumber(row.cells_4g_lte ?? row.nb_cells_lte_4g);
  const cells4gTotal = fdd + tdd > 0 ? fdd + tdd : lteFromApi;
  const cells2g = toCellNumber(row.cells_2g ?? row.nb_cells_2g);
  const cells3g = toCellNumber(row.cells_3g ?? row.nb_cells_3g);
  const cells5g = toCellNumber(row.cells_5g ?? row.nb_cells_5g);
  const nbCells = toCellNumber(row.nb_cells) || cells2g + cells3g + cells4gTotal + cells5g;

  return {
    snapshot_date: row.snapshot_date,
    site_id: row.site_id,
    site_name: row.site_name,
    nb_cells: nbCells,
    cells_2g: cells2g,
    cells_3g: cells3g,
    cells_4g_total: cells4gTotal,
    cells_4g_fdd: fdd,
    cells_4g_tdd: tdd,
    cells_5g: cells5g,
    technologies: row.technologies ?? "-",
    _row_key: `${String(row.snapshot_date ?? "")}|${String(row.site_id ?? "")}`,
  };
}

export type SiteCellTotals = {
  cells_2g: number;
  cells_3g: number;
  cells_4g: number;
  cells_5g: number;
  total: number;
};

export function aggregateSiteCellTotals(rows: Record<string, unknown>[]): SiteCellTotals {
  const totals: SiteCellTotals = {
    cells_2g: 0,
    cells_3g: 0,
    cells_4g: 0,
    cells_5g: 0,
    total: 0,
  };

  rows.forEach((row) => {
    const built = buildSiteCellRow(row);
    totals.cells_2g += built.cells_2g;
    totals.cells_3g += built.cells_3g;
    totals.cells_4g += built.cells_4g_total;
    totals.cells_5g += built.cells_5g;
  });

  totals.total = totals.cells_2g + totals.cells_3g + totals.cells_4g + totals.cells_5g;
  return totals;
}
