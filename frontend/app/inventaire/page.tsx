"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { PageShell } from "@/components/page-shell";
import { useAppContext } from "@/components/app-provider";
import { getInventory } from "@/lib/api";
import { t } from "@/lib/i18n";

export default function InventairePage() {
  const { payload, filters } = useAppContext();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [objectTypes, setObjectTypes] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!payload.effective_dates.length && !payload.selected_dates.length) {
        setRows([]);
        setObjectTypes([]);
        return;
      }
      const data = await getInventory(payload, selected);
      setRows(data.rows);
      setObjectTypes(data.object_types);
    };
    void load();
  }, [payload, selected]);

  return (
    <PageShell title={t(filters.language, "page_inv_title")} subtitle="Inventaire hardware installe par date">
      <label className="mb-3 block text-sm font-medium text-zinc-700">
        Type equipement
        <select
          multiple
          className="mt-1 h-24 w-full rounded-xl border border-zinc-200 px-3 py-2"
          value={selected}
          onChange={(event) => setSelected(Array.from(event.target.selectedOptions, (o) => o.value))}
        >
          {objectTypes.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <DataTable rows={rows} />
    </PageShell>
  );
}
