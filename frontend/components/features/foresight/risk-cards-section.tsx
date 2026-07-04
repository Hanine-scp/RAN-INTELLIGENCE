"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/ui/data-table";
import { KpiCards } from "@/components/ui/kpi-cards";
import { useAppContext } from "@/components/providers/app-provider";
import { getRiskCards } from "@/lib/api";
import { t } from "@/lib/i18n";

export function RiskCardsSection() {
  const { payload, filters } = useAppContext();
  const isFr = filters.language === "Français";
  const [data, setData] = useState<Awaited<ReturnType<typeof getRiskCards>> | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!payload.effective_dates.length && !payload.selected_dates.length) {
        setData(null);
        return;
      }
      setData(await getRiskCards(payload));
    };
    void load();
  }, [payload]);

  const kpis = useMemo(
    () => [
      { label: isFr ? "Cartes à risque élevé" : "High risk cards", value: String(data?.summary.high_risk_cards ?? 0) },
      { label: isFr ? "Total signalé" : "Total flagged", value: String(data?.summary.total_flagged ?? 0) },
      { label: "Spares", value: String(data?.summary.from_spares ?? 0) },
      { label: "Anomalies", value: String(data?.summary.from_anomalies ?? 0) },
    ],
    [data, isFr],
  );

  if (!payload.effective_dates.length && !payload.selected_dates.length) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        {t(filters.language, "warning_dates")}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <KpiCards items={kpis} />
      <DataTable rows={data?.rows ?? []} />
    </div>
  );
}
