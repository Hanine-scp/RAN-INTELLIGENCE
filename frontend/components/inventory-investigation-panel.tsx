"use client";

import { useEffect, useMemo, useState } from "react";
import { MultiBarChart } from "@/components/charts";
import { DataTable } from "@/components/data-table";
import { InvestigationPanel, InvestigationSection, InvestigationStatCard } from "@/components/investigation-panel";
import { investigateSite } from "@/lib/api";
import { CHART_PRIMARY } from "@/lib/chart-theme";
import { t } from "@/lib/i18n";
import type { FilterPayload } from "@/lib/types";

type InventoryInvestigationPanelProps = {
  open: boolean;
  row: Record<string, unknown> | null;
  language: "Français" | "English";
  payload: FilterPayload;
  onClose: () => void;
};

export function buildInventoryRowKey(row: Record<string, unknown>) {
  return `${String(row.snapshot_date ?? "")}|${String(row.site_id ?? "")}|${String(row.object_type ?? "")}|${String(row.id ?? "")}|${String(row.serial_number ?? "")}|${String(row.product_code ?? "")}`;
}

function equipmentMatchesRow(item: Record<string, unknown>, row: Record<string, unknown>) {
  return (
    String(item.snapshot_date ?? "") === String(row.snapshot_date ?? "") &&
    String(item.site_id ?? "") === String(row.site_id ?? "") &&
    String(item.object_type ?? "") === String(row.object_type ?? "") &&
    String(item.equipment_id ?? item.id ?? "") === String(row.id ?? "") &&
    String(item.serial_number ?? "") === String(row.serial_number ?? "")
  );
}

