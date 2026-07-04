"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/ui/data-table";
import { KpiCards } from "@/components/ui/kpi-cards";
import { useAppContext } from "@/components/providers/app-provider";
import { getSerialPatterns } from "@/lib/api";
import { t } from "@/lib/i18n";

export function PatternsSection() {
  const { payload, filters } = useAppContext();
  const isFr = filters.language === "Français";
  const [data, setData] = useState<Awaited<ReturnType<typeof getSerialPatterns>> | null>(null);
  const [prefixLen, setPrefixLen] = useState(6);

  useEffect(() => {
    const load = async () => {
      if (!payload.effective_dates.length && !payload.selected_dates.length) {
        setData(null);
        return;
      }
      setData(await getSerialPatterns(payload, prefixLen, 3));
    };
    void load();
  }, [payload, prefixLen]);

  const kpis = [
    {
      label: isFr ? "Patterns détectés" : "Patterns found",
      value: String(data?.summary.patterns_found ?? 0),
    },
    { label: isFr ? "Top préfixe" : "Top prefix", value: String(data?.summary.top_prefix ?? "—") },
    {
      label: isFr ? "Occurrences top" : "Top occurrences",
      value: String(data?.summary.top_occurrences ?? 0),
    },
    { label: isFr ? "Longueur préfixe" : "Prefix length", value: String(prefixLen) },
  ];

  return (
    <div className="space-y-4">
      <div className="premium-card flex flex-wrap items-center gap-3 rounded-2xl p-4">
        <label className="text-xs font-semibold text-slate-600">
          {t(filters.language, "signals_patterns_prefix_label")}
          <input
            type="number"
            min={3}
            max={12}
            value={prefixLen}
            onChange={(event) => setPrefixLen(Number(event.target.value))}
            className="ml-2 rounded-lg border border-teal-100 px-2 py-1 text-sm"
          />
        </label>
      </div>
      {data?.narrative ? (
        <p className="rounded-xl border border-teal-100 bg-teal-50/40 p-4 text-sm text-slate-700">
          {isFr ? data.narrative.fr : data.narrative.en}
        </p>
      ) : null}
      <KpiCards items={kpis} />
      <DataTable rows={data?.patterns ?? []} />
    </div>
  );
}
