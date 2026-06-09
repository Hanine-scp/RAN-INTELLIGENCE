"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import { KpiCards } from "@/components/kpi-cards";
import { PageShell } from "@/components/page-shell";
import { useAppContext } from "@/components/app-provider";
import { getRiskCards } from "@/lib/api";
import { t } from "@/lib/i18n";

export default function RiskCardsPage() {
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

  return (
    <PageShell title={t(filters.language, "page_risk_cards_title")} subtitle={t(filters.language, "subtitle_risk_cards")}>
      <KpiCards items={kpis} />
      <DataTable rows={data?.rows ?? []} />
    </PageShell>
  );
}
