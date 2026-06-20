"use client";

import { useEffect, useMemo, useState } from "react";
import { AssetInvestigationPanel } from "@/components/asset-investigation-panel";
import { DataTable } from "@/components/data-table";
import { UniqueSerialFilterToggle } from "@/components/unique-serial-filter-toggle";
import { useAppContext } from "@/components/app-provider";
import {
  buildAssetRowKey,
  buildProductRowKey,
  interpretAssetRow,
  interpretProductCodeRow,
  type AssetSignal,
} from "@/lib/asset-interpretation";
import { getAssetDistributionV2, getAssetProductCodesV2, getInventoryV2 } from "@/lib/api";
import { t } from "@/lib/i18n";
import { UNLIMITED_PAGE_QUERY } from "@/lib/pagination";
import { normalizeSerialRaw } from "@/lib/serial-utils";
import { CHART_PRIMARY, CHART_RING_TRACK } from "@/lib/chart-theme";

type InvestigationState = {
  kind: "asset" | "product";
  row: Record<string, unknown>;
  signal: AssetSignal;
  title: string;
  subtitle: string;
} | null;

function buildEquipmentGroupKey(row: Record<string, unknown>) {
  return `${String(row.snapshot_date ?? "")}|${String(row.site_id ?? "")}|${String(row.object_type ?? "")}`;
}

function withSignalColumn(row: Record<string, unknown>, signal: AssetSignal, rowKey: string) {
  return {
    signal: signal.label,
    ...row,
    _signal_tone: signal.tone,
    _row_key: rowKey,
  };
}

