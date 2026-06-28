"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAppContext } from "@/components/app-provider";
import { TableSortIcons } from "@/components/table-sort-icons";
import { cellValueLabel, columnLabel, t } from "@/lib/i18n";
import { formatParsedFieldValue, isParsedMissingValue } from "@/lib/parsed-field-value";
import { sortTableRows } from "@/lib/sort-table-rows";

const VIRTUAL_ROW_HEIGHT = 36;
const VIRTUALIZE_THRESHOLD = 80;

const NUMERIC_COLUMNS = new Set([
  "serial_count",
  "serial_occurrence",
  "compteur",
  "total_equipment",
  "nb_equipment",
  "product_code_count",
]);

function isNumericColumn(column: string) {
  return NUMERIC_COLUMNS.has(column.toLowerCase());
}

function columnCellClass(column: string, compact: boolean) {
  const numeric = isNumericColumn(column);
  const padding = compact ? "px-3 py-2" : "px-2 py-1.5";
  if (numeric) {
    return `${padding} align-top text-right tabular-nums whitespace-nowrap text-slate-700 ${compact ? "w-[34%]" : ""}`;
  }
  return `${padding} align-top text-left text-slate-700 ${compact ? "w-[66%] min-w-0 break-words" : "break-words"}`;
}

function columnHeaderClass(column: string, compact: boolean) {
  const numeric = isNumericColumn(column);
  const padding = compact ? "px-3 py-2.5" : "px-3 py-2.5";
  if (numeric) {
    return `${padding} text-right ${compact ? "w-[34%]" : ""}`;
  }
  return `${padding} text-left ${compact ? "w-[66%] min-w-0" : ""}`;
}

