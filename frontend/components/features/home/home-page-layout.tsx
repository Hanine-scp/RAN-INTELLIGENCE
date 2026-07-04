"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AssetsEquipmentSection } from "@/components/features/inventory/assets-equipment-section";
import { GlobalCountersSection } from "@/components/features/analytics/global-counters-section";
import { HomeDataHubTabs, type HomeHubTab } from "@/components/features/home/home-data-hub-tabs";
import { HomeHubReportSection } from "@/components/reports/home-hub-report-section";
import { InventoryDetailSection } from "@/components/features/inventory/inventory-detail-section";
import { SitesTableSection } from "@/components/features/inventory/sites-table-section";
import { useAuth } from "@/components/providers/auth-provider";
import { useAppContext } from "@/components/providers/app-provider";
import { isAdmin } from "@/lib/auth";

function resolveHubTab(value: string | null, hash: string): HomeHubTab {
  const normalized = (value ?? "").toLowerCase();
  if (normalized === "compteurs" || normalized === "counters" || normalized === "global-counters") {
    return "compteurs";
  }
  if (normalized === "inventaire" || normalized === "inventory" || normalized === "detail") return "inventaire";
  if (normalized === "assets" || normalized === "distribution" || normalized === "repartition") return "assets";
  if (normalized === "sites" || hash.includes("sites-table")) return "sites";
  return "sites";
}

function HomePageLayoutInner({ dashboard }: { dashboard: ReactNode }) {
  const { filters, payload } = useAppContext();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const showCountersTab = isAdmin(user);
  const [activeTab, setActiveTab] = useState<HomeHubTab>("sites");
  const [uniqueSerialOnly, setUniqueSerialOnly] = useState(false);

  useEffect(() => {
    const tab = resolveHubTab(searchParams.get("view"), window.location.hash);
    if (tab === "compteurs" && !showCountersTab) {
      router.replace("/", { scroll: false });
      setActiveTab("sites");
      return;
    }
    setActiveTab(tab);
  }, [searchParams, showCountersTab, router]);

  const selectTab = (tab: HomeHubTab) => {
    setActiveTab(tab);
    const query = tab === "sites" ? "/" : `/?view=${tab}`;
    router.replace(query, { scroll: false });
  };

  return (
    <div className="space-y-4">
      <HomeDataHubTabs
        language={filters.language}
        activeTab={activeTab}
        onTabChange={selectTab}
        showCountersTab={showCountersTab}
        uniqueSerialOnly={uniqueSerialOnly}
        onUniqueSerialChange={setUniqueSerialOnly}
      />

      <HomeHubReportSection activeTab={activeTab} uniqueSerialOnly={uniqueSerialOnly} />

      {activeTab === "sites" ? dashboard : null}

      <section aria-label="Data hub content" className="space-y-3">
        {activeTab === "sites" ? (
          <SitesTableSection payload={payload} language={filters.language} />
        ) : activeTab === "inventaire" ? (
          <InventoryDetailSection uniqueSerialOnly={uniqueSerialOnly} />
        ) : activeTab === "compteurs" && showCountersTab ? (
          <GlobalCountersSection />
        ) : activeTab === "assets" ? (
          <AssetsEquipmentSection uniqueSerialOnly={uniqueSerialOnly} />
        ) : null}
      </section>
    </div>
  );
}

export function HomePageLayout({ dashboard }: { dashboard: ReactNode }) {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Chargement…</div>}>
      <HomePageLayoutInner dashboard={dashboard} />
    </Suspense>
  );
}
