export const SITE_EQUIPMENT_COUNTER_TYPES = [
  "CABINET",
  "RMOD",
  "SMOD",
  "BBMOD",
  "ALD",
  "RETU",
] as const;

export type SiteEquipmentCounterType = (typeof SITE_EQUIPMENT_COUNTER_TYPES)[number];

function equipmentQty(row: Record<string, unknown>) {
  const qty = Number(row.nb_equipment ?? 1);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function normalizeObjectType(value: unknown): string {
  const type = String(value ?? "").trim().toUpperCase();
  return type.endsWith("_R") ? type.slice(0, -2) : type;
}

export function buildSiteEquipmentCounterRows(rows: Record<string, unknown>[]) {
  const grouped = new Map<
    string,
    {
      total_equipment: number;
      CABINET: number;
      RMOD: number;
      SMOD: number;
      BBMOD: number;
      ALD: number;
      RETU: number;
    }
  >();

  rows.forEach((row) => {
    const siteId = String(row.site_id ?? "").trim();
    if (!siteId) return;

    if (!grouped.has(siteId)) {
      grouped.set(siteId, {
        total_equipment: 0,
        CABINET: 0,
        RMOD: 0,
        SMOD: 0,
        BBMOD: 0,
        ALD: 0,
        RETU: 0,
      });
    }

    const bucket = grouped.get(siteId)!;
    const qty = equipmentQty(row);
    bucket.total_equipment += qty;

    const objectType = normalizeObjectType(row.object_type);
    if (SITE_EQUIPMENT_COUNTER_TYPES.includes(objectType as SiteEquipmentCounterType)) {
      bucket[objectType as SiteEquipmentCounterType] += qty;
    }
  });

  return Array.from(grouped.entries())
    .map(([site_id, counts]) => ({
      site_id,
      ...counts,
    }))
    .sort((a, b) => b.total_equipment - a.total_equipment);
}

export const SITE_EQUIPMENT_COUNTER_COLUMNS = [
  "site_id",
  "total_equipment",
  ...SITE_EQUIPMENT_COUNTER_TYPES,
] as const;
