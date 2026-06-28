"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GuardianAiReportSection } from "@/components/guardian-ai-report-section";
import { AnomaliesSection } from "@/components/anomalies-section";
import { GuardianChangementsSection } from "@/components/guardian-changements-section";
import { GuardianDataHubTabs, type GuardianHubTab } from "@/components/guardian-data-hub-tabs";
import { GuardianHubSection } from "@/components/guardian-hub-section";
import { RiskCardsSection } from "@/components/risk-cards-section";
import { useAuth } from "@/components/auth-provider";
import { useAppContext } from "@/components/app-provider";
import { isAdmin } from "@/lib/auth";

function resolveGuardianTab(value: string | null): GuardianHubTab {
  const normalized = (value ?? "").toLowerCase();
  if (
    normalized === "changements" ||
    normalized === "remplacements" ||
    normalized === "replacements" ||
    normalized === "evolutions" ||
    normalized === "temporal" ||
    normalized === "temporal-changes"
  ) {
    return "changements";
  }
  if (normalized === "qualite" || normalized === "quality") return "changements";
  if (normalized === "anomalies" || normalized === "anomalie") return "anomalies";
  if (normalized === "cartes-risque" || normalized === "risk-cards" || normalized === "risque") return "cartes-risque";
  if (normalized === "guardian" || normalized === "engines" || normalized === "moteurs") return "guardian";
  return "changements";
}

function GuardianPageLayoutInner() {
  const { filters } = useAppContext();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const showEvolutionsPanel = isAdmin(user);
  const [activeTab, setActiveTab] = useState<GuardianHubTab>("changements");

  useEffect(() => {
    const tab = resolveGuardianTab(searchParams.get("view"));
    setActiveTab(tab);

    const view = (searchParams.get("view") ?? "").toLowerCase();
    const legacyViews = ["remplacements", "replacements", "evolutions", "temporal", "temporal-changes", "qualite", "quality"];
    if (legacyViews.includes(view)) {
      const panel =
        showEvolutionsPanel && ["evolutions", "temporal", "temporal-changes"].includes(view) ? "&panel=evolutions" : "";
      router.replace(`/guardian?view=changements${panel}`, { scroll: false });
    }
  }, [searchParams, showEvolutionsPanel, router]);

  const selectTab = (tab: GuardianHubTab) => {
    setActiveTab(tab);
    const query = tab === "changements" ? "/guardian?view=changements" : `/guardian?view=${tab}`;
    router.replace(query, { scroll: false });
  };

  return (
    <div className="space-y-4">
      <GuardianDataHubTabs language={filters.language} activeTab={activeTab} onTabChange={selectTab} />

      <GuardianAiReportSection activeTab={activeTab} showEvolutionsPanel={showEvolutionsPanel} />

      <section aria-label="Guardian hub content" className="space-y-3">
        {activeTab === "changements" ? (
          <GuardianChangementsSection language={filters.language} showEvolutionsPanel={showEvolutionsPanel} />
        ) : activeTab === "anomalies" ? (
          <AnomaliesSection />
        ) : activeTab === "cartes-risque" ? (
          <RiskCardsSection />
        ) : (
          <GuardianHubSection onNavigateTab={selectTab} />
        )}
      </section>
    </div>
  );
}

export function GuardianPageLayout() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Chargement…</div>}>
      <GuardianPageLayoutInner />
    </Suspense>
  );
}
