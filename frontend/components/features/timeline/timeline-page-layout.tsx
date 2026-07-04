"use client";

import { Suspense } from "react";
import { DeltaUnifiedPage } from "@/components/features/timeline/delta-unified-page";
import { useAppContext } from "@/components/providers/app-provider";
import { t } from "@/lib/i18n";

function TimelinePageLayoutInner() {
  const { filters } = useAppContext();

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
        <div className="relative border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-teal-50/40 px-5 py-3 md:px-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-teal-700/90">
            {t(filters.language, "timeline_hub_eyebrow")}
          </p>
          <h2 className="mt-0.5 text-lg font-extrabold tracking-tight text-slate-900 md:text-xl">
            {t(filters.language, "timeline_hub_title")}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
            {t(filters.language, "timeline_hub_subtitle")}
          </p>
        </div>
      </section>
      <DeltaUnifiedPage title="" subtitle="" embedded />
    </div>
  );
}

export function TimelinePageLayout() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Chargement…</div>}>
      <TimelinePageLayoutInner />
    </Suspense>
  );
}
