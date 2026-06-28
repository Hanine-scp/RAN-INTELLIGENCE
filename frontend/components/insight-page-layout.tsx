"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PremiumHubTabs, type PremiumHubTabItem } from "@/components/premium-hub-tabs";
import { HubPageReportSection } from "@/components/hub-page-report-section";
import { AnalyticsSection } from "@/components/analytics-section";
import { PowerBiSection } from "@/components/power-bi-section";
import { StatisticsSection } from "@/components/statistics-section";
import { useAppContext } from "@/components/app-provider";

export type InsightHubTab = "statistics" | "analytics" | "executive";

function resolveInsightTab(value: string | null): InsightHubTab {
  const normalized = (value ?? "").toLowerCase();
  if (normalized === "analytics" || normalized === "analytique") return "analytics";
  if (normalized === "executive" || normalized === "power-bi" || normalized === "powerbi") return "executive";
  if (normalized === "statistics" || normalized === "statistiques" || normalized === "stats") return "statistics";
  return "statistics";
}

function InsightPageLayoutInner() {
  const { filters } = useAppContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<InsightHubTab>("statistics");

  useEffect(() => {
    const tab = resolveInsightTab(searchParams.get("view"));
    setActiveTab(tab);

    const view = (searchParams.get("view") ?? "").toLowerCase();
    const legacyMap: Record<string, InsightHubTab> = {
      statistiques: "statistics",
      stats: "statistics",
      analytics: "analytics",
      analytique: "analytics",
      "power-bi": "executive",
      powerbi: "executive",
    };
    if (legacyMap[view]) {
      router.replace(`/insight?view=${legacyMap[view]}`, { scroll: false });
    }
  }, [searchParams, router]);

  const tabs = useMemo<PremiumHubTabItem<InsightHubTab>[]>(
    () => [
      {
        id: "statistics",
        labelKey: "insight_tab_statistics",
        step: "01",
        accent: "from-teal-600 to-teal-700",
        accentSoft: "bg-teal-50 text-teal-800 ring-teal-100",
        icon: "M4 19h16M6 16l3-4 3 3 5-7",
      },
      {
        id: "analytics",
        labelKey: "insight_tab_analytics",
        step: "02",
        accent: "from-indigo-600 to-indigo-700",
        accentSoft: "bg-indigo-50 text-indigo-800 ring-indigo-100",
        icon: "M4 7h16M4 12h10M4 17h16",
      },
      {
        id: "executive",
        labelKey: "insight_tab_executive",
        step: "03",
        accent: "from-violet-600 to-purple-700",
        accentSoft: "bg-violet-50 text-violet-800 ring-violet-100",
        icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2",
      },
    ],
    [],
  );

  const selectTab = (tab: InsightHubTab) => {
    setActiveTab(tab);
    router.replace(`/insight?view=${tab}`, { scroll: false });
  };

  return (
    <div className="space-y-4">
      <PremiumHubTabs
        language={filters.language}
        eyebrowKey="insight_hub_eyebrow"
        titleKey="insight_hub_title"
        subtitleKey="insight_hub_subtitle"
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={selectTab}
      />
      <HubPageReportSection hub="insight" activeTab={activeTab} />
      <section aria-label="Insight content">
        {activeTab === "analytics" ? (
          <AnalyticsSection />
        ) : activeTab === "executive" ? (
          <PowerBiSection />
        ) : (
          <StatisticsSection />
        )}
      </section>
    </div>
  );
}

export function InsightPageLayout() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Chargement…</div>}>
      <InsightPageLayoutInner />
    </Suspense>
  );
}
