"use client";

import { TableSortIcons } from "@/components/table-sort-icons";

type SortableTableHeaderProps = {
  label: string;
  column: string;
  sortColumn: string | null;
  sortDirection: "asc" | "desc";
  onSort: (column: string, direction: "asc" | "desc") => void;
  className?: string;
};

export function SortableTableHeader({
  label,
  column,
  sortColumn,
  sortDirection,
  onSort,
  className = "px-2 py-2",
}: SortableTableHeaderProps) {
  return (
    <th className={className}>
      <div className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <TableSortIcons
          active={sortColumn === column}
          direction={sortDirection}
          columnLabel={label}
          onAsc={() => onSort(column, "asc")}
          onDesc={() => onSort(column, "desc")}
        />
      </div>
    </th>
  );
}
