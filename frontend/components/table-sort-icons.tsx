"use client";

type TableSortIconsProps = {
  active?: boolean;
  direction?: "asc" | "desc";
  onAsc: () => void;
  onDesc: () => void;
  columnLabel?: string;
};

function SortTriangle({
  direction,
  active,
  onClick,
  columnLabel,
}: {
  direction: "asc" | "desc";
  active: boolean;
  onClick: () => void;
  columnLabel?: string;
}) {
  const label =
    direction === "asc"
      ? `Sort ${columnLabel ?? "column"} ascending`
      : `Sort ${columnLabel ?? "column"} descending`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm transition-colors hover:bg-slate-100/80"
    >
      <svg
        viewBox="0 0 10 6"
        className={`h-2 w-2.5 ${active ? "text-slate-600" : "text-slate-400 hover:text-slate-500"}`}
        aria-hidden="true"
      >
        {direction === "asc" ? (
          <path d="M5 0.5 L9.5 5.5 H0.5 Z" fill="currentColor" />
        ) : (
          <path d="M0.5 0.5 H9.5 L5 5.5 Z" fill="currentColor" />
        )}
      </svg>
    </button>
  );
}

export function TableSortIcons({ active = false, direction = "asc", onAsc, onDesc, columnLabel }: TableSortIconsProps) {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5" role="group" aria-label={`Sort controls for ${columnLabel ?? "column"}`}>
      <SortTriangle
        direction="asc"
        active={active && direction === "asc"}
        onClick={onAsc}
        columnLabel={columnLabel}
      />
      <SortTriangle
        direction="desc"
        active={active && direction === "desc"}
        onClick={onDesc}
        columnLabel={columnLabel}
      />
    </span>
  );
}
