"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MultiBarChart } from "@/components/charts";
import { AssetInvestigationPanel } from "@/components/asset-investigation-panel";
import { DataTable } from "@/components/data-table";
import { useAppContext } from "@/components/app-provider";
import { interpretAssetRow } from "@/lib/asset-interpretation";
import { getInventoryV2 } from "@/lib/api";
import { CHART_PRIMARY, CHART_TERTIARY } from "@/lib/chart-theme";
import { t, type Locale } from "@/lib/i18n";
import { buildEquipmentChartByType } from "@/lib/equipment-analytics";
import { buildOccurrenceMap, occurrenceEntries } from "@/lib/occurrence-counters";
import {
  buildProductCodeNamePivotRows,
  buildSerialPivotRows,
  verifyAssetPivotTotals,
} from "@/lib/asset-pivot-sheets";
import { UNLIMITED_PAGE_QUERY } from "@/lib/pagination";
import { normalizeParsedFieldKey } from "@/lib/parsed-field-value";
import { filterUniqueSerialRows } from "@/lib/serial-utils";

function normalizeField(value: unknown) {
  return normalizeParsedFieldKey(value);
}

function buildRowKey(row: Record<string, unknown>) {
  return `${String(row.snapshot_date ?? "")}|${String(row.site_id ?? "")}|${String(row.object_type ?? "")}|${String(row.product_code ?? "")}|${String(row.product_name ?? "")}|${String(row.id ?? "")}`;
}

function PremiumChartCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={`overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.07)] ${className}`}
    >
      <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-teal-50/40 px-4 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-700">{title}</p>
      </div>
      <div className="p-3">{children}</div>
    </article>
  );
}

function KpiTile({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="rounded-xl border border-teal-100/80 bg-white px-3 py-2.5 shadow-sm">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold leading-none text-slate-900">{value}</p>
    </article>
  );
}

const EQUIPMENT_TYPE_ORDER = ["CABINET", "SMOD", "BBMOD", "RMOD", "ANTL", "ALD", "RETU"];