export function InventoryInvestigationPanel({
  open,
  row,
  language,
  payload,
  onClose,
}: InventoryInvestigationPanelProps) {
  const fr = language === "Français";
  const [siteHistoryRows, setSiteHistoryRows] = useState<Record<string, unknown>[]>([]);
  const [siteEquipmentRows, setSiteEquipmentRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const siteId = String(row?.site_id ?? "");

  useEffect(() => {
    const load = async () => {
      if (!open || !siteId) {
        setSiteHistoryRows([]);
        setSiteEquipmentRows([]);
        setError("");
        return;
      }
      setLoading(true);
      try {
        const data = await investigateSite(payload, siteId);
        setSiteHistoryRows(data.site_history ?? []);
        setSiteEquipmentRows(data.equipment ?? []);
        setError("");
      } catch (loadError) {
        setSiteHistoryRows([]);
        setSiteEquipmentRows([]);
        setError(loadError instanceof Error ? loadError.message : "Investigation failed.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [open, payload, siteId]);

  const latestSnapshot = siteHistoryRows[0] ?? null;

  const typeBreakdown = useMemo(() => {
    const grouped = new Map<string, number>();
    siteEquipmentRows.forEach((item) => {
      const type = String(item.object_type ?? "").trim() || "—";
      grouped.set(type, (grouped.get(type) ?? 0) + 1);
    });
    return Array.from(grouped.entries())
      .map(([object_type, total_equipment]) => ({ object_type, total_equipment }))
      .sort((a, b) => b.total_equipment - a.total_equipment);
  }, [siteEquipmentRows]);

  const uniqueSerials = useMemo(() => {
    const serials = new Set<string>();
    siteEquipmentRows.forEach((item) => {
      const serial = String(item.serial_number ?? "").trim();
      if (serial && serial !== "N/A") serials.add(serial);
    });
    return serials.size;
  }, [siteEquipmentRows]);

  const highlightedEquipment = useMemo(
    () =>
      siteEquipmentRows.map((item) => ({
        ...item,
        _signal_tone: row && equipmentMatchesRow(item, row) ? "info" : "neutral",
      })),
    [row, siteEquipmentRows],
  );

  return (
    <InvestigationPanel
      open={open}
      onClose={onClose}
      size="xl"
      eyebrow={t(language, "investigation_eyebrow")}
      title={fr ? `Site ${siteId}` : `Site ${siteId}`}
      subtitle={
        row
          ? `${String(row.object_type ?? "—")} · ${String(row.serial_number ?? "—")} · ${String(row.snapshot_date ?? "—")}`
          : fr
            ? "Enquête patrimoine équipement"
            : "Equipment heritage investigation"
      }
      loading={loading}
      loadingLabel={t(language, "loading")}
      error={error || undefined}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-5">
          <InvestigationStatCard
            label={fr ? "État site" : "Site state"}
            value={String(latestSnapshot?.site_state ?? "—")}
            tone="success"
          />
          <InvestigationStatCard label={fr ? "Équipements site" : "Site equipment"} value={siteEquipmentRows.length} />
          <InvestigationStatCard label={fr ? "Types" : "Types"} value={typeBreakdown.length} tone="info" />
          <InvestigationStatCard label={fr ? "Serials uniques" : "Unique serials"} value={uniqueSerials} />
          <InvestigationStatCard
            label={fr ? "Cellules" : "Cells"}
            value={String(latestSnapshot?.nb_cells ?? "—")}
            tone="warning"
          />
        </div>

        {row ? (
          <InvestigationSection title={fr ? "Équipement sélectionné" : "Selected equipment"}>
            <div className="grid grid-cols-1 gap-2 rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50/80 to-white p-3 md:grid-cols-2 xl:grid-cols-3">
              {[
                [fr ? "Snapshot" : "Snapshot", row.snapshot_date],
                [fr ? "Site" : "Site", row.site_id],
                [fr ? "Type" : "Type", row.object_type],
                ["ID", row.id],
                [fr ? "Serial" : "Serial", row.serial_number],
                [fr ? "Code produit" : "Product code", row.product_code],
                [fr ? "Nom produit" : "Product name", row.product_name],
                [fr ? "Quantité" : "Quantity", row.nb_equipment ?? 1],
                [fr ? "Fichier source" : "Source file", row.source_file],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border border-white/80 bg-white/90 px-2.5 py-2">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">{String(label)}</p>
                  <p className="mt-0.5 text-sm font-bold text-slate-900">{String(value ?? "—")}</p>
                </div>
              ))}
            </div>
          </InvestigationSection>
        ) : null}

        <InvestigationSection title={fr ? "Profil site" : "Site profile"}>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {[
              [fr ? "Nom site" : "Site name", latestSnapshot?.site_name],
              [fr ? "IP" : "IP", latestSnapshot?.ip_address],
              ["SW", latestSnapshot?.sw_version],
              [fr ? "Technologies" : "Technologies", latestSnapshot?.technologies],
              ["2G", latestSnapshot?.nb_cells_2g],
              ["3G", latestSnapshot?.nb_cells_3g],
              ["4G LTE", latestSnapshot?.nb_cells_lte_4g],
              ["5G", latestSnapshot?.nb_cells_5g],
              [fr ? "Historique snapshots" : "Snapshot history", siteHistoryRows.length],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border border-red-50 bg-white px-2.5 py-2">
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">{String(label)}</p>
                <p className="mt-0.5 text-sm font-bold text-slate-900">{String(value ?? "—")}</p>
              </div>
            ))}
          </div>
        </InvestigationSection>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
          <InvestigationSection title={fr ? "Répartition par type sur site" : "On-site type breakdown"} className="xl:col-span-5">
            <MultiBarChart
              data={typeBreakdown}
              xKey="object_type"
              height={180}
              framed={false}
              bars={[{ key: "total_equipment", color: CHART_PRIMARY }]}
            />
          </InvestigationSection>

          <InvestigationSection title={fr ? "Historique site" : "Site history"} className="xl:col-span-7">
            <DataTable rows={siteHistoryRows} showControls={false} showSelection={false} maxHeightClassName="max-h-[22vh]" />
          </InvestigationSection>
        </div>

        <InvestigationSection title={fr ? "Inventaire complet du site" : "Full site inventory"}>
          <DataTable
            rows={highlightedEquipment}
            showControls={false}
            showSelection={false}
            maxHeightClassName="max-h-[28vh]"
            visibleColumns={[
              "snapshot_date",
              "object_type",
              "equipment_id",
              "serial_number",
              "product_code",
              "product_name",
            ]}
          />
          {row ? (
            <p className="mt-2 text-[10px] font-medium text-sky-700">
              {fr
                ? "La ligne sélectionnée est surlignée dans l'inventaire site."
                : "The selected row is highlighted in the site inventory."}
            </p>
          ) : null}
        </InvestigationSection>
      </div>
    </InvestigationPanel>
  );
}
