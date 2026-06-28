"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PremiumHubTabs, type PremiumHubTabItem } from "@/components/premium-hub-tabs";
import { HubPageReportSection } from "@/components/hub-page-report-section";
import { PredictionSection } from "@/components/prediction-section";
import { SparesSection } from "@/components/spares-section";
import { useAppContext } from "@/components/app-provider";

export type ForesightHubTab = "prediction" | "spares";

function resolveForesightTab(value: string | null): ForesightHubTab {
  const normalized = (value ?? "").toLowerCase();
  if (normalized === "spares" || normalized === "spare") return "spares";
  return "prediction";
}

function ForesightPageLayoutInner() {
  const { filters } = useAppContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<ForesightHubTab>("prediction");

  useEffect(() => {
    setActiveTab(resolveForesightTab(searchParams.get("view")));
  }, [searchParams]);

  useEffect(() => {
    const view = (searchParams.get("view") ?? "").toLowerCase();
    if (!view) return;
    if (view === "prediction" || view === "pred") {
      router.replace("/foresight?view=prediction", { scroll: false });
    }
  }, [searchParams, router]);

  const tabs = useMemo<PremiumHubTabItem<ForesightHubTab>[]>(
    () => [
      {
        id: "prediction",
        labelKey: "foresight_tab_prediction",
        step: "01",
        accent: "from-teal-600 to-teal-700",
        accentSoft: "bg-teal-50 text-teal-800 ring-teal-100",
        icon: "M3 3v18h18M7 16l4-4 4 4 6-8",
      },
      {
        id: "spares",
        labelKey: "foresight_tab_spares",
        step: "02",
        accent: "from-sky-600 to-cyan-600",
        accentSoft: "bg-sky-50 text-sky-800 ring-sky-100",
        icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
      },
    ],
    [],
  );

  const selectTab = (tab: ForesightHubTab) => {
    setActiveTab(tab);
    router.replace(`/foresight?view=${tab}`, { scroll: false });
  };

  return (
    <div className="space-y-4">
      <PremiumHubTabs
        language={filters.language}
        eyebrowKey="foresight_hub_eyebrow"
        titleKey="foresight_hub_title"
        subtitleKey="foresight_hub_subtitle"
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={selectTab}
      />
      <HubPageReportSection hub="foresight" activeTab={activeTab} />
      <section aria-label="Foresight content">
        {activeTab === "spares" ? <SparesSection /> : <PredictionSection />}
      </section>
    </div>
  );
}

export function ForesightPageLayout() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Chargement…</div>}>
      <ForesightPageLayoutInner />
    </Suspense>
  );
}