type DataTableProps = {
  rows: Record<string, unknown>[];
  showControls?: boolean;
  showIndex?: boolean;
  showSelection?: boolean;
  enableSorting?: boolean;
  sortableLargeDataset?: boolean;
  virtualize?: boolean;
  compact?: boolean;
  maxHeightClassName?: string;
  visibleColumns?: string[];
  exportFileName?: string;
  toolbarPrefix?: ReactNode;
  indexHeaderLabel?: string;
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
  sortableLargeDataset = false,
  virtualize = true,
  compact = false,
  maxHeightClassName = "max-h-[50vh]",
  visibleColumns,
  exportFileName = "ran_table_export",
  toolbarPrefix,
  indexHeaderLabel = "#",
  onRowClick,
  rowSelection,
}: DataTableProps) {
  const { filters } = useAppContext();
  const [siteQuery, setSiteQuery] = useState("");
  const [debouncedSiteQuery, setDebouncedSiteQuery] = useState("");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [localSelectedKeys, setLocalSelectedKeys] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const labelFor = (column: string) => columnLabel(filters.language, column);

  const renderCell = (column: string, value: unknown, row: Record<string, unknown>) => {
    const text = String(value ?? "");
    const normalizedColumn = column.toLowerCase();
    const translatedValue = cellValueLabel(filters.language, column, value);
    const displayText = translatedValue ?? formatParsedFieldValue(filters.language, value);

    if (
      isParsedMissingValue(value) &&
      ["serial_number", "product_code", "product_name", "site_name", "ip_address", "sw_version"].includes(normalizedColumn)
    ) {
      return <span className="italic text-slate-400">{displayText}</span>;
    }

    if (normalizedColumn.includes("site_state")) {
      const normalizedValue = text.toLowerCase();
      const isActive = normalizedValue === "active";
      const isBlocked = normalizedValue === "blocked";
      if (isActive || isBlocked) {
        return (
          <span className="inline-flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-red-500"}`} />
            <span>{displayText}</span>
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

    if (normalizedColumn === "change_type") {
      const normalizedValue = text.toUpperCase();
      const badgeClass =
        normalizedValue === "ADDED"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : normalizedValue === "REMOVED"
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-slate-200 bg-slate-50 text-slate-700";
      return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${badgeClass}`}>{displayText}</span>;
    }

    if (["interpretation", "priority", "status", "trend", "severity", "risk_level"].includes(normalizedColumn)) {
      const normalizedValue = text.toLowerCase();
      const badgeClass =
        normalizedValue === "improvement" || normalizedValue === "up" || normalizedValue === "ok" || normalizedValue === "low"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : normalizedValue === "degradation" || normalizedValue === "down" || normalizedValue === "critical" || normalizedValue === "high"
            ? "border-red-200 bg-red-50 text-red-700"
            : normalizedValue === "warning" || normalizedValue === "medium"
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-slate-200 bg-slate-50 text-slate-700";
      return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${badgeClass}`}>{displayText}</span>;
    }

    return displayText;
  };

  const rowClassName = (row: Record<string, unknown>, idx: number) => {
    const zebra = idx % 2 === 0 ? "platform-table-row-even" : "platform-table-row-odd";
    const signalTone = String(row._signal_tone ?? "");
    if (signalTone === "critical") {
      return `${zebra} platform-table-row border-b border-red-100 bg-red-50/40 hover:bg-red-50/60`;
    }
    if (signalTone === "warning") {
      return `${zebra} platform-table-row border-b border-amber-100 bg-amber-50/30 hover:bg-amber-50/50`;
    }
    if (signalTone === "success") {
      return `${zebra} platform-table-row border-b border-emerald-100 bg-emerald-50/20 hover:bg-emerald-50/40`;
    }
    const interpretation = String(row.interpretation ?? "").toLowerCase();
    if (interpretation === "degradation") {
      return `${zebra} platform-table-row border-b border-red-100 hover:bg-red-50/30`;
    }
    if (interpretation === "improvement") {
      return `${zebra} platform-table-row border-b border-emerald-100 hover:bg-emerald-50/30`;
    }
    return `${zebra} platform-table-row border-b border-[#E2E8F0] hover:bg-[#F1F5F9]`;
  };

  const canSort = enableSorting && (sortableLargeDataset || filteredRows.length <= 3000);

  const sortedRows = useMemo(() => {
    if (!canSort) {
      return filteredRows;
    }
    return sortTableRows(filteredRows, sortColumn, sortDirection);
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
          headerLabel: t(filters.language, "table_select"),
        }
    : null;

  const exportRows = sortedRows;
  const mergedSelectionIndex = Boolean(effectiveRowSelection && showIndex);
  const selectionHeaderLabel =
    effectiveRowSelection?.headerLabel ?? t(filters.language, "table_select");

  const useVirtualRows = virtualize && sortedRows.length >= VIRTUALIZE_THRESHOLD;
  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => VIRTUAL_ROW_HEIGHT,
    overscan: 12,
  });
  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = useVirtualRows && virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    useVirtualRows && virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0;
  const colSpan =
    columns.length + (effectiveRowSelection ? 1 : 0) + (showIndex && !mergedSelectionIndex ? 1 : 0);

  const renderDataRow = (row: Record<string, unknown>, idx: number) => (
    <tr
      key={`${idx}-${String(row[fallbackRowKey] ?? idx)}`}
      className={`${rowClassName(row, idx)} ${onRowClick ? "cursor-pointer" : ""}`}
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
        <td key={`${idx}-${column}`} className={columnCellClass(column, compact)}>
          {renderCell(column, row[column], row)}
        </td>
      ))}
    </tr>
  );

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

  const buildExportName = (extension: string) => {
    const stamp = new Date().toISOString().slice(0, 10);
    const safeBase = exportFileName
      .trim()
      .replace(/[^\w\-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    return `${safeBase || "ran_table_export"}_${stamp}.${extension}`;
  };

  const exportCsv = () => {
    const headers = showIndex ? [indexHeaderLabel, ...columns.map(labelFor)] : columns.map(labelFor);
    const escapeCsv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csvLines = [headers.map(escapeCsv).join(",")];
    exportRows.forEach((row, idx) => {
      const values = showIndex ? [idx + 1, ...columns.map((column) => row[column])] : columns.map((column) => row[column]);
      const line = values.map(escapeCsv).join(",");
      csvLines.push(line);
    });
    downloadFile(csvLines.join("\n"), buildExportName("csv"), "text/csv;charset=utf-8;");
  };

  const exportExcel = () => {
    const headerCells = (showIndex ? [indexHeaderLabel, ...columns.map(labelFor)] : columns.map(labelFor))
      .map((column) => `<th>${String(column)}</th>`)
      .join("");
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
    downloadFile(html, buildExportName("xls"), "application/vnd.ms-excel;charset=utf-8;");
  };

  if (!rows.length) {
    return <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">{t(filters.language, "table_no_data")}</p>;
  }

  return (
    <div className="platform-surface">
      {showControls ? (
        <div className="platform-surface-header px-3 py-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {toolbarPrefix}
            <input
              value={siteQuery}
              onChange={(event) => setSiteQuery(event.target.value)}
              placeholder={t(filters.language, "table_search")}
              className="h-8 min-w-0 flex-1 rounded-md border border-[#E2E8F0] bg-white px-2.5 text-xs text-slate-700 outline-none transition focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/15"
            />
          </div>
        </div>
      ) : null}
      <div ref={scrollRef} className={`${maxHeightClassName} overflow-auto`}>
        <table
          className={`w-full text-left text-xs ${compact ? "min-w-0 table-fixed" : "min-w-[920px] table-auto"}`}
        >
          <thead className="platform-table-head sticky top-0 z-10">
            <tr>
              {effectiveRowSelection ? (
                <th className="whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold">
                  {selectionHeaderLabel}
                </th>
              ) : null}
              {showIndex && !mergedSelectionIndex ? (
                <th className="whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold">
                  {indexHeaderLabel}
                </th>
              ) : null}
              {columns.map((column) => (
                <th key={column} className={columnHeaderClass(column, compact)}>
                  <div
                    className={`flex items-center gap-2 ${isNumericColumn(column) ? "justify-end" : "justify-between"}`}
                  >
                    <span className={compact && !isNumericColumn(column) ? "truncate" : ""}>{labelFor(column)}</span>
                    {canSort ? (
                      <TableSortIcons
                        inverted
                        active={sortColumn === column}
                        direction={sortDirection}
                        columnLabel={labelFor(column)}
                        onAsc={() => {
                          setSortColumn(column);
                          setSortDirection("asc");
                        }}
                        onDesc={() => {
                          setSortColumn(column);
                          setSortDirection("desc");
                        }}
                      />
                    ) : null}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {useVirtualRows && paddingTop > 0 ? (
              <tr>
                <td colSpan={colSpan} style={{ height: paddingTop, padding: 0, border: 0 }} />
              </tr>
            ) : null}
            {useVirtualRows
              ? virtualItems.map((virtualRow) => renderDataRow(sortedRows[virtualRow.index], virtualRow.index))
              : sortedRows.map((row, idx) => renderDataRow(row, idx))}
            {useVirtualRows && paddingBottom > 0 ? (
              <tr>
                <td colSpan={colSpan} style={{ height: paddingBottom, padding: 0, border: 0 }} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="platform-surface-footer flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <span className="text-xs font-medium text-slate-600">
          {exportRows.length.toLocaleString()} {t(filters.language, "table_rows")}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-md border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-semibold text-[#1E293B] transition hover:bg-[#F8FAFC]"
          >
            {t(filters.language, "export_csv")}
          </button>
          <button
            type="button"
            onClick={exportExcel}
            className="rounded-md border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-semibold text-[#1E293B] transition hover:bg-[#F8FAFC]"
          >
            {t(filters.language, "export_excel")}
          </button>
        </div>
      </div>
    </div>
  );
}
