"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { QualityDetailSection } from "@/components/features/inventory/quality-detail-section";
import { useAppContext } from "@/components/providers/app-provider";
import { t } from "@/lib/i18n";

function QualityPageContent() {
  const { filters } = useAppContext();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const view = (searchParams.get("view") ?? "").toLowerCase();
    if (view === "compteurs" || view === "counters" || view === "global-counters") {
      router.replace("/?view=compteurs", { scroll: false });
    }
  }, [router, searchParams]);

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">
          {t(filters.language, "guardian_hub_eyebrow")}
        </p>
        <h1 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900">
          {t(filters.language, "quality_hub_tab_qualite")}
        </h1>
      </header>
      <QualityDetailSection />
    </div>
  );
}

export default function QualityPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Chargement…</div>}>
      <QualityPageContent />
    </Suspense>
  );
}
