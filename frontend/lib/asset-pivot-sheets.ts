import { occurrenceEntries } from "@/lib/occurrence-counters";
import { normalizeParsedFieldKey } from "@/lib/parsed-field-value";
import { normalizeSerialRaw } from "@/lib/serial-utils";

function normalizeField(value: unknown) {
  return normalizeParsedFieldKey(value);
}

function normalizeSerial(value: unknown) {
  const serial = normalizeSerialRaw(value);
  return serial || null;
}

export function equipmentQty(row: Record<string, unknown>) {
  const qty = Number(row.nb_equipment ?? 1);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function buildQuantityPivotRows(
  rows: Record<string, unknown>[],
  field: string,
  normalize: (value: unknown) => string | null,
  valueKey: string,
  countKey: string,
) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const key = normalize(row[field]);
    if (!key) return;
    counts.set(key, (counts.get(key) ?? 0) + equipmentQty(row));
  });
  return occurrenceEntries(counts).map((entry) => ({
    [valueKey]: entry.value,
    [countKey]: entry.count,
  }));
}

export function buildProductCodePivotRows(rows: Record<string, unknown>[]) {
  return buildQuantityPivotRows(rows, "product_code", normalizeField, "product_code", "serial_count");
}

export function buildProductNamePivotRows(rows: Record<string, unknown>[]) {
  return buildQuantityPivotRows(rows, "product_name", normalizeField, "product_name", "serial_count");
}

export function buildProductCodeNamePivotRows(rows: Record<string, unknown>[]) {
  const counts = new Map<string, { product_code: string; product_name: string; serial_count: number }>();

    rows.forEach((row) => {
    const code = normalizeField(row.product_code) ?? "";
    const name = normalizeField(row.product_name) ?? "";
    if (!code && !name) return;

    const key = `${code}\0${name}`;
    // Match Excel pivot: count serial numbers per product code (1 row = 1 serial when present).
    const serial = normalizeSerial(row.serial_number);
    const qty = serial ? 1 : equipmentQty(row);
    const existing = counts.get(key);
    if (existing) {
      existing.serial_count += qty;
      return;
    }
    counts.set(key, { product_code: code, product_name: name, serial_count: qty });
  });

  return Array.from(counts.values()).sort(
    (a, b) =>
      b.serial_count - a.serial_count ||
      a.product_name.localeCompare(b.product_name) ||
      a.product_code.localeCompare(b.product_code),
  );
}

export function buildSerialPivotRows(rows: Record<string, unknown>[]) {
  return buildQuantityPivotRows(rows, "serial_number", normalizeSerial, "serial_number", "serial_occurrence");
}

export type AssetPivotExpectedTotals = {
  registerQty: number;
  productCodeQty: number;
  productNameQty: number;
  productCodeNameQty: number;
  serialQty: number;
};

export function computeAssetPivotExpectedTotals(rows: Record<string, unknown>[]): AssetPivotExpectedTotals {
  let registerQty = 0;
  let productCodeQty = 0;
  let productNameQty = 0;
  let productCodeNameQty = 0;
  let serialQty = 0;

  rows.forEach((row) => {
    const qty = equipmentQty(row);
    registerQty += qty;
    const hasCode = Boolean(normalizeField(row.product_code));
    const hasName = Boolean(normalizeField(row.product_name));
    if (hasCode) productCodeQty += qty;
    if (hasName) productNameQty += qty;
    if (hasCode || hasName) productCodeNameQty += qty;
    if (normalizeSerial(row.serial_number)) serialQty += qty;
  });

  return { registerQty, productCodeQty, productNameQty, productCodeNameQty, serialQty };
}

export function sumPivotCount(rows: Record<string, unknown>[], countKey: string) {
  return rows.reduce((sum, row) => sum + Number(row[countKey] ?? 0), 0);
}

export function verifyAssetPivotTotals(
  registerRows: Record<string, unknown>[],
  pivots: {
    productCode?: Record<string, unknown>[];
    productName?: Record<string, unknown>[];
    productCodeName?: Record<string, unknown>[];
    serial: Record<string, unknown>[];
  },
) {
  const expected = computeAssetPivotExpectedTotals(registerRows);
  const actual = {
    productCode: sumPivotCount(pivots.productCode ?? [], "serial_count"),
    productName: sumPivotCount(pivots.productName ?? [], "serial_count"),
    productCodeName: sumPivotCount(pivots.productCodeName ?? [], "serial_count"),
    serial: sumPivotCount(pivots.serial, "serial_occurrence"),
  };

  const productCodeOk = !pivots.productCode?.length || actual.productCode === expected.productCodeQty;
  const productNameOk = !pivots.productName?.length || actual.productName === expected.productNameQty;
  const productCodeNameOk = !pivots.productCodeName?.length || actual.productCodeName === expected.productCodeNameQty;

  return {
    expected,
    actual,
    isConsistent: productCodeOk && productNameOk && productCodeNameOk && actual.serial === expected.serialQty,
    productCodeOk,
    productNameOk,
    productCodeNameOk,
    serialOk: actual.serial === expected.serialQty,
  };
}
