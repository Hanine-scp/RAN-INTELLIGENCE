"use client";

import { ReactNode } from "react";

type PageShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

function PageIcon({ title }: { title: string }) {
  const normalized = title.toLowerCase();
  if (normalized.includes("site")) {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-red-600" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 21s7-5.8 7-11a7 7 0 1 0-14 0c0 5.2 7 11 7 11Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-red-600" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  );
}

export function PageShell({ title, subtitle, children }: PageShellProps) {
  return (
    <div className="animate-premium-in space-y-5">
      <header className="premium-card-red relative overflow-hidden rounded-2xl px-5 py-4">
        <div className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rotate-12 bg-red-500/10" aria-hidden />
        <div className="relative flex items-center gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-200/80 bg-gradient-to-br from-red-50 to-white shadow-sm">
            <PageIcon title={title} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-600/80">RAN Intelligence</p>
            <h2 className="truncate text-lg font-extrabold tracking-tight text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