export function AssetDistributionSection() {
  const { payload, filters } = useAppContext();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [productCodeRows, setProductCodeRows] = useState<Record<string, unknown>[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown>>({});
  const [objectTypes, setObjectTypes] = useState<string[]>([]);
  const [selectedObjectTypes, setSelectedObjectTypes] = useState<string[]>([]);
  const [objectTypeQuery, setObjectTypeQuery] = useState("");
  const [objectTypeOpen, setObjectTypeOpen] = useState(false);
  const [uniqueSerialOnly, setUniqueSerialOnly] = useState(false);
  const [assetSignalFilter, setAssetSignalFilter] = useState("");
  const [assetSiteFilter, setAssetSiteFilter] = useState("");
  const [assetTypeFilter, setAssetTypeFilter] = useState("");
  const [assetDateFilter, setAssetDateFilter] = useState("");
  const [assetDupFilter, setAssetDupFilter] = useState("");
  const [assetSerialOccurrenceFilter, setAssetSerialOccurrenceFilter] = useState("");
  const [assetProductNameFilter, setAssetProductNameFilter] = useState("");
  const [assetProductCodeFilter, setAssetProductCodeFilter] = useState("");
  const [productNameFilter, setProductNameFilter] = useState("");
  const [productCodeFilter, setProductCodeFilter] = useState("");
  const [equipmentRows, setEquipmentRows] = useState<Record<string, unknown>[]>([]);
  const [productSearchInput, setProductSearchInput] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productSearchEnabled, setProductSearchEnabled] = useState(false);
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [investigation, setInvestigation] = useState<InvestigationState>(null);
  const [selectedAssetKey, setSelectedAssetKey] = useState<string | null>(null);
  const [selectedProductKey, setSelectedProductKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const pageSize = UNLIMITED_PAGE_QUERY.page_size;
  const fr = filters.language === "Français";
  const serialKey = (value: unknown) => normalizeSerialRaw(value);

  const hasSnapshotSelection = payload.effective_dates.length > 0 || payload.selected_dates.length > 0;

  useEffect(() => {
    const load = async () => {
      if (!hasSnapshotSelection) {
        setRows((prev) => (prev.length === 0 ? prev : []));
        setProductCodeRows((prev) => (prev.length === 0 ? prev : []));
        setSummary((prev) => (Object.keys(prev).length === 0 ? prev : {}));
        setObjectTypes((prev) => (prev.length === 0 ? prev : []));
        setEquipmentRows((prev) => (prev.length === 0 ? prev : []));
        setLoadError("");
        return;
      }
      try {
        const [assetData, productData, objectTypeCatalog, inventoryData] = await Promise.all([
          getAssetDistributionV2(payload, { ...UNLIMITED_PAGE_QUERY, unique_serial_only: uniqueSerialOnly }, selectedObjectTypes),
          getAssetProductCodesV2(
            payload,
            {
              ...UNLIMITED_PAGE_QUERY,
              unique_serial_only: false,
              pivot_product_code: true,
              search: productSearchEnabled ? productSearch : "",
            },
            selectedObjectTypes,
          ),
          getAssetDistributionV2(payload, { ...UNLIMITED_PAGE_QUERY, unique_serial_only: false }, []),
          getInventoryV2(payload, { ...UNLIMITED_PAGE_QUERY }, selectedObjectTypes),
        ]);
        setRows(assetData.rows);
        setObjectTypes(objectTypeCatalog.object_types ?? []);
        setSummary(assetData.summary ?? {});
        setProductCodeRows(productData.rows ?? []);
        setEquipmentRows(inventoryData.rows ?? []);
        setLoadError("");
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Failed to load asset distribution.");
      }
    };
    void load();
  }, [payload, hasSnapshotSelection, selectedObjectTypes, uniqueSerialOnly, productSearch, productSearchEnabled]);

  const filteredObjectTypes = useMemo(() => {
    const normalized = objectTypeQuery.trim().toLowerCase();
    if (!normalized) return objectTypes;
    return objectTypes.filter((value) => value.toLowerCase().includes(normalized));
  }, [objectTypeQuery, objectTypes]);

  const productSearchSuggestions = useMemo(() => {
    const normalized = productSearchInput.trim().toLowerCase();
    if (!normalized) return [];
    return objectTypes
      .filter((value) => value.toLowerCase().includes(normalized))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(normalized) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(normalized) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.localeCompare(b);
      })
      .slice(0, 12);
  }, [productSearchInput, objectTypes]);

  const applyProductSearch = (value: string) => {
    const next = value.trim();
    setProductSearchInput(next);
    setProductSearchOpen(false);
    if (!productSearchEnabled) return;
    setProductSearch(next);
  };

  const clearProductSearch = () => {
    setProductSearchInput("");
    setProductSearch("");
    setProductSearchOpen(false);
  };

  const toggleProductSearchEnabled = (enabled: boolean) => {
    setProductSearchEnabled(enabled);
    setProductSearch(enabled ? productSearchInput.trim() : "");
  };

  const kpiView = useMemo(() => {
    const totalAssets = Number(summary.total_assets ?? 0);
    const totalSites = Number(summary.total_sites ?? 0);
    const objectTypesCount = Number(summary.total_object_types ?? 0);
    const avgAssetsPerSite = Number(summary.avg_assets_per_site ?? 0);
    const normalizedTypeRate = Math.min(100, Math.round((objectTypesCount / 20) * 100));
    const assetsPerSiteRate = Math.min(100, Math.round((avgAssetsPerSite / 200) * 100));
    const sitesCoverageRate = totalAssets > 0 ? Math.min(100, Math.round((totalSites / totalAssets) * 1000)) : 0;
    return {
      totalAssets,
      totalSites,
      objectTypesCount,
      avgAssetsPerSite,
      normalizedTypeRate,
      assetsPerSiteRate,
      sitesCoverageRate,
    };
  }, [summary]);

  const serialOccurrenceMap = useMemo(() => {
    const counts = new Map<string, number>();
    equipmentRows.forEach((row) => {
      const serial = serialKey(row.serial_number);
      if (!serial) return;
      counts.set(serial, (counts.get(serial) ?? 0) + 1);
    });
    return counts;
  }, [equipmentRows]);

  const equipmentByGroupKey = useMemo(() => {
    const map = new Map<string, Record<string, unknown>[]>();
    equipmentRows.forEach((row) => {
      const key = buildEquipmentGroupKey(row);
      const bucket = map.get(key);
      if (bucket) {
        bucket.push(row);
      } else {
        map.set(key, [row]);
      }
    });
    return map;
  }, [equipmentRows]);

  const assetTableRows = useMemo(
    () =>
      rows.map((row) => {
        const signal = interpretAssetRow(row, filters.language);
        const serial = serialKey(row.serial_number);
        const enriched = {
          ...row,
          ...(serial ? { serial_occurrence: serialOccurrenceMap.get(serial) ?? 1 } : {}),
        };
        return withSignalColumn(enriched, signal, buildAssetRowKey(row));
      }),
    [rows, filters.language, serialOccurrenceMap],
  );

  const matchesSerialOccurrence = (serial: string, occurrenceFilter: string) => {
    if (!occurrenceFilter) return true;
    const count = serialOccurrenceMap.get(serial) ?? 0;
    if (occurrenceFilter === "2plus") return count >= 2;
    const target = Number(occurrenceFilter);
    return Number.isFinite(target) && count === target;
  };

  const matchesEquipmentScope = (groupKey: string, record?: Record<string, unknown>) => {
    const productNameQuery = assetProductNameFilter.trim().toLowerCase();
    const productCodeQuery = assetProductCodeFilter.trim().toLowerCase();
    const occurrenceFilter = assetSerialOccurrenceFilter.trim();
    const serial = record ? serialKey(record.serial_number) : "";

    if (serial) {
      if (!matchesSerialOccurrence(serial, occurrenceFilter)) return false;
      if (productNameQuery && !String(record?.product_name ?? "").toLowerCase().includes(productNameQuery)) return false;
      if (productCodeQuery && !String(record?.product_code ?? "").toLowerCase().includes(productCodeQuery)) return false;
      return true;
    }

    const scopedEquipment = equipmentByGroupKey.get(groupKey) ?? [];
    if (!occurrenceFilter && !productNameQuery && !productCodeQuery) return true;
    if (!scopedEquipment.length) return false;

    return scopedEquipment.some((item) => {
      const itemSerial = serialKey(item.serial_number);
      if (occurrenceFilter && (!itemSerial || !matchesSerialOccurrence(itemSerial, occurrenceFilter))) return false;
      if (productNameQuery && !String(item.product_name ?? "").toLowerCase().includes(productNameQuery)) return false;
      if (productCodeQuery && !String(item.product_code ?? "").toLowerCase().includes(productCodeQuery)) return false;
      return true;
    });
  };

  const filteredAssetTableRows = useMemo(() => {
    const siteQuery = assetSiteFilter.trim().toLowerCase();
    const typeQuery = assetTypeFilter.trim().toLowerCase();
    const dateQuery = assetDateFilter.trim().toLowerCase();
    const dupQuery = assetDupFilter.trim();
    return assetTableRows.filter((row) => {
      const record = row as Record<string, unknown>;
      if (assetSignalFilter && String(row.signal ?? "") !== assetSignalFilter) return false;
      if (siteQuery && !String(record.site_id ?? "").toLowerCase().includes(siteQuery)) return false;
      if (typeQuery && !String(record.object_type ?? "").toLowerCase().includes(typeQuery)) return false;
      if (dateQuery && !String(record.snapshot_date ?? "").toLowerCase().includes(dateQuery)) return false;
      if (dupQuery === "with" && Number(record.duplicated_serials ?? 0) <= 0) return false;
      if (dupQuery === "without" && Number(record.duplicated_serials ?? 0) > 0) return false;
      const groupKey = buildEquipmentGroupKey(record);
      if (!matchesEquipmentScope(groupKey, uniqueSerialOnly ? record : undefined)) return false;
      return true;
    });
  }, [
    assetTableRows,
    assetSignalFilter,
    assetSiteFilter,
    assetTypeFilter,
    assetDateFilter,
    assetDupFilter,
    assetSerialOccurrenceFilter,
    assetProductNameFilter,
    assetProductCodeFilter,
    equipmentByGroupKey,
    serialOccurrenceMap,
    uniqueSerialOnly,
  ]);

  const productTableRows = useMemo(
    () =>
      productCodeRows.map((row) => ({
        ...row,
        _row_key: buildProductRowKey(row),
      })),
    [productCodeRows],
  );

  const filteredProductTableRows = useMemo(() => {
    const nameQuery = productNameFilter.trim().toLowerCase();
    const codeQuery = productCodeFilter.trim().toLowerCase();
    return productTableRows.filter((row) => {
      const record = row as Record<string, unknown>;
      if (nameQuery && !String(record.product_name ?? "").toLowerCase().includes(nameQuery)) return false;
      if (codeQuery && !String(record.product_code ?? "").toLowerCase().includes(codeQuery)) return false;
      if (productSearchEnabled && productSearch.trim()) {
        const searchQuery = productSearch.trim().toLowerCase();
        const haystack = [
          String(record.object_type ?? ""),
          String(record.product_name ?? ""),
          String(record.product_code ?? ""),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(searchQuery)) return false;
      }
      return true;
    });
  }, [productTableRows, productNameFilter, productCodeFilter, productSearch, productSearchEnabled]);

  const assetSignalLegend = useMemo(
    () =>
      fr
        ? [
            { label: "Pivot", desc: "Concentration réseau critique" },
            { label: "Dominant", desc: "Type majoritaire sur le site" },
            { label: "Fort", desc: "Contribution réseau élevée" },
            { label: "Risque", desc: "Anomalie serial détectée" },
            { label: "Équilibré", desc: "Répartition saine" },
            { label: "Mineur", desc: "Impact limité" },
          ]
        : [
            { label: "Pivot", desc: "Critical network concentration" },
            { label: "Dominant", desc: "Major type on site" },
            { label: "Strong", desc: "High network contribution" },
            { label: "Risk", desc: "Serial anomaly detected" },
            { label: "Balanced", desc: "Healthy distribution" },
            { label: "Minor", desc: "Limited impact" },
          ],
    [fr],
  );

  const openAssetInvestigation = (row: Record<string, unknown>) => {
    const key = String(row._row_key ?? buildAssetRowKey(row));
    const signal = interpretAssetRow(row, filters.language);
    setSelectedAssetKey(key);
    setSelectedProductKey(null);
    setInvestigation({
      kind: "asset",
      row,
      signal,
      title: fr ? `Site ${String(row.site_id ?? "-")} · ${String(row.object_type ?? "-")}` : `Site ${String(row.site_id ?? "-")} · ${String(row.object_type ?? "-")}`,
      subtitle: fr
        ? `Snapshot ${String(row.snapshot_date ?? "-")} — analyse structurelle`
        : `Snapshot ${String(row.snapshot_date ?? "-")} — structural analysis`,
    });
  };

  const openProductInvestigation = (row: Record<string, unknown>) => {
    const key = String(row._row_key ?? buildProductRowKey(row));
    const signal = interpretProductCodeRow(row, filters.language);
    setSelectedProductKey(key);
    setSelectedAssetKey(null);
    setInvestigation({
      kind: "product",
      row,
      signal,
      title: String(row.product_name ?? row.product_code ?? "-"),
      subtitle: fr
        ? `Code ${String(row.product_code ?? "-")} · ${String(row.object_type ?? "-")}`
        : `Code ${String(row.product_code ?? "-")} · ${String(row.object_type ?? "-")}`,
    });
  };

  return (
    <div id="asset-repartition" className="space-y-3">
      {loadError ? (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {loadError}
        </div>
      ) : null}
      {!hasSnapshotSelection ? (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {fr ? "Sélectionnez au moins un snapshot dans les filtres pour afficher les assets." : "Select at least one snapshot in filters to display assets."}
        </div>
      ) : null}
      <section className="mb-3 rounded-2xl border border-red-100 bg-white p-3 shadow-[0_12px_28px_rgba(220,38,38,0.08)]">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border border-red-100 bg-gradient-to-r from-red-50/70 to-white p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-red-700">Total assets</p>
            <p className="mt-1 text-3xl font-extrabold leading-none text-slate-900">{kpiView.totalAssets.toLocaleString()}</p>
          </article>

          <article className="rounded-xl border border-red-100 bg-gradient-to-r from-red-50/70 to-white p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-red-700">Total sites</p>
            <p className="mt-1 text-3xl font-extrabold leading-none text-red-700">{kpiView.totalSites.toLocaleString()}</p>
          </article>

          <article className="rounded-xl border border-red-100 bg-white p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-red-700">Avg assets / site</p>
            <div className="mt-3 flex items-center gap-3">
              <div
                className="relative h-12 w-12 rounded-full"
                style={{ background: `conic-gradient(${CHART_PRIMARY} ${kpiView.assetsPerSiteRate}%, ${CHART_RING_TRACK} 0)` }}
              >
                <div className="absolute inset-[5px] rounded-full bg-white" />
              </div>
              <div>
                <p className="text-2xl font-extrabold leading-none text-slate-900">{kpiView.avgAssetsPerSite}</p>
                <p className="mt-1 text-[10px] font-medium text-slate-500">
                  {filters.language === "Français" ? "Moyenne par site" : "Average per site"}
                </p>
              </div>
            </div>
          </article>

          <article className="rounded-xl border border-red-100 bg-white p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-red-700">
              {filters.language === "Français" ? "Indicateurs structure" : "Structure indicators"}
            </p>
            <div className="mt-3 space-y-3">
              <div>
                <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-slate-600">
                  <span>{filters.language === "Français" ? "Couverture sites" : "Sites coverage"}</span>
                  <span>{kpiView.sitesCoverageRate}%</span>
                </div>
                <div className="h-2 rounded-full bg-red-100">
                  <div className="h-2 rounded-full bg-red-500" style={{ width: `${kpiView.sitesCoverageRate}%` }} />
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-slate-600">
                  <span>{filters.language === "Français" ? "Diversité types" : "Type diversity"}</span>
                  <span>{kpiView.normalizedTypeRate}%</span>
                </div>
                <div className="h-2 rounded-full bg-red-100">
                  <div className="h-2 rounded-full bg-red-400" style={{ width: `${kpiView.normalizedTypeRate}%` }} />
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>
      <section className="rounded-2xl border border-red-100 bg-gradient-to-b from-white to-red-50/20 p-3 shadow-[0_8px_24px_rgba(220,38,38,0.08)]">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-red-700">{t(filters.language, "inventory_object_type")}</p>
          <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-2.5 py-1">
            <span className="text-[10px] font-medium text-slate-500">{filters.language === "Français" ? "Sélection" : "Selection"}</span>
            <span className="text-[11px] font-bold text-red-700">{selectedObjectTypes.length}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            setObjectTypeOpen((prev) => {
              const next = !prev;
              if (next) {
                setObjectTypeQuery("");
              }
              return next;
            })
          }
          className="mb-2 flex w-full items-center justify-between rounded-xl border border-red-200 bg-white px-3 py-2 text-left text-xs text-slate-700 transition-all hover:border-red-300 hover:shadow-[0_4px_14px_rgba(220,38,38,0.08)]"
        >
          <span className="truncate pr-3">
            {selectedObjectTypes.length
              ? `${selectedObjectTypes.length} ${filters.language === "Français" ? "type(s) sélectionné(s)" : "selected type(s)"}`
              : filters.language === "Français"
                ? "Cliquez pour sélectionner les types"
                : "Click to select types"}
          </span>
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-red-50 text-[10px] font-semibold text-red-700">
            {objectTypeOpen ? "−" : "+"}
          </span>
        </button>

        {selectedObjectTypes.length ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {selectedObjectTypes.slice(0, 8).map((value) => (
              <span key={`selected-${value}`} className="rounded-full border border-red-200 bg-white px-2 py-0.5 text-[10px] font-medium text-red-700">
                {value}
              </span>
            ))}
            {selectedObjectTypes.length > 8 ? (
              <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                +{selectedObjectTypes.length - 8}
              </span>
            ) : null}
          </div>
        ) : null}

        {objectTypeOpen ? (
          <div className="rounded-xl border border-red-100 bg-white p-3">
            <div className="mb-2 grid grid-cols-1 gap-2 lg:grid-cols-[1fr_auto_auto_auto]">
              <input
                value={objectTypeQuery}
                onChange={(event) => setObjectTypeQuery(event.target.value)}
                placeholder={filters.language === "Français" ? "Recherche type équipement..." : "Search equipment type..."}
                className="h-9 rounded-xl border border-red-100 bg-red-50/20 px-3 text-xs text-slate-700 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
              />
              <button
                type="button"
                onClick={() => {
                  setSelectedObjectTypes(filteredObjectTypes);
                }}
                className="h-9 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                disabled={!filteredObjectTypes.length}
              >
                {filters.language === "Français" ? "Tout sélectionner" : "Select all"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedObjectTypes([]);
                }}
                className="h-9 rounded-xl border border-red-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-red-50"
              >
                {filters.language === "Français" ? "Désélectionner tout" : "Deselect all"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedObjectTypes((prev) => objectTypes.filter((item) => !prev.includes(item)));
                }}
                className="h-9 rounded-xl border border-red-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-red-50"
                disabled={!objectTypes.length}
              >
                {filters.language === "Français" ? "Inverser sélection" : "Invert selection"}
              </button>
            </div>

            <div className="max-h-56 overflow-auto rounded-xl border border-red-100 bg-red-50/20 p-2">
              {filteredObjectTypes.map((value) => {
                const active = selectedObjectTypes.includes(value);
                return (
                  <label
                    key={value}
                    className={`mb-1 flex w-full cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-xs transition ${
                      active
                        ? "border-red-200 bg-white text-red-700 shadow-[0_3px_8px_rgba(220,38,38,0.06)]"
                        : "border-transparent bg-transparent text-slate-700 hover:border-red-100 hover:bg-white"
                    }`}
                  >
                    <span className="font-medium">{value}</span>
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setSelectedObjectTypes((prev) => {
                          return checked ? (prev.includes(value) ? prev : [...prev, value]) : prev.filter((item) => item !== value);
                        });
                      }}
                      className="h-3.5 w-3.5 accent-red-600"
                    />
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>
      {!uniqueSerialOnly ? (
        <section className="mb-3 rounded-2xl border border-red-100 bg-white p-3 shadow-[0_8px_24px_rgba(220,38,38,0.06)]">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-red-700">
            {fr ? "Filtres tableau répartition" : "Distribution table filters"}
          </p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
            <select
              value={assetSignalFilter}
              onChange={(event) => setAssetSignalFilter(event.target.value)}
              className="h-9 rounded-xl border border-red-100 bg-red-50/20 px-3 text-xs text-slate-700 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
            >
              <option value="">{fr ? "Signal — tous" : "Signal — all"}</option>
              {assetSignalLegend.map((item) => (
                <option key={item.label} value={item.label}>
                  {item.label}
                </option>
              ))}
            </select>
            <input
              value={assetSiteFilter}
              onChange={(event) => setAssetSiteFilter(event.target.value)}
              placeholder={fr ? "Filtrer ID site" : "Filter site ID"}
              className="h-9 rounded-xl border border-red-100 bg-red-50/20 px-3 text-xs text-slate-700 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
            />
            <input
              value={assetTypeFilter}
              onChange={(event) => setAssetTypeFilter(event.target.value)}
              placeholder={fr ? "Filtrer type équipement" : "Filter equipment type"}
              className="h-9 rounded-xl border border-red-100 bg-red-50/20 px-3 text-xs text-slate-700 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
            />
            <input
              value={assetDateFilter}
              onChange={(event) => setAssetDateFilter(event.target.value)}
              placeholder={fr ? "Filtrer date snapshot" : "Filter snapshot date"}
              className="h-9 rounded-xl border border-red-100 bg-red-50/20 px-3 text-xs text-slate-700 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
            />
            <select
              value={assetDupFilter}
              onChange={(event) => setAssetDupFilter(event.target.value)}
              className="h-9 rounded-xl border border-red-100 bg-red-50/20 px-3 text-xs text-slate-700 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
            >
              <option value="">{fr ? "Serials dupliqués — tous" : "Duplicated serials — all"}</option>
              <option value="with">{fr ? "Avec doublons serial" : "With duplicate serials"}</option>
              <option value="without">{fr ? "Sans doublons serial" : "Without duplicate serials"}</option>
            </select>
            <select
              value={assetSerialOccurrenceFilter}
              onChange={(event) => setAssetSerialOccurrenceFilter(event.target.value)}
              className="h-9 rounded-xl border border-red-100 bg-red-50/20 px-3 text-xs text-slate-700 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
            >
              <option value="">{fr ? "Occurrence serial — toutes" : "Serial occurrence — all"}</option>
              <option value="1">{fr ? "Occurrence = 1 (unique)" : "Occurrence = 1 (unique)"}</option>
              <option value="2">{fr ? "Occurrence = 2" : "Occurrence = 2"}</option>
              <option value="3">{fr ? "Occurrence = 3" : "Occurrence = 3"}</option>
              <option value="2plus">{fr ? "Occurrence ≥ 2 (doublon)" : "Occurrence ≥ 2 (duplicate)"}</option>
            </select>
            <input
              value={assetProductNameFilter}
              onChange={(event) => setAssetProductNameFilter(event.target.value)}
              placeholder={fr ? "Filtrer nom produit" : "Filter product name"}
              className="h-9 rounded-xl border border-red-100 bg-red-50/20 px-3 text-xs text-slate-700 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
            />
            <input
              value={assetProductCodeFilter}
              onChange={(event) => setAssetProductCodeFilter(event.target.value)}
              placeholder={fr ? "Filtrer code produit" : "Filter product code"}
              className="h-9 rounded-xl border border-red-100 bg-red-50/20 px-3 text-xs text-slate-700 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
            />
          </div>
          <p className="mt-2 text-[10px] font-medium text-slate-500">
            {fr
              ? `${filteredAssetTableRows.length.toLocaleString()} ligne(s) sur ${assetTableRows.length.toLocaleString()}`
              : `${filteredAssetTableRows.length.toLocaleString()} row(s) of ${assetTableRows.length.toLocaleString()}`}
          </p>
        </section>
      ) : (
        <section className="mb-3 rounded-2xl border border-red-100 bg-white p-3 shadow-[0_8px_24px_rgba(220,38,38,0.06)]">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-red-700">
            {fr ? "Filtres serial numbers" : "Serial number filters"}
          </p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
            <select
              value={assetSerialOccurrenceFilter}
              onChange={(event) => setAssetSerialOccurrenceFilter(event.target.value)}
              className="h-9 rounded-xl border border-red-100 bg-red-50/20 px-3 text-xs text-slate-700 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
            >
              <option value="">{fr ? "Occurrence serial — toutes" : "Serial occurrence — all"}</option>
              <option value="1">{fr ? "Occurrence = 1 (unique)" : "Occurrence = 1 (unique)"}</option>
              <option value="2">{fr ? "Occurrence = 2" : "Occurrence = 2"}</option>
              <option value="3">{fr ? "Occurrence = 3" : "Occurrence = 3"}</option>
              <option value="2plus">{fr ? "Occurrence ≥ 2 (doublon)" : "Occurrence ≥ 2 (duplicate)"}</option>
            </select>
            <input
              value={assetProductNameFilter}
              onChange={(event) => setAssetProductNameFilter(event.target.value)}
              placeholder={fr ? "Filtrer nom produit" : "Filter product name"}
              className="h-9 rounded-xl border border-red-100 bg-red-50/20 px-3 text-xs text-slate-700 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
            />
            <input
              value={assetProductCodeFilter}
              onChange={(event) => setAssetProductCodeFilter(event.target.value)}
              placeholder={fr ? "Filtrer code produit" : "Filter product code"}
              className="h-9 rounded-xl border border-red-100 bg-red-50/20 px-3 text-xs text-slate-700 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
            />
            <input
              value={assetSiteFilter}
              onChange={(event) => setAssetSiteFilter(event.target.value)}
              placeholder={fr ? "Filtrer ID site" : "Filter site ID"}
              className="h-9 rounded-xl border border-red-100 bg-red-50/20 px-3 text-xs text-slate-700 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
            />
          </div>
          <p className="mt-2 text-[10px] font-medium text-slate-500">
            {fr
              ? `${filteredAssetTableRows.length.toLocaleString()} serial(s) sur ${assetTableRows.length.toLocaleString()} · compteur global a=2 signifie 2 occurrences du serial « a »`
              : `${filteredAssetTableRows.length.toLocaleString()} serial(s) of ${assetTableRows.length.toLocaleString()} · global counter a=2 means serial "a" appears twice`}
          </p>
        </section>
      )}
      <section className="mb-3 rounded-2xl border border-red-100 bg-gradient-to-r from-white to-red-50/20 p-3 shadow-[0_8px_24px_rgba(220,38,38,0.06)]">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-red-700">
            {fr ? "Interprétation — répartition site / type" : "Interpretation — site / type split"}
          </p>
          <p className="text-[10px] font-medium text-slate-500">
            {fr ? "Cliquez une ligne pour ouvrir l'enquête" : "Click a row to open investigation"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {assetSignalLegend.map((item) => (
            <div key={item.label} className="rounded-xl border border-red-100 bg-white px-2.5 py-2">
              <p className="text-xs font-bold text-red-700">{item.label}</p>
              <p className="text-[10px] text-slate-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <DataTable
        rows={filteredAssetTableRows}
        showControls={true}
        showSelection={true}
        exportFileName="ran_assets_distribution"
        toolbarPrefix={
          <UniqueSerialFilterToggle
            checked={uniqueSerialOnly}
            onChange={setUniqueSerialOnly}
            language={filters.language}
          />
        }
        visibleColumns={
          uniqueSerialOnly
            ? ["signal", "snapshot_date", "site_id", "object_type", "serial_number", "serial_occurrence", "product_name", "product_code", "nb_equipment"]
            : undefined
        }
        onRowClick={openAssetInvestigation}
        rowSelection={{
          rowKey: "_row_key",
          selectedKeys: selectedAssetKey ? [selectedAssetKey] : [],
          headerLabel: fr ? "Enquête" : "Investigate",
          onToggle: (key, checked) => {
            if (checked) {
              const target = filteredAssetTableRows.find((row) => String(row._row_key ?? "") === key);
              if (target) openAssetInvestigation(target);
              return;
            }
            setSelectedAssetKey(null);
            setInvestigation(null);
          },
        }}
      />

      <section className="mt-4 space-y-2 rounded-2xl border border-red-100 bg-white p-3 shadow-[0_8px_24px_rgba(220,38,38,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-red-700">
            {fr ? "Répartition par code produit" : "Product code distribution"}
          </p>
          <p className="text-[10px] font-medium text-slate-500">
            {fr ? "Cliquez une ligne pour ouvrir l'enquête" : "Click a row to open investigation"}
          </p>
        </div>
        <div className="relative rounded-xl border border-red-100 bg-red-50/20 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-red-700">
            {fr ? "Filtres tableau codes produit" : "Product code table filters"}
          </p>
          <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
            <input
              value={productNameFilter}
              onChange={(event) => setProductNameFilter(event.target.value)}
              placeholder={fr ? "Filtrer nom produit" : "Filter product name"}
              className="h-9 rounded-xl border border-red-100 bg-white px-3 text-xs text-slate-700 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
            />
            <input
              value={productCodeFilter}
              onChange={(event) => setProductCodeFilter(event.target.value)}
              placeholder={fr ? "Filtrer code produit" : "Filter product code"}
              className="h-9 rounded-xl border border-red-100 bg-white px-3 text-xs text-slate-700 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
            />
          </div>
          <label className="mb-2 flex cursor-pointer items-center justify-between gap-3 text-xs">
            <span className="font-medium text-slate-700">
              {fr ? "Activer le filtre de recherche" : "Enable search filter"}
            </span>
            <input
              type="checkbox"
              checked={productSearchEnabled}
              onChange={(event) => toggleProductSearchEnabled(event.target.checked)}
              className="h-4 w-4 accent-red-600"
            />
          </label>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_auto_auto]">
            <div className="relative">
              <input
                value={productSearchInput}
                onChange={(event) => {
                  setProductSearchInput(event.target.value);
                  setProductSearchOpen(true);
                }}
                onFocus={() => setProductSearchOpen(true)}
                onBlur={() => {
                  window.setTimeout(() => setProductSearchOpen(false), 120);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (!productSearchEnabled) return;
                    if (productSearchSuggestions.length === 1) {
                      applyProductSearch(productSearchSuggestions[0]);
                      return;
                    }
                    applyProductSearch(productSearchInput);
                  }
                  if (event.key === "Escape") {
                    setProductSearchOpen(false);
                  }
                }}
                placeholder={fr ? "Recherche" : "Search"}
                className="h-9 w-full rounded-xl border border-red-100 bg-white px-3 text-xs text-slate-700 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
              />
              {productSearchOpen && productSearchSuggestions.length ? (
                <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-48 overflow-auto rounded-xl border border-red-100 bg-white p-1 shadow-[0_8px_24px_rgba(220,38,38,0.12)]">
                  {productSearchSuggestions.map((value) => (
                    <button
                      key={`product-suggest-${value}`}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setProductSearchInput(value);
                        setProductSearchOpen(false);
                        if (productSearchEnabled) {
                          setProductSearch(value.trim());
                        }
                      }}
                      className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-red-50 hover:text-red-700"
                    >
                      {value}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => applyProductSearch(productSearchInput)}
              disabled={!productSearchEnabled}
              className="h-9 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {fr ? "Rechercher" : "Search"}
            </button>
            <button
              type="button"
              onClick={clearProductSearch}
              disabled={!productSearch && !productSearchInput}
              className="h-9 rounded-xl border border-red-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {fr ? "Effacer" : "Clear"}
            </button>
          </div>
          <p className="mt-2 text-[10px] font-medium text-slate-500">
            {fr
              ? `${filteredProductTableRows.length.toLocaleString()} ligne(s) sur ${productTableRows.length.toLocaleString()}`
              : `${filteredProductTableRows.length.toLocaleString()} row(s) of ${productTableRows.length.toLocaleString()}`}
          </p>
        </div>
        <DataTable
          rows={filteredProductTableRows}
          showControls={false}
          showSelection={true}
          showIndex={false}
          visibleColumns={["product_code", "product_code_count"]}
          onRowClick={openProductInvestigation}
          rowSelection={{
            rowKey: "_row_key",
            selectedKeys: selectedProductKey ? [selectedProductKey] : [],
            headerLabel: fr ? "Enquête" : "Investigate",
            onToggle: (key, checked) => {
              if (checked) {
                const target = filteredProductTableRows.find((row) => String(row._row_key ?? "") === key);
                if (target) openProductInvestigation(target);
                return;
              }
              setSelectedProductKey(null);
              setInvestigation(null);
            },
          }}
        />
      </section>

      {investigation ? (
        <AssetInvestigationPanel
          open={Boolean(investigation)}
          title={investigation.title}
          subtitle={investigation.subtitle}
          signal={investigation.signal}
          row={investigation.row}
          language={filters.language}
          payload={payload}
          uniqueSerialMode={uniqueSerialOnly}
          onClose={() => {
            setInvestigation(null);
            setSelectedAssetKey(null);
            setSelectedProductKey(null);
          }}
        />
      ) : null}
    </div>
  );
}
