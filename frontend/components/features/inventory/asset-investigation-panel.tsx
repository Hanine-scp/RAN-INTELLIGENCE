"use client";

import { useEffect, useMemo, useState } from "react";
import { InvestigationPanel, InvestigationSection, InvestigationStatCard } from "@/components/ui/investigation-panel";
import type { AssetSignal, SignalTone } from "@/lib/asset-interpretation";
import { signalToneClass } from "@/lib/asset-interpretation";
import { investigateSerial, investigateSite } from "@/lib/api";
import { CHART_PRIMARY, CHART_SECONDARY } from "@/lib/chart-theme";
import type { FilterPayload } from "@/lib/types";
import { normalizeSerialRaw } from "@/lib/serial-utils";

function SignalIcon({ tone }: { tone: SignalTone }) {
  const paths: Record<SignalTone, string> = {
    success: "M5 13l4 4L19 7",
    warning: "M12 9v4m0 4h.01M10.3 4.3h3.4L20 18H4L10.3 4.3z",
    critical: "M12 8v5m0 4h.01M10.3 4.3h3.4L20 18H4L10.3 4.3z",
    info: "M12 8h.01M12 12v4m9-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
    neutral: "M8 12h8",
  };
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d={paths[tone]} />
    </svg>
  );
}

type EquipmentRow = {
  snapshot_date?: string;
  site_id?: string;
  object_type?: string;
  serial_number?: string;
  product_code?: string;
  product_name?: string;
  equipment_id?: string;
};

type PivotRow = {
  product_code: string;
  product_name: string;
  serial_count: number;
  share: number;
};

type AssetInvestigationPanelProps = {
  open: boolean;
  title: string;
  subtitle: string;
  signal: AssetSignal;
  row: Record<string, unknown>;
  language: "Français" | "English";
  payload: FilterPayload;
  uniqueSerialMode?: boolean;
  onClose: () => void;
};

