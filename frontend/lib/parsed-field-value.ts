import type { Locale } from "@/lib/i18n";

export const PARSED_MISSING_VALUE_EN = "Not available";
export const PARSED_MISSING_VALUE_FR = "Valeur manquante";

export const PARSED_MISSING_VALUE_MARKERS = new Set([
  PARSED_MISSING_VALUE_EN,
  PARSED_MISSING_VALUE_FR,
  "N/A",
  "n/a",
]);

export function isParsedMissingValue(value: unknown): boolean {
  const text = String(value ?? "").trim();
  return !text || PARSED_MISSING_VALUE_MARKERS.has(text);
}

export function formatParsedFieldValue(locale: Locale, value: unknown): string {
  if (isParsedMissingValue(value)) {
    return locale === "Français" ? PARSED_MISSING_VALUE_FR : PARSED_MISSING_VALUE_EN;
  }
  return String(value ?? "").trim();
}

export function normalizeParsedFieldKey(value: unknown): string | null {
  if (isParsedMissingValue(value)) return null;
  return String(value).trim();
}
