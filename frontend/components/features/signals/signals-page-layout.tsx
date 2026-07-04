"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PremiumHubTabs, type PremiumHubTabItem } from "@/components/ui/premium-hub-tabs";
import { HubPageReportSection } from "@/components/reports/hub-page-report-section";
import { ClusteringSection } from "@/components/features/analytics/clustering-section";
import { PatternsSection } from "@/components/features/foresight/patterns-section";
import { useAuth } from "@/components/providers/auth-provider";
import { useAppContext } from "@/components/providers/app-provider";
import { isAdmin } from "@/lib/auth";

export type SignalsHubTab = "patterns" | "clustering";

function resolveSignalsTab(value: string | null, showClustering: boolean): SignalsHubTab {
  const normalized = (value ?? "").toLowerCase();
  if (showClustering && (normalized === "clustering" || normalized === "cluster")) return "clustering";
  return "patterns";
}

function SignalsPageLayoutInner() {
  const { filters } = useAppContext();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const showClusteringTab = isAdmin(user);
  const [activeTab, setActiveTab] = useState<SignalsHubTab>("patterns");

  useEffect(() => {
    const tab = resolveSignalsTab(searchParams.get("view"), showClusteringTab);
    if (tab === "clustering" && !showClusteringTab) {
      router.replace("/signals?view=patterns", { scroll: false });
      setActiveTab("patterns");
      return;
    }
    setActiveTab(tab);

    const view = (searchParams.get("view") ?? "").toLowerCase();
    if (view === "clustering" || view === "cluster") {
      router.replace(`/signals?view=${showClusteringTab ? "clustering" : "patterns"}`, { scroll: false });
    }
  }, [searchParams, showClusteringTab, router]);

  const tabs = useMemo<PremiumHubTabItem<SignalsHubTab>[]>(() => {
    const items: PremiumHubTabItem<SignalsHubTab>[] = [
      {
        id: "patterns",
        labelKey: "signals_tab_patterns",
        step: "01",
        accent: "from-teal-600 to-teal-700",
        accentSoft: "bg-teal-50 text-teal-800 ring-teal-100",
        icon: "M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z",
      },
    ];
    if (showClusteringTab) {
      items.push({
        id: "clustering",
        labelKey: "signals_tab_clustering",
        step: "02",
        accent: "from-sky-600 to-blue-700",
        accentSoft: "bg-sky-50 text-sky-800 ring-sky-100",
        icon: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 0 1 0 2.828l-7 7a2 2 0 0 1-2.828 0l-7-7A1.994 1.994 0 0 1 3 12V7a4 4 0 0 1 4-4z",
      });
    }
    return items;
  }, [showClusteringTab]);

  const selectTab = (tab: SignalsHubTab) => {
    setActiveTab(tab);
    router.replace(`/signals?view=${tab}`, { scroll: false });
  };

  return (
    <div className="space-y-4">
      <PremiumHubTabs
        language={filters.language}
        eyebrowKey="signals_hub_eyebrow"
        titleKey="signals_hub_title"
        subtitleKey="signals_hub_subtitle"
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={selectTab}
      />
      <HubPageReportSection hub="signals" activeTab={activeTab} />
      <section aria-label="Signals content">
        {activeTab === "clustering" && showClusteringTab ? <ClusteringSection /> : <PatternsSection />}
      </section>
    </div>
  );
}

export function SignalsPageLayout() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Chargement…</div>}>
      <SignalsPageLayoutInner />
    </Suspense>
  );
}