function sortObjectTypes(types: string[]) {
  return [...types].sort((a, b) => {
    const ai = EQUIPMENT_TYPE_ORDER.indexOf(a);
    const bi = EQUIPMENT_TYPE_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function ObjectTypeFilterMultiSelect({
  selected,
  options,
  onChange,
  language,
  fr,
}: {
  selected: string[];
  options: string[];
  onChange: (value: string[]) => void;
  language: Locale;
  fr: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  const label =
    selected.length === 0
      ? fr
        ? "Type équipement — tous"
        : "Equipment type — all"
      : selected.length === 1
        ? selected[0]
        : fr
          ? `${selected.length} types sélectionnés`
          : `${selected.length} types selected`;

  const toggle = (type: string, checked: boolean) => {
    onChange(checked ? (selected.includes(type) ? selected : [...selected, type]) : selected.filter((item) => item !== type));
  };

  return (
    <div ref={rootRef} className="relative w-full shrink-0 sm:w-56">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={t(language, "inventory_object_type")}
        aria-expanded={open}
        className="flex h-8 w-full items-center justify-between rounded-xl border border-red-100 bg-white px-2.5 text-xs text-slate-700 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
      >
        <span className="truncate text-left">{label}</span>
        <span className="ml-2 shrink-0 text-[10px] text-slate-400">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+4px)] z-40 max-h-56 w-full min-w-[13rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          <div className="mb-1 flex items-center justify-between px-1.5 pt-0.5">
            <button
              type="button"
              className="text-[10px] font-semibold text-teal-700 hover:text-teal-900"
              onClick={() => onChange([...options])}
            >
              {fr ? "Tout sélectionner" : "Select all"}
            </button>
            <button
              type="button"
              className="text-[10px] font-semibold text-slate-500 hover:text-slate-700"
              onClick={() => onChange([])}
            >
              {fr ? "Effacer" : "Clear"}
            </button>
          </div>
          {options.map((type) => {
            const checked = selected.includes(type);
            return (
              <label
                key={type}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition ${
                  checked ? "bg-teal-50 text-teal-800" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 shrink-0 accent-teal-600"
                  checked={checked}
                  onChange={(event) => toggle(type, event.target.checked)}
                />
                <span className="truncate">{type}</span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function AssetsEquipmentSection({ uniqueSerialOnly }: { uniqueSerialOnly: boolean }) {
  const { payload, filters } = useAppContext();
  const fr = filters.language === "Français";
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loadError, setLoadError] = useState("");
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [investigationRow, setInvestigationRow] = useState<Record<string, unknown> | null>(null);
  const [objectTypeFilters, setObjectTypeFilters] = useState<string[]>([]);

  const hasSnapshots = payload.effective_dates.length > 0 || payload.selected_dates.length > 0;

  useEffect(() => {
    const load = async () => {
      if (!hasSnapshots) {
        setRows([]);
        setLoadError("");
        return;
      }
      try {
        const data = await getInventoryV2(payload, { ...UNLIMITED_PAGE_QUERY }, []);
        setRows(data.rows ?? []);
        setLoadError("");
      } catch (error) {
        setRows([]);
        setLoadError(error instanceof Error ? error.message : "Failed to load assets.");
      }
    };
    void load();
  }, [payload, hasSnapshots]);

  const filteredByType = useMemo(
    () =>
      rows.filter((row) => {
        if (!objectTypeFilters.length) return true;
        return objectTypeFilters.includes(String(row.object_type ?? ""));
      }),
    [rows, objectTypeFilters],
  );

  const scopedRows = useMemo(
    () => (uniqueSerialOnly ? filterUniqueSerialRows(filteredByType) : filteredByType),
    [filteredByType, uniqueSerialOnly],
  );

  const productCodeMap = useMemo(() => buildOccurrenceMap(scopedRows, "product_code", normalizeField), [scopedRows]);
  const productCodeOccurrences = useMemo(() => occurrenceEntries(productCodeMap), [productCodeMap]);

  const topProductCodeChart = useMemo(
    () =>
      productCodeOccurrences.slice(0, 12).map((entry) => ({
        product_code: entry.value,
        compteur: entry.count,
      })),
    [productCodeOccurrences],
  );

  const objectTypeOptions = useMemo(() => {
    const types = new Set<string>();
    rows.forEach((row) => {
      const type = String(row.object_type ?? "").trim();
      if (type) types.add(type);
    });
    return sortObjectTypes(Array.from(types));
  }, [rows]);

  const chartsByType = useMemo(() => buildEquipmentChartByType(scopedRows, 12), [scopedRows]);

  const registerRows = useMemo(() => {
    return scopedRows.map((row) => {
      const code = normalizeField(row.product_code);
      const qty = Number(row.nb_equipment ?? 1);
      const codeCount = code ? productCodeMap.get(code) ?? 1 : 1;
      return {
        ...row,
        _row_key: buildRowKey(row),
        compteur: Number.isFinite(qty) && qty > 0 ? qty : codeCount,
      };
    });
  }, [scopedRows, productCodeMap]);

  const productCodeNamePivotRows = useMemo(() => buildProductCodeNamePivotRows(registerRows), [registerRows]);
  const serialPivotRows = useMemo(() => buildSerialPivotRows(registerRows), [registerRows]);

  const pivotAudit = useMemo(
    () =>
      verifyAssetPivotTotals(registerRows, {
        productCodeName: productCodeNamePivotRows,
        serial: serialPivotRows,
      }),
    [registerRows, productCodeNamePivotRows, serialPivotRows],
  );

  const summary = useMemo(() => {
    const sites = new Set<string>();
    const types = new Set<string>();
    scopedRows.forEach((row) => {
      const site = String(row.site_id ?? "").trim();
      const type = String(row.object_type ?? "").trim();
      if (site) sites.add(site);
      if (type) types.add(type);
    });
    return {
      totalRows: registerRows.length,
      uniqueSites: sites.size,
      uniqueCodes: productCodeOccurrences.length,
      uniqueTypes: types.size,
    };
  }, [registerRows.length, scopedRows, productCodeOccurrences.length]);

  const openInvestigation = (row: Record<string, unknown>) => {
    const key = String(row._row_key ?? buildRowKey(row));
    setSelectedRowKey(key);
    setInvestigationRow(row);
  };

  const registerToolbar = (
    <ObjectTypeFilterMultiSelect
      selected={objectTypeFilters}
      options={objectTypeOptions}
      onChange={setObjectTypeFilters}
      language={filters.language}
      fr={fr}
    />
  );

  const objectTypeToolbar = (
    <ObjectTypeFilterMultiSelect
      selected={objectTypeFilters}
      options={objectTypeOptions}
      onChange={setObjectTypeFilters}
      language={filters.language}
      fr={fr}
    />
  );

  if (!hasSnapshots) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        {fr ? "Sélectionnez au moins un snapshot dans les filtres." : "Select at least one snapshot in filters."}
      </p>
    );
  }

  return (
    <div id="assets-equipment" className="space-y-4">
      {loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{loadError}</div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-teal-100/90 bg-gradient-to-br from-white via-teal-50/50 to-sky-50/40 p-4 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
        <div className="mb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-600">
              {t(filters.language, "table_assets_analytics_title")}
            </p>
            <h3 className="mt-1 text-lg font-extrabold tracking-tight text-slate-800">
              {t(filters.language, "table_assets_nucleus_title")}
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <KpiTile label={fr ? "Lignes assets" : "Asset rows"} value={summary.totalRows.toLocaleString()} />
          <KpiTile label={fr ? "Sites" : "Sites"} value={summary.uniqueSites.toLocaleString()} />
          <KpiTile label={fr ? "Codes produit" : "Product codes"} value={summary.uniqueCodes.toLocaleString()} />
          <KpiTile label={fr ? "Types équipement" : "Equipment types"} value={summary.uniqueTypes.toLocaleString()} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
          <PremiumChartCard title={fr ? "Top codes produit (compteur)" : "Top product codes (counter)"}>
            <MultiBarChart
              data={topProductCodeChart}
              xKey="product_code"
              height={220}
              framed={false}
              bars={[{ key: "compteur", color: CHART_TERTIARY }]}
            />
          </PremiumChartCard>
          <PremiumChartCard title={fr ? "Équipements par type" : "Equipment by type"}>
            <MultiBarChart
              data={chartsByType}
              xKey="object_type"
              height={220}
              framed={false}
              bars={[{ key: "total_equipment", color: CHART_PRIMARY }]}
            />
          </PremiumChartCard>
        </div>
      </section>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-platform-navy">
          {t(filters.language, "table_assets_register_title")}
        </p>
        <DataTable
          rows={registerRows}
          showControls
          sortableLargeDataset
          virtualize
          exportFileName={t(filters.language, "table_assets_register_title")}
          toolbarPrefix={registerToolbar}
          visibleColumns={[
            "snapshot_date",
            "site_id",
            "object_type",
            "serial_number",
            "product_name",
            "product_code",
            "compteur",
          ]}
          onRowClick={openInvestigation}
          rowSelection={{
            rowKey: "_row_key",
            selectedKeys: selectedRowKey ? [selectedRowKey] : [],
            headerLabel: fr ? "Enquête" : "Investigate",
            onToggle: (key, checked) => {
              if (checked) {
                const target = registerRows.find((row) => String(row._row_key ?? "") === key);
                if (target) openInvestigation(target);
                return;
              }
              setSelectedRowKey(null);
              setInvestigationRow(null);
            },
          }}
        />
      </div>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-2 lg:col-span-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-platform-navy">
              {t(filters.language, "table_assets_pivot_product_code_name")}
            </p>
            <p className="text-xs text-slate-500">
              {fr
                ? `${productCodeNamePivotRows.length.toLocaleString()} combinaison(s) · ${pivotAudit.actual.productCodeName.toLocaleString()} n° série (total général)`
                : `${productCodeNamePivotRows.length.toLocaleString()} combination(s) · ${pivotAudit.actual.productCodeName.toLocaleString()} serials (grand total)`}
            </p>
          </div>
          <DataTable
            rows={productCodeNamePivotRows}
            showControls
            showIndex={false}
            showSelection={false}
            compact
            sortableLargeDataset
            virtualize
            exportFileName={t(filters.language, "table_assets_pivot_product_code_name")}
            toolbarPrefix={objectTypeToolbar}
            visibleColumns={["product_name", "product_code", "serial_count"]}
          />
        </div>

        <div className="space-y-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-platform-navy">
              {t(filters.language, "table_assets_pivot_serial")}
            </p>
            <p className="text-xs text-slate-500">
              {fr
                ? `${serialPivotRows.length.toLocaleString()} n° série unique(s) · ${pivotAudit.actual.serial.toLocaleString()} occurrences (total général)`
                : `${serialPivotRows.length.toLocaleString()} unique serial(s) · ${pivotAudit.actual.serial.toLocaleString()} occurrences (grand total)`}
            </p>
          </div>
          <DataTable
            rows={serialPivotRows}
            showControls
            showIndex={false}
            showSelection={false}
            compact
            sortableLargeDataset
            virtualize
            exportFileName={t(filters.language, "table_assets_pivot_serial")}
            toolbarPrefix={objectTypeToolbar}
            visibleColumns={["serial_number", "serial_occurrence"]}
          />
        </div>
      </section>

      {!pivotAudit.isConsistent && registerRows.length > 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {fr
            ? "Vérification des totaux : écart détecté entre le registre filtré et une ou plusieurs feuilles. Rechargez la page ou vérifiez les lignes sans code/nom/serial."
            : "Totals check: mismatch between filtered register and one or more pivot sheets. Reload or review rows missing code/name/serial."}
        </p>
      ) : null}

      {investigationRow ? (
        <AssetInvestigationPanel
          open={Boolean(investigationRow)}
          title={fr ? `Asset · ${String(investigationRow.product_code ?? "-")}` : `Asset · ${String(investigationRow.product_code ?? "-")}`}
          subtitle={
            fr
              ? `Site ${String(investigationRow.site_id ?? "-")} · ${String(investigationRow.snapshot_date ?? "-")}`
              : `Site ${String(investigationRow.site_id ?? "-")} · ${String(investigationRow.snapshot_date ?? "-")}`
          }
          signal={interpretAssetRow(investigationRow, filters.language)}
          row={investigationRow}
          language={filters.language}
          payload={payload}
          uniqueSerialMode={uniqueSerialOnly}
          onClose={() => {
            setInvestigationRow(null);
            setSelectedRowKey(null);
          }}
        />
      ) : null}
    </div>
  );
}
