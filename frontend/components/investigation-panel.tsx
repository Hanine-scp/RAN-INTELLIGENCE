"use client";

import { ReactNode } from "react";

type InvestigationStatTone = "neutral" | "success" | "warning" | "danger" | "info";

const statToneClass: Record<InvestigationStatTone, string> = {
  neutral: "border-slate-200/90 bg-white",
  success: "border-emerald-200/90 bg-emerald-50/70",
  warning: "border-amber-200/90 bg-amber-50/70",
  danger: "border-red-200/90 bg-red-50/70",
  info: "border-sky-200/90 bg-sky-50/70",
};

export function InvestigationStatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  tone?: InvestigationStatTone;
}) {
  return (
    <article className={`rounded-lg border px-2.5 py-2 shadow-sm ${statToneClass[tone]}`}>
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold leading-tight text-slate-900">{value}</p>
    </article>
  );
}

export function InvestigationSection({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-red-100/80 bg-white/90 p-3 ${className}`}>
      {title ? <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-red-700/90">{title}</p> : null}
      {children}
    </section>
  );
}

type InvestigationPanelProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  badge?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  error?: string;
  children?: ReactNode;
};

export function InvestigationPanel({
  open,
  onClose,
  title,
  subtitle,
  eyebrow = "Enquête",
  badge,
  loading = false,
  loadingLabel = "Analyse en cours...",
  error,
  children,
}: InvestigationPanelProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <section
        className="premium-card-red relative flex w-[min(50vw,720px)] max-h-[50vh] min-w-[320px] flex-col overflow-hidden rounded-2xl shadow-[0_20px_50px_rgba(15,23,42,0.22)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rotate-12 bg-red-500/10" aria-hidden />

        <header className="relative flex shrink-0 items-start justify-between gap-3 border-b border-red-100/80 px-4 py-2.5">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-600/85">{eyebrow}</p>
            <h3 className="truncate text-sm font-extrabold text-slate-900">{title}</h3>
            {subtitle ? <p className="truncate text-[11px] text-slate-500">{subtitle}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {badge}
            {loading ? <span className="text-[10px] font-medium text-slate-500">{loadingLabel}</span> : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-red-200/90 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-700 transition hover:bg-red-50"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="relative flex-1 overflow-y-auto px-4 py-3">
          {error ? (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{error}</p>
          ) : null}
          {loading && !children ? <p className="text-xs text-slate-500">{loadingLabel}</p> : null}
          {children}
        </div>
      </section>
    </div>
  );
}