function buildPivotRows(equipment: EquipmentRow[]): { pivot: PivotRow[]; serials: string[]; totalSerials: number } {
  const serials: string[] = [];
  const counts = new Map<string, { product_name: string; serial_count: number }>();

  equipment.forEach((item) => {
    const serial = normalizeSerialRaw(item.serial_number);
    if (!serial) return;
    serials.push(serial);
    const code = String(item.product_code ?? "").trim() || "—";
    const name = String(item.product_name ?? "").trim() || "—";
    const current = counts.get(code);
    if (current) {
      current.serial_count += 1;
      if (current.product_name === "—" && name !== "—") current.product_name = name;
    } else {
      counts.set(code, { product_name: name, serial_count: 1 });
    }
  });

  const totalSerials = serials.length;
  const pivot = Array.from(counts.entries())
    .map(([product_code, value]) => ({
      product_code,
      product_name: value.product_name,
      serial_count: value.serial_count,
      share: totalSerials > 0 ? Math.round((value.serial_count / totalSerials) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.serial_count - a.serial_count);

  return { pivot, serials, totalSerials };
}

export function AssetInvestigationPanel({
  open,
  title,
  subtitle,
  signal,
  row,
  language,
  payload,
  uniqueSerialMode = false,
  onClose,
}: AssetInvestigationPanelProps) {
  const fr = language === "Français";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [equipment, setEquipment] = useState<EquipmentRow[]>([]);
  const [serialQuery, setSerialQuery] = useState("");
  const [pivotQuery, setPivotQuery] = useState("");

  const snapshotDate = String(row.snapshot_date ?? "");
  const siteId = String(row.site_id ?? "");
  const objectType = String(row.object_type ?? "");
  const rowSerial = normalizeSerialRaw(row.serial_number);
  const rowProductName = String(row.product_name ?? "").trim();
  const rowProductCode = String(row.product_code ?? "").trim();

  useEffect(() => {
    if (!open) return;

    const load = async () => {
      setLoading(true);
      setError("");
      setSerialQuery("");
      setPivotQuery("");
      try {
        if (uniqueSerialMode && rowSerial) {
          const data = await investigateSerial(payload, rowSerial);
          const scoped = (data.rows ?? []).filter((item) => {
            const record = item as EquipmentRow;
            if (snapshotDate && String(record.snapshot_date ?? "") !== snapshotDate) return false;
            if (siteId && String(record.site_id ?? "") !== siteId) return false;
            if (objectType && String(record.object_type ?? "") !== objectType) return false;
            return true;
          });
          setEquipment(scoped.length ? scoped : (data.rows ?? []));
          return;
        }

        if (!siteId) {
          setEquipment([]);
          setError(fr ? "Site ID manquant pour l'enquête." : "Missing site ID for investigation.");
          return;
        }

        const data = await investigateSite(payload, siteId, objectType);
        const scoped = (data.equipment ?? []).filter((item) => {
          const record = item as EquipmentRow;
          if (snapshotDate && String(record.snapshot_date ?? "") !== snapshotDate) return false;
          return true;
        });
        setEquipment(scoped);
      } catch (err) {
        setEquipment([]);
        setError(err instanceof Error ? err.message : fr ? "Échec du chargement de l'enquête." : "Investigation load failed.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [open, payload, siteId, objectType, snapshotDate, uniqueSerialMode, rowSerial, fr]);

  const analytics = useMemo(() => buildPivotRows(equipment), [equipment]);

  const filteredSerials = useMemo(() => {
    const query = serialQuery.trim().toLowerCase();
    if (!query) return analytics.serials;
    return analytics.serials.filter((serial) => serial.toLowerCase().includes(query));
  }, [analytics.serials, serialQuery]);

  const filteredPivot = useMemo(() => {
    const query = pivotQuery.trim().toLowerCase();
    if (!query) return analytics.pivot;
    return analytics.pivot.filter(
      (item) => item.product_code.toLowerCase().includes(query) || item.product_name.toLowerCase().includes(query),
    );
  }, [analytics.pivot, pivotQuery]);

  const topPivot = analytics.pivot[0];
  const uniqueProductCodes = analytics.pivot.length;
  const maxPivotCount = topPivot?.serial_count ?? 0;

  return (
    <InvestigationPanel
      open={open}
      onClose={onClose}
      eyebrow={fr ? "Enquête Assets — Analyse détaillée" : "Asset Investigation — Deep dive"}
      title={title}
      subtitle={subtitle}
      size="xl"
      loading={loading}
      loadingLabel={fr ? "Chargement des équipements..." : "Loading equipment..."}
      error={error}
      badge={
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${signalToneClass[signal.tone]}`}>
          <SignalIcon tone={signal.tone} />
          {signal.label}
        </span>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: fr ? "Date" : "Date", value: snapshotDate || "—" },
            { label: fr ? "Site" : "Site", value: siteId || "—" },
            { label: fr ? "Type" : "Type", value: objectType || "—" },
            { label: fr ? "Nom produit" : "Product name", value: rowProductName || "—" },
            { label: fr ? "Code produit" : "Product code", value: rowProductCode || "—" },
          ].map((chip) => (
            <span key={chip.label} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px]">
              <span className="font-semibold uppercase tracking-wide text-slate-500">{chip.label}</span>
              <span className="font-bold text-slate-800">{chip.value}</span>
            </span>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <InvestigationStatCard
            label={fr ? "Serial numbers" : "Serial numbers"}
            value={analytics.totalSerials.toLocaleString()}
            tone="info"
          />
          <InvestigationStatCard
            label={fr ? "Codes produit" : "Product codes"}
            value={uniqueProductCodes.toLocaleString()}
            tone="neutral"
          />
          <InvestigationStatCard
            label={fr ? "Code dominant" : "Top product code"}
            value={topPivot ? `${topPivot.product_code} (${topPivot.serial_count})` : "—"}
            tone="success"
          />
          <InvestigationStatCard
            label={fr ? "Part du top code" : "Top code share"}
            value={topPivot ? `${topPivot.share}%` : "—"}
            tone="warning"
          />
        </div>

        <InvestigationSection title={signal.title}>
          <p className="text-xs leading-relaxed text-slate-700">{signal.summary}</p>
        </InvestigationSection>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(260px,34%)_minmax(0,1fr)]">
          <InvestigationSection title={fr ? "Serial numbers" : "Serial numbers"} className="flex min-h-[280px] flex-col">
            <input
              value={serialQuery}
              onChange={(event) => setSerialQuery(event.target.value)}
              placeholder={fr ? "Rechercher un serial..." : "Search serial..."}
              className="mb-2 h-8 rounded-lg border border-red-100 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
            />
            <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-amber-100 bg-amber-50/40">
              {filteredSerials.length ? (
                <ul className="divide-y divide-amber-100/80">
                  {filteredSerials.map((serial, index) => (
                    <li key={`${serial}-${index}`} className="px-2.5 py-1.5 font-mono text-[11px] font-semibold text-slate-800">
                      {serial}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-6 text-center text-xs text-slate-500">
                  {loading ? (fr ? "Chargement..." : "Loading...") : fr ? "Aucun serial trouvé." : "No serial found."}
                </p>
              )}
            </div>
            <p className="mt-2 text-[10px] font-medium text-slate-500">
              {fr
                ? `${filteredSerials.length.toLocaleString()} serial(s) affiché(s)`
                : `${filteredSerials.length.toLocaleString()} serial(s) shown`}
            </p>
          </InvestigationSection>

          <InvestigationSection title={fr ? "Répartition par code produit (TCD)" : "Product code breakdown (pivot)"}>
            <input
              value={pivotQuery}
              onChange={(event) => setPivotQuery(event.target.value)}
              placeholder={fr ? "Filtrer code ou nom produit..." : "Filter code or product name..."}
              className="mb-2 h-8 rounded-lg border border-red-100 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
            />
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/90 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-3 py-2">{fr ? "Code produit" : "Product code"}</th>
                    <th className="px-3 py-2">{fr ? "Nom produit" : "Product name"}</th>
                    <th className="px-3 py-2 text-right">{fr ? "Nb serial numbers" : "Serial count"}</th>
                    <th className="px-3 py-2 w-[28%]">{fr ? "Répartition" : "Distribution"}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPivot.map((item, index) => {
                    const width = maxPivotCount > 0 ? Math.max(6, Math.round((item.serial_count / maxPivotCount) * 100)) : 0;
                    const barColor = index % 2 === 0 ? CHART_PRIMARY : CHART_SECONDARY;
                    return (
                      <tr key={`${item.product_code}-${index}`} className="border-t border-slate-100 bg-white even:bg-slate-50/60">
                        <td className="px-3 py-2 font-bold text-slate-900">{item.product_code}</td>
                        <td className="px-3 py-2 text-slate-600">{item.product_name}</td>
                        <td className="px-3 py-2 text-right font-extrabold text-slate-900">{item.serial_count.toLocaleString()}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 rounded-full bg-slate-100">
                              <div className="h-2 rounded-full" style={{ width: `${width}%`, backgroundColor: barColor }} />
                            </div>
                            <span className="w-10 text-right text-[10px] font-semibold text-slate-500">{item.share}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!filteredPivot.length ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-xs text-slate-500">
                        {loading ? (fr ? "Construction du tableau croisé..." : "Building pivot table...") : fr ? "Aucune donnée produit." : "No product data."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                {filteredPivot.length ? (
                  <tfoot className="border-t-2 border-slate-300 bg-slate-100/80 text-xs font-extrabold text-slate-900">
                    <tr>
                      <td className="px-3 py-2.5" colSpan={2}>
                        {fr ? "Total général" : "Grand total"}
                      </td>
                      <td className="px-3 py-2.5 text-right">{analytics.totalSerials.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-[10px] font-semibold text-slate-500">100%</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </InvestigationSection>
        </div>

        <InvestigationSection title={fr ? "Recommandations" : "Recommendations"}>
          <ul className="space-y-1.5">
            {signal.recommendations.map((item) => (
              <li key={item} className="flex items-start gap-2 text-xs text-slate-700">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-red-500" />
                {item}
              </li>
            ))}
          </ul>
        </InvestigationSection>
      </div>
    </InvestigationPanel>
  );
}
