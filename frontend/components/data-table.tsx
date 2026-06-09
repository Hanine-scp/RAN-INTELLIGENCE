"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppContext } from "@/components/app-provider";
import { t } from "@/lib/i18n";

type DataTableProps = {
  rows: Record<string, unknown>[];
  showControls?: boolean;
  showIndex?: boolean;
  showSelection?: boolean;
  enableSorting?: boolean;
  maxHeightClassName?: string;
  visibleColumns?: string[];
  onRowClick?: (row: Record<string, unknown>) => void;
  rowSelection?: {
    rowKey: string;
    selectedKeys: string[];
    onToggle: (rowKey: string, checked: boolean) => void;
    headerLabel?: string;
  };
};

export function DataTable({
  rows,
  showControls = true,
  showIndex = true,
  showSelection = true,
  enableSorting = true,
  maxHeightClassName = "max-h-[50vh]",
  visibleColumns,
  onRowClick,
  rowSelection,
}: DataTableProps) {
  const { filters } = useAppContext();
  const [siteQuery, setSiteQuery] = useState("");
  const [debouncedSiteQuery, setDebouncedSiteQuery] = useState("");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [localSelectedKeys, setLocalSelectedKeys] = useState<string[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSiteQuery(siteQuery);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [siteQuery]);

  const columns = useMemo(() => {
    const available = Object.keys(rows[0] ?? {}).filter((column) => !column.startsWith("_"));
    if (!visibleColumns?.length) return available;
    return visibleColumns.filter((column) => available.includes(column));
  }, [rows, visibleColumns]);

  const filteredRows = useMemo(() => {
    const normalized = debouncedSiteQuery.trim().toLowerCase();
    if (!normalized) {
      return rows;
    }

    return rows.filter((row) =>
      columns.some((column) => String(row[column] ?? "").toLowerCase().includes(normalized)),
    );
  }, [rows, columns, debouncedSiteQuery]);

  const renderCell = (column: string, value: unknown, row: Record<string, unknown>) => {
    const text = String(value ?? "");
    const normalizedColumn = column.toLowerCase();
    if (normalizedColumn.includes("site_state")) {
      const normalizedValue = text.toLowerCase();
      const isActive = normalizedValue === "active";
      const isBlocked = normalizedValue === "blocked";
      if (isActive || isBlocked) {
        return (
          <span className="inline-flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-red-500"}`} />
            <span>{text}</span>
          </span>
        );
      }
    }

    if (normalizedColumn === "signal") {
      const tone = String(row._signal_tone ?? "neutral");
      const badgeClass =
        tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : tone === "warning"
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : tone === "critical"
              ? "border-red-200 bg-red-50 text-red-700"
              : tone === "info"
                ? "border-sky-200 bg-sky-50 text-sky-700"
                : "border-slate-200 bg-slate-50 text-slate-700";
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-bold ${badgeClass}`}>
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5m0 3h.01" />
          </svg>
          {text}
        </span>
      );
    }

    if (["interpretation", "priority", "status", "trend"].includes(normalizedColumn)) {
      const normalizedValue = text.toLowerCase();
      const badgeClass =
        normalizedValue === "improvement" || normalizedValue === "up" || normalizedValue === "ok"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : normalizedValue === "degradation" || normalizedValue === "down" || normalizedValue === "critical"
            ? "border-red-200 bg-red-50 text-red-700"
            : normalizedValue === "warning" || normalizedValue === "high" || normalizedValue === "medium"
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-slate-200 bg-slate-50 text-slate-700";
      return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${badgeClass}`}>{text}</span>;
    }

    return text;
  };

  const rowClassName = (row: Record<string, unknown>) => {
    const signalTone = String(row._signal_tone ?? "");
    if (signalTone === "critical") {
      return "border-b border-red-100 bg-red-50/20 hover:bg-red-50/40";
    }
    if (signalTone === "warning") {
      return "border-b border-amber-100 bg-amber-50/15 hover:bg-amber-50/30";
    }
    if (signalTone === "success") {
      return "border-b border-emerald-100 bg-emerald-50/15 hover:bg-emerald-50/30";
    }
    const interpretation = String(row.interpretation ?? "").toLowerCase();
    if (interpretation === "degradation") {
      return "border-b border-red-100 bg-red-50/20 hover:bg-red-50/40";
    }
    if (interpretation === "improvement") {
      return "border-b border-emerald-100 bg-emerald-50/20 hover:bg-emerald-50/40";
    }
    return "border-b border-red-50 bg-white hover:bg-red-50/40";
  };

  const canSort = enableSorting && filteredRows.length <= 3000;

  const sortedRows = useMemo(() => {
    if (!canSort || !sortColumn) {
      return filteredRows;
    }
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
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
  }, [filteredRows, sortColumn, sortDirection, canSort]);

  const fallbackRowKey = useMemo(() => {
    const candidates = ["site_id", "equipment_id", "id", "serial_number", "object_type", "metric"];
    const candidate = candidates.find((name) => columns.includes(name));
    return candidate ?? columns[0] ?? "";
  }, [columns]);

  const effectiveRowSelection = showSelection
    ? rowSelection
      ? rowSelection
      : {
          rowKey: fallbackRowKey,
          selectedKeys: localSelectedKeys,
          onToggle: (key: string, checked: boolean) => {
            if (!key) return;
            setLocalSelectedKeys((prev) => (checked ? (prev.includes(key) ? prev : [...prev, key]) : prev.filter((item) => item !== key)));
          },
          headerLabel: filters.language === "Français" ? "Choix" : "Select",
        }
    : null;

  const exportRows = sortedRows;
  const mergedSelectionIndex = Boolean(effectiveRowSelection && showIndex);
  const selectionHeaderLabel =
    effectiveRowSelection?.headerLabel ??
    (filters.language === "Français" ? "Choix" : "Select");

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const headers = showIndex ? ["#", ...columns] : columns;
    const escapeCsv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csvLines = [headers.map(escapeCsv).join(",")];
    exportRows.forEach((row, idx) => {
      const values = showIndex ? [idx + 1, ...columns.map((column) => row[column])] : columns.map((column) => row[column]);
      const line = values.map(escapeCsv).join(",");
      csvLines.push(line);
    });
    downloadFile(csvLines.join("\n"), "table-export.csv", "text/csv;charset=utf-8;");
  };

  const exportExcel = () => {
    const headerCells = (showIndex ? ["#", ...columns] : columns).map((column) => `<th>${String(column)}</th>`).join("");
    const bodyRows = exportRows
      .map((row, idx) => {
        const rowCells = showIndex
          ? [`<td>${idx + 1}</td>`, ...columns.map((column) => `<td>${String(row[column] ?? "")}</td>`)]
          : columns.map((column) => `<td>${String(row[column] ?? "")}</td>`);
        const cells = rowCells.join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");
    const html = `
      <html>
        <head><meta charset="UTF-8" /></head>
        <body>
          <table border="1">
            <thead><tr>${headerCells}</tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </body>
      </html>
    `.trim();
    downloadFile(html, "table-export.xls", "application/vnd.ms-excel;charset=utf-8;");
  };

  if (!rows.length) {
    return <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">{t(filters.language, "table_no_data")}</p>;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-red-100 bg-white shadow-[0_8px_24px_rgba(220,38,38,0.08)]">
      {showControls ? (
        <div className="border-b border-red-100 bg-gradient-to-r from-red-50 to-white px-3 py-2">
          <div className="grid grid-cols-1 gap-2">
            <input
              value={siteQuery}
              onChange={(event) => setSiteQuery(event.target.value)}
              placeholder={filters.language === "Français" ? "Recherche" : "Search"}
              className="h-8 rounded-xl border border-red-100 bg-white px-2.5 text-xs text-slate-700 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
            />
          </div>
        </div>
      ) : null}
      <div className={`${maxHeightClassName} overflow-auto`}>
        <table className="w-full min-w-[920px] text-left text-xs">
          <thead className="sticky top-0 bg-red-50/80 backdrop-blur">
            <tr>
              {effectiveRowSelection ? (
                <th className="whitespace-nowrap border-b border-red-100 px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  {selectionHeaderLabel}
                </th>
              ) : null}
              {showIndex && !mergedSelectionIndex ? (
                <th className="whitespace-nowrap border-b border-red-100 px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  #
                </th>
              ) : null}
              {columns.map((column) => (
                <th
                  key={column}
                  className="border-b border-red-100 px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span>{column}</span>
                    {canSort ? (
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSortColumn(column);
                            setSortDirection("asc");
                          }}
                          className={`rounded px-1 text-[10px] ${sortColumn === column && sortDirection === "asc" ? "bg-red-600 text-white" : "text-slate-500 hover:text-red-600"}`}
                          aria-label={`Sort ${column} ascending`}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSortColumn(column);
                            setSortDirection("desc");
                          }}
                          className={`rounded px-1 text-[10px] ${sortColumn === column && sortDirection === "desc" ? "bg-red-600 text-white" : "text-slate-500 hover:text-red-600"}`}
                          aria-label={`Sort ${column} descending`}
                        >
                          ▼
                        </button>
                      </span>
                    ) : null}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => (
              <tr
                key={idx}
                className={`${rowClassName(row)} ${onRowClick ? "cursor-pointer" : ""}`}
                onClick={() => onRowClick?.(row)}
              >
                {effectiveRowSelection ? (
                  <td className="px-2 py-1.5 align-top">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-red-600"
                        checked={effectiveRowSelection.selectedKeys.includes(String(row[effectiveRowSelection.rowKey] ?? ""))}
                        onChange={(event) => effectiveRowSelection.onToggle(String(row[effectiveRowSelection.rowKey] ?? ""), event.target.checked)}
                        onClick={(event) => event.stopPropagation()}
                      />
                      {mergedSelectionIndex ? (
                        <span className="inline-block min-w-[18px] font-semibold text-red-700">{idx + 1}</span>
                      ) : null}
                    </div>
                  </td>
                ) : null}
                {showIndex && !mergedSelectionIndex ? (
                  <td className="whitespace-nowrap px-2 py-1.5 align-top font-semibold text-red-700">{idx + 1}</td>
                ) : null}
                {columns.map((column) => (
                  <td key={`${idx}-${column}`} className="break-words px-2 py-1.5 align-top text-slate-700">
                    {renderCell(column, row[column], row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-red-100 bg-gradient-to-r from-white to-red-50/40 px-3 py-2">
        <span className="text-xs font-medium text-slate-600">
          {exportRows.length.toLocaleString()} {t(filters.language, "table_rows")}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={exportExcel}
            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
          >
            Export Excel
          </button>
        </div>
      </div>
    </div>
  );
}
