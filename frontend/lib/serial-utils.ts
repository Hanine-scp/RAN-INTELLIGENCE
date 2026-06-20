import { isParsedMissingValue } from "@/lib/parsed-field-value";

export function normalizeSerialRaw(value: unknown): string {
  const serial = String(value ?? "").trim();
  return serial && !isParsedMissingValue(serial) ? serial : "";
}

/** Keep the first row for each serial number; rows without serial are kept as-is. */
export function filterUniqueSerialRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const serial = normalizeSerialRaw(row.serial_number);
    if (!serial) return true;
    if (seen.has(serial)) return false;
    seen.add(serial);
    return true;
  });
}
