"use client";

import type { ReactNode } from "react";

type PremiumPageReportBarProps = {
  title: string;
  contextBadge?: string;
  isReady: boolean;
  idleMessage: string;
  queryId: string;
  queryLabel: string;
  queryPlaceholder: string;
  queryValue: string;
  onQueryChange: (value: string) => void;
  loading: boolean;
  hasAiQuery: boolean;
  generatePageLabel: string;
  generateAiLabel: string;
  generatingLabel: string;
  viewLabel: string;
  onGenerate: () => void;
  onView?: () => void;
  showViewButton?: boolean;
  error?: string;
  extra?: ReactNode;
};

export function PremiumPageReportBar({
  title,
  contextBadge,
  isReady,
  idleMessage,
  queryId,
  queryLabel,
  queryPlaceholder,
  queryValue,
  onQueryChange,
  loading,
  hasAiQuery,
  generatePageLabel,
  generateAiLabel,
  generatingLabel,
  viewLabel,
  onGenerate,
  onView,
  showViewButton = false,
  error,
  extra,
}: PremiumPageReportBarProps) {
  return (
    <section className="premium-card overflow-hidden border border-slate-200/90 bg-gradient-to-br from-white via-slate-50/80 to-slate-100/50 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
      {!isReady ? (
        <div className="flex items-center gap-3 px-4 py-5 md:px-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-600 shadow-sm">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <p className="text-xs text-slate-500 md:text-sm">{idleMessage}</p>
        </div>
      ) : (
        <div className="relative p-4 md:p-5">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            aria-hidden
            style={{
              background:
                "radial-gradient(ellipse 80% 120% at 0% 0%, rgba(148,163,184,0.10), transparent 55%), radial-gradient(ellipse 60% 80% at 100% 100%, rgba(51,65,85,0.04), transparent 50%)",
            }}
          />

          <div className="relative flex flex-col gap-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <div className="flex min-w-0 shrink-0 items-center gap-2.5 xl:w-[min(240px,26%)]">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 text-white shadow-[0_6px_20px_rgba(15,23,42,0.18)] md:h-11 md:w-11 md:rounded-2xl">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3zM5 17l.75 2.25L8 20l-2.25.75L5 23l-.75-2.25L2 20l2.25-.75L5 17zM19 13l.75 2.25L22 16l-2.25.75L19 19l-.75-2.25L16 16l2.25-.75L19 13z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold tracking-tight text-slate-900 md:text-[15px]">{title}</h3>
                  {contextBadge ? (
                    <span className="mt-0.5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 shadow-sm">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                      <span className="truncate tabular-nums">{contextBadge}</span>
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <label className="sr-only" htmlFor={queryId}>
                  {queryLabel}
                </label>
                <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_12px_rgba(15,23,42,0.03)] transition focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-100 md:h-12 md:rounded-2xl">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M12 3a7 7 0 0 1 7 7c0 2.5-1.2 4.7-3 6.1L12 21l-4-4.9A7 7 0 0 1 12 3z" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="10" r="2.5" />
                  </svg>
                  <input
                    id={queryId}
                    type="text"
                    value={queryValue}
                    onChange={(event) => onQueryChange(event.target.value)}
                    placeholder={queryPlaceholder}
                    className="min-w-0 flex-1 border-0 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400 md:text-sm"
                  />
                </div>
              </div>

              <div className="flex shrink-0 flex-row items-center gap-2 xl:justify-end">
                <button
                  type="button"
                  disabled={loading}
                  onClick={onGenerate}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 px-4 text-xs font-semibold text-white shadow-[0_6px_20px_rgba(15,23,42,0.18)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60 xl:flex-none md:h-12 md:rounded-2xl md:px-5 md:text-sm"
                >
                  {loading ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      <span className="hidden sm:inline">{generatingLabel}</span>
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                      </svg>
                      <span className="whitespace-nowrap">{hasAiQuery ? generateAiLabel : generatePageLabel}</span>
                    </>
                  )}
                </button>
                {showViewButton && onView ? (
                  <button
                    type="button"
                    onClick={onView}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] xl:flex-none md:h-12 md:rounded-2xl md:px-5 md:text-sm"
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.75">
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    <span className="whitespace-nowrap">{viewLabel}</span>
                  </button>
                ) : null}
              </div>
            </div>

            {extra ? <div>{extra}</div> : null}
          </div>
        </div>
      )}

      {error ? (
        <p className="mx-4 mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 md:mx-5 md:text-sm">{error}</p>
      ) : null}
    </section>
  );
}
