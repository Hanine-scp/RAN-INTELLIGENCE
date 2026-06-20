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
    <section className="premium-card overflow-hidden border-teal-100/80 bg-gradient-to-br from-white via-teal-50/25 to-sky-50/30 shadow-[0_16px_48px_rgba(15,118,110,0.08)]">
      {!isReady ? (
        <div className="flex items-center gap-3 px-5 py-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-100 bg-white text-teal-600 shadow-sm">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <p className="text-sm text-slate-500">{idleMessage}</p>
        </div>
      ) : (
        <div className="relative p-4 md:p-5">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            aria-hidden
            style={{
              background:
                "radial-gradient(ellipse 80% 120% at 0% 0%, rgba(45,212,191,0.12), transparent 55%), radial-gradient(ellipse 60% 80% at 100% 100%, rgba(56,189,248,0.08), transparent 50%)",
            }}
          />

          <div className="relative flex flex-col gap-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
              <div className="flex min-w-0 shrink-0 items-center gap-3 xl:w-[min(240px,26%)]">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-cyan-600 text-white shadow-[0_8px_24px_rgba(13,148,136,0.28)]">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3zM5 17l.75 2.25L8 20l-2.25.75L5 23l-.75-2.25L2 20l2.25-.75L5 17zM19 13l.75 2.25L22 16l-2.25.75L19 19l-.75-2.25L16 16l2.25-.75L19 13z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-extrabold tracking-tight text-slate-900 md:text-base">{title}</h3>
                  {contextBadge ? (
                    <span className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full border border-teal-100 bg-white/90 px-2.5 py-0.5 text-[10px] font-semibold text-teal-700 shadow-sm">
                      <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                      <span className="truncate tabular-nums">{contextBadge}</span>
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <label className="sr-only" htmlFor={queryId}>
                  {queryLabel}
                </label>
                <div className="flex h-12 items-center gap-2 rounded-2xl border border-white/80 bg-white/90 px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_4px_20px_rgba(15,23,42,0.04)] backdrop-blur-sm transition focus-within:border-teal-200 focus-within:ring-2 focus-within:ring-teal-100">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-teal-500" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M12 3a7 7 0 0 1 7 7c0 2.5-1.2 4.7-3 6.1L12 21l-4-4.9A7 7 0 0 1 12 3z" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="10" r="2.5" />
                  </svg>
                  <input
                    id={queryId}
                    type="text"
                    value={queryValue}
                    onChange={(event) => onQueryChange(event.target.value)}
                    placeholder={queryPlaceholder}
                    className="min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>

              <div className="flex shrink-0 flex-row items-center gap-2 xl:justify-end">
                <button
                  type="button"
                  disabled={loading}
                  onClick={onGenerate}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 via-teal-500 to-cyan-600 px-5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(13,148,136,0.28)] transition hover:brightness-105 active:scale-[0.98] disabled:opacity-60 xl:flex-none"
                >
                  {loading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      <span className="hidden sm:inline">{generatingLabel}</span>
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
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
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-teal-200/90 bg-white px-5 text-sm font-semibold text-teal-800 shadow-sm transition hover:border-teal-300 hover:bg-teal-50/80 active:scale-[0.98] xl:flex-none"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75">
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
        <p className="mx-4 mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 md:mx-5">{error}</p>
      ) : null}
    </section>
  );
}
