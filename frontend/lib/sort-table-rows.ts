export function sortTableRows(
  rows: Record<string, unknown>[],
  sortColumn: string | null,
  sortDirection: "asc" | "desc",
): Record<string, unknown>[] {
  if (!sortColumn) {
    return rows;
  }

  const direction = sortDirection === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aValue = a[sortColumn];
    const bValue = b[sortColumn];
    const aNumber = Number(aValue);
    const bNumber = Number(bValue);
    const bothNumbers = Number.isFinite(aNumber) && Number.isFinite(bNumber);

    if (bothNumbers) {
      return (aNumber - bNumber) * direction;
    }
    return String(aValue ?? "").localeCompare(String(bValue ?? ""), undefined, { sensitivity: "base" }) * direction;
  });
}
