"use client";

import { ReactNode } from "react";

type PageShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

import { PBI } from "@/lib/pbi-theme";

function PageIcon({ title }: { title: string }) {
  const normalized = title.toLowerCase();
  if (normalized.includes("site")) {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" style={{ color: PBI.teal }} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 21s7-5.8 7-11a7 7 0 1 0-14 0c0 5.2 7 11 7 11Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" style={{ color: PBI.navy }} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  );
}

export function PageShell({ title, subtitle, children }: PageShellProps) {
  return (
    <div className="animate-premium-in space-y-5">
      <header className="premium-card relative overflow-hidden px-5 py-4">
        <div className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rotate-12 opacity-[0.06]" style={{ backgroundColor: PBI.red }} aria-hidden />
        <div className="relative flex items-center gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] shadow-sm">
            <PageIcon title={title} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#64748B]">RAN Intelligence</p>
            <h2 className="truncate text-lg font-bold tracking-tight text-[#1E293B]">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm text-[#64748B]">{subtitle}</p> : null}
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
