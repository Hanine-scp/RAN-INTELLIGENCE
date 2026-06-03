"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { PageShell } from "@/components/page-shell";
import { useAppContext } from "@/components/app-provider";
import { getSites } from "@/lib/api";
import { t } from "@/lib/i18n";

export default function SitesPage() {
  const { payload, filters } = useAppContext();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!payload.effective_dates.length && !payload.selected_dates.length) {
        setRows([]);
        return;
      }
      const data = await getSites(payload);
      setRows(data);
    };
    void load();
  }, [payload]);

  return (
    <PageShell title={t(filters.language, "page_sites_title")} subtitle="Etat des sites RAN Nokia">
      <DataTable rows={rows} />
    </PageShell>
  );
}
