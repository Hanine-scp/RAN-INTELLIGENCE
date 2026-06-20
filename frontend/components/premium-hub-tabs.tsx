"use client";

import type { ReactNode } from "react";
import { t, type Locale } from "@/lib/i18n";

export type PremiumHubTabItem<T extends string> = {
  id: T;
  labelKey: Parameters<typeof t>[1];
  step: string;
  accent: string;
  accentSoft: string;
  icon: string;
};

type PremiumHubTabsProps<T extends string> = {
  language: Locale;
  eyebrowKey: Parameters<typeof t>[1];
  titleKey: Parameters<typeof t>[1];
  subtitleKey: Parameters<typeof t>[1];
  tabs: PremiumHubTabItem<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  headerExtra?: ReactNode;
};

export function PremiumHubTabs<T extends string>({
  language,
  eyebrowKey,
  titleKey,
  subtitleKey,
  tabs,
  activeTab,
  onTabChange,
  headerExtra,
}: PremiumHubTabsProps<T>) {
  const gridCols =
    tabs.length >= 4
      ? "md:grid-cols-2 xl:grid-cols-4"
      : tabs.length === 3
        ? "md:grid-cols-3"
        : tabs.length === 2
          ? "md:grid-cols-2"
          : "";

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
      <div className="relative flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-teal-50/40 px-5 py-3 md:px-6">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-teal-700/90">{t(language, eyebrowKey)}</p>
          <h2 className="mt-0.5 text-lg font-extrabold tracking-tight text-slate-900 md:text-xl">{t(language, titleKey)}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">{t(language, subtitleKey)}</p>
        </div>
        {headerExtra ? <div className="shrink-0">{headerExtra}</div> : null}
      </div>

      <div className={`grid grid-cols-1 gap-3 p-4 md:p-5 ${gridCols}`}>
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              aria-pressed={active}
              aria-label={t(language, tab.labelKey)}
              className={`group relative overflow-hidden rounded-xl border p-4 text-left transition-all duration-200 ${
                active
                  ? "border-teal-200 bg-white shadow-[0_10px_30px_rgba(26,188,156,0.12)] ring-1 ring-teal-100"
                  : "border-slate-200/80 bg-slate-50/50 hover:border-slate-300 hover:bg-white hover:shadow-md"
              }`}
            >
              {active ? (
                <span className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${tab.accent}`} aria-hidden />
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${
                      active ? tab.accentSoft : "bg-white text-slate-500 ring-slate-200"
                    }`}
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75">
                      <path d={tab.icon} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <p className={`text-sm font-extrabold tracking-tight ${active ? "text-slate-900" : "text-slate-800"}`}>
                    {t(language, tab.labelKey)}
                  </p>
                </div>
                <span
                  className={`text-[10px] font-bold uppercase tracking-[0.16em] ${
                    active ? "text-teal-700" : "text-slate-400"
                  }`}
                >
                  {tab.step}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
