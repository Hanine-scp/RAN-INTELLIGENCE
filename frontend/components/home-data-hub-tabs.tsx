"use client";

import { t, type Locale } from "@/lib/i18n";
import { UniqueSerialFilterToggle } from "@/components/unique-serial-filter-toggle";

export type HomeHubTab = "sites" | "inventaire" | "assets" | "compteurs";

type HomeDataHubTabsProps = {
  language: Locale;
  activeTab: HomeHubTab;
  onTabChange: (tab: HomeHubTab) => void;
  showCountersTab?: boolean;
  uniqueSerialOnly: boolean;
  onUniqueSerialChange: (checked: boolean) => void;
};

const TAB_META: Record<
  HomeHubTab,
  {
    step: string;
    accent: string;
    accentSoft: string;
    icon: string;
  }
> = {
  sites: {
    step: "01",
    accent: "from-teal-600 to-teal-700",
    accentSoft: "bg-teal-50 text-teal-800 ring-teal-100",
    icon: "M4 6h16M4 12h10M4 18h16",
  },
  inventaire: {
    step: "02",
    accent: "from-teal-500 to-teal-600",
    accentSoft: "bg-slate-50 text-slate-700 ring-slate-200",
    icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2",
  },
  assets: {
    step: "03",
    accent: "from-indigo-600 to-indigo-700",
    accentSoft: "bg-indigo-50 text-indigo-800 ring-indigo-100",
    icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  },
  compteurs: {
    step: "04",
    accent: "from-violet-600 to-purple-700",
    accentSoft: "bg-violet-50 text-violet-800 ring-violet-100",
    icon: "M4 7h16M4 12h16M4 17h10",
  },
};

export function HomeDataHubTabs({
  language,
  activeTab,
  onTabChange,
  showCountersTab = false,
  uniqueSerialOnly,
  onUniqueSerialChange,
}: HomeDataHubTabsProps) {
  const showSerialFilter = activeTab === "inventaire" || activeTab === "assets";

  const tabs: { id: HomeHubTab; label: string }[] = [
    { id: "sites", label: t(language, "home_hub_tab_sites") },
    { id: "inventaire", label: t(language, "home_hub_tab_inventaire") },
    { id: "assets", label: t(language, "home_hub_tab_assets") },
    ...(showCountersTab ? [{ id: "compteurs" as const, label: t(language, "home_hub_tab_compteurs") }] : []),
  ];

  const gridCols =
    tabs.length >= 4 ? "md:grid-cols-4" : tabs.length === 3 ? "md:grid-cols-3" : tabs.length === 2 ? "md:grid-cols-2" : "";

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
      <div className="relative flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-teal-50/40 px-5 py-3 md:px-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-teal-700/90">
            {t(language, "home_hub_eyebrow")}
          </p>
          <h2 className="mt-0.5 text-lg font-extrabold tracking-tight text-slate-900 md:text-xl">
            {t(language, "home_hub_title")}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
            {t(language, "home_hub_subtitle")}
          </p>
        </div>
        {showSerialFilter ? (
          <UniqueSerialFilterToggle
            checked={uniqueSerialOnly}
            onChange={onUniqueSerialChange}
            language={language}
          />
        ) : null}
      </div>

      <div className={`grid grid-cols-1 gap-3 p-4 md:p-5 ${gridCols}`}>
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          const meta = TAB_META[tab.id];
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              aria-pressed={active}
              aria-label={tab.label}
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
                    {tab.label}
                  </p>
                </div>
                <span
                  className={`text-[10px] font-bold uppercase tracking-[0.16em] ${
                    active ? "text-teal-700" : "text-slate-400"
                  }`}
                >
                  {meta.step}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
