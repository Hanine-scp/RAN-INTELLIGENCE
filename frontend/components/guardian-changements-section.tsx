"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ReplacementsSection } from "@/components/replacements-section";
import { TemporalChangesSection } from "@/components/temporal-changes-section";
import { t, type Locale } from "@/lib/i18n";

export type ChangementsPanel = "replacements" | "evolutions";

type GuardianChangementsSectionProps = {
  language: Locale;
  showEvolutionsPanel?: boolean;
};

function resolvePanel(value: string | null, showEvolutions: boolean): ChangementsPanel {
  const normalized = (value ?? "").toLowerCase();
  if (showEvolutions && (normalized === "evolutions" || normalized === "temporal" || normalized === "temporal-changes")) {
    return "evolutions";
  }
  return "replacements";
}

export function GuardianChangementsSection({ language, showEvolutionsPanel = false }: GuardianChangementsSectionProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [panel, setPanel] = useState<ChangementsPanel>("replacements");

  useEffect(() => {
    setPanel(resolvePanel(searchParams.get("panel"), showEvolutionsPanel));
  }, [searchParams, showEvolutionsPanel]);

  const selectPanel = (next: ChangementsPanel) => {
    setPanel(next);
    const query = next === "replacements" ? "/guardian?view=changements" : "/guardian?view=changements&panel=evolutions";
    router.replace(query, { scroll: false });
  };

  const panels: { id: ChangementsPanel; labelKey: Parameters<typeof t>[1]; icon: string }[] = [
    {
      id: "replacements",
      labelKey: "evolution_hub_tab_replacements",
      icon: "M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0 1 14.65-5.65L20 4M20 15a9 9 0 0 1-14.65 5.65L4 20",
    },
    ...(showEvolutionsPanel
      ? [
          {
            id: "evolutions" as const,
            labelKey: "page_temporal_title" as const,
            icon: "M7 16V4m0 0L3 8m4-4 4 4m10-4v12m0 0 4-4m-4 4-4-4",
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      {panels.length > 1 ? (
        <nav
          aria-label={t(language, "guardian_hub_tab_changements")}
          className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-2"
        >
          {panels.map((item) => {
            const active = panel === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectPanel(item.id)}
                aria-pressed={active}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                  active
                    ? "bg-white text-teal-800 shadow-[0_8px_24px_rgba(13,148,136,0.12)] ring-1 ring-teal-100"
                    : "text-slate-600 hover:bg-white/80 hover:text-slate-900"
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d={item.icon} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t(language, item.labelKey)}
              </button>
            );
          })}
        </nav>
      ) : null}

      {panel === "evolutions" && showEvolutionsPanel ? <TemporalChangesSection /> : <ReplacementsSection />}
    </div>
  );
}
