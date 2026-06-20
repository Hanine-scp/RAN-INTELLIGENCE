export function equipmentQty(row: Record<string, unknown>) {
  const qty = Number(row.nb_equipment ?? 1);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

export function buildEquipmentChartByType(rows: Record<string, unknown>[], limit = 8) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const type = String(row.object_type ?? "").trim();
    if (!type) return;
    counts.set(type, (counts.get(type) ?? 0) + equipmentQty(row));
  });
  return Array.from(counts.entries())
    .map(([object_type, total_equipment]) => ({ object_type, total_equipment }))
    .sort((a, b) => b.total_equipment - a.total_equipment)
    .slice(0, limit);
}

export function buildEquipmentChartBySite(rows: Record<string, unknown>[], limit = 8) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const siteId = String(row.site_id ?? "").trim();
    if (!siteId) return;
    counts.set(siteId, (counts.get(siteId) ?? 0) + equipmentQty(row));
  });
  return Array.from(counts.entries())
    .map(([site_id, total_equipment]) => ({ site_id, total_equipment }))
    .sort((a, b) => b.total_equipment - a.total_equipment)
    .slice(0, limit);
}

export function computeInventorySummaryFromRows(rows: Record<string, unknown>[]) {
  const sites = new Set<string>();
  const typeCounts = new Map<string, number>();
  let totalEquipment = 0;

  rows.forEach((row) => {
    const site = String(row.site_id ?? "").trim();
    const type = String(row.object_type ?? "").trim();
    const qty = equipmentQty(row);
    totalEquipment += qty;
    if (site) sites.add(site);
    if (type) typeCounts.set(type, (typeCounts.get(type) ?? 0) + qty);
  });

  let topType = "-";
  let topTypeQty = 0;
  typeCounts.forEach((qty, type) => {
    if (qty > topTypeQty) {
      topTypeQty = qty;
      topType = type;
    }
  });

  const uniqueSites = sites.size;
  const avgEquipmentPerSite = uniqueSites > 0 ? Math.round((totalEquipment / uniqueSites) * 10) / 10 : 0;
  const topTypeShare = totalEquipment > 0 ? Math.round((topTypeQty * 1000) / totalEquipment) / 10 : 0;

  return {
    totalEquipment,
    uniqueSites,
    uniqueTypes: typeCounts.size,
    avgEquipmentPerSite,
    topType,
    topTypeQty,
    topTypeShare,
  };
}
