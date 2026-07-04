"use client";

import { t, type Locale } from "@/lib/i18n";

export type GuardianHubTab = "changements" | "anomalies" | "cartes-risque" | "guardian";

type GuardianDataHubTabsProps = {
  language: Locale;
  activeTab: GuardianHubTab;
  onTabChange: (tab: GuardianHubTab) => void;
};

const TAB_ORDER: GuardianHubTab[] = ["changements", "anomalies", "cartes-risque", "guardian"];

const TAB_META: Record<
  GuardianHubTab,
  {
    accent: string;
    accentSoft: string;
    icon: string;
    labelKey: Parameters<typeof t>[1];
  }
> = {
  changements: {
    accent: "from-sky-600 to-teal-600",
    accentSoft: "bg-sky-50 text-sky-800 ring-sky-100",
    icon: "M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0 1 14.65-5.65L20 4M20 15a9 9 0 0 1-14.65 5.65L4 20",
    labelKey: "guardian_hub_tab_changements",
  },
  anomalies: {
    accent: "from-amber-500 to-orange-600",
    accentSoft: "bg-amber-50 text-amber-800 ring-amber-100",
    icon: "M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
    labelKey: "guardian_hub_tab_anomalie",
  },
  "cartes-risque": {
    accent: "from-violet-600 to-purple-700",
    accentSoft: "bg-violet-50 text-violet-800 ring-violet-100",
    icon: "M3 7h18M3 12h12M3 17h8",
    labelKey: "nav_risk_cards",
  },
  guardian: {
    accent: "from-teal-600 to-teal-700",
    accentSoft: "bg-teal-50 text-teal-800 ring-teal-100",
    icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016Z",
    labelKey: "guardian_hub_tab_engines",
  },
};

export function GuardianDataHubTabs({ language, activeTab, onTabChange }: GuardianDataHubTabsProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
      <div className="relative border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-teal-50/40 px-5 py-3 md:px-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-teal-700/90">
          {t(language, "guardian_hub_eyebrow")}
        </p>
        <h2 className="mt-0.5 text-lg font-extrabold tracking-tight text-slate-900 md:text-xl">
          {t(language, "guardian_hub_title")}
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
          {t(language, "guardian_hub_subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 md:p-5 xl:grid-cols-4">
        {TAB_ORDER.map((tabId, index) => {
          const active = activeTab === tabId;
          const meta = TAB_META[tabId];
          const step = String(index + 1).padStart(2, "0");
          return (
            <button
              key={tabId}
              type="button"
              onClick={() => onTabChange(tabId)}
              aria-pressed={active}
              aria-label={t(language, meta.labelKey)}
              className={`group relative overflow-hidden rounded-xl border p-4 text-left transition-all duration-200 ${
                active
                  ? "border-teal-200 bg-white shadow-[0_10px_30px_rgba(26,188,156,0.12)] ring-1 ring-teal-100"
                  : "border-slate-200/80 bg-slate-50/50 hover:border-slate-300 hover:bg-white hover:shadow-md"
              }`}
            >
              {active ? (
                <span className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${meta.accent}`} aria-hidden />
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${
                      active ? meta.accentSoft : "bg-white text-slate-500 ring-slate-200"
                    }`}
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75">
                      <path d={meta.icon} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <p className={`text-sm font-extrabold tracking-tight ${active ? "text-slate-900" : "text-slate-800"}`}>
                    {t(language, meta.labelKey)}
                  </p>
                </div>
                <span
                  className={`text-[10px] font-bold uppercase tracking-[0.16em] ${
                    active ? "text-teal-700" : "text-slate-400"
                  }`}
                >
                  {step}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
