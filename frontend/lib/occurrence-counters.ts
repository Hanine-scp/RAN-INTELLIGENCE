export type OccurrenceEntry = {
  value: string;
  count: number;
};

export function buildOccurrenceMap(
  rows: Record<string, unknown>[],
  field: string,
  normalize?: (value: unknown) => string | null,
): Map<string, number> {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const raw = normalize ? normalize(row[field]) : String(row[field] ?? "").trim();
    if (!raw) return;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  });
  return counts;
}

export function occurrenceEntries(map: Map<string, number>, limit = 0): OccurrenceEntry[] {
  const entries = Array.from(map.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  return limit > 0 ? entries.slice(0, limit) : entries;
}
