"use client";

import { useEffect, useMemo, useState } from "react";
import { AssetInvestigationPanel } from "@/components/asset-investigation-panel";
import { DataTable } from "@/components/data-table";
import { PageShell } from "@/components/page-shell";
import { useAppContext } from "@/components/app-provider";
import {
  buildAssetRowKey,
  buildProductRowKey,
  interpretAssetRow,
  interpretProductCodeRow,
  type AssetSignal,
} from "@/lib/asset-interpretation";
import { getAssetDistributionV2, getAssetProductCodesV2 } from "@/lib/api";
import { t } from "@/lib/i18n";

type InvestigationState = {
  kind: "asset" | "product";
  row: Record<string, unknown>;
  signal: AssetSignal;
  title: string;
  subtitle: string;
} | null;

function withSignalColumn(row: Record<string, unknown>, signal: AssetSignal, rowKey: string) {
  return {
    signal: signal.label,
    ...row,
    _signal_tone: signal.tone,
    _row_key: rowKey,
  };
}

export default function AssetDistributionPage() {
  const { payload, filters } = useAppContext();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [productCodeRows, setProductCodeRows] = useState<Record<string, unknown>[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown>>({});
  const [objectTypes, setObjectTypes] = useState<string[]>([]);
  const [selectedObjectTypes, setSelectedObjectTypes] = useState<string[]>([]);
  const [objectTypeQuery, setObjectTypeQuery] = useState("");
  const [objectTypeOpen, setObjectTypeOpen] = useState(false);
  const [uniqueSerialOnly, setUniqueSerialOnly] = useState(false);
  const [productSearchInput, setProductSearchInput] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productSearchEnabled, setProductSearchEnabled] = useState(false);
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [assetPage, setAssetPage] = useState(1);
  const [assetTotalCount, setAssetTotalCount] = useState(0);
  const [productPage, setProductPage] = useState(1);
  const [productTotalCount, setProductTotalCount] = useState(0);
  const [investigation, setInvestigation] = useState<InvestigationState>(null);
  const [selectedAssetKey, setSelectedAssetKey] = useState<string | null>(null);
  const [selectedProductKey, setSelectedProductKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const pageSize = 500;
  const fr = filters.language === "Français";

  const hasSnapshotSelection = payload.effective_dates.length > 0 || payload.selected_dates.length > 0;

  useEffect(() => {
    const load = async () => {
      if (!hasSnapshotSelection) {
        setRows((prev) => (prev.length === 0 ? prev : []));
        setProductCodeRows((prev) => (prev.length === 0 ? prev : []));
        setSummary((prev) => (Object.keys(prev).length === 0 ? prev : {}));
        setObjectTypes((prev) => (prev.length === 0 ? prev : []));
        setAssetPage((prev) => (prev === 1 ? prev : 1));
        setProductPage((prev) => (prev === 1 ? prev : 1));
        setAssetTotalCount((prev) => (prev === 0 ? prev : 0));
        setProductTotalCount((prev) => (prev === 0 ? prev : 0));
        setLoadError("");
        return;
      }
      try {
        const [assetData, productData, objectTypeCatalog] = await Promise.all([
          getAssetDistributionV2(payload, { page: assetPage, page_size: pageSize, search: "", unique_serial_only: uniqueSerialOnly }, selectedObjectTypes),
          getAssetProductCodesV2(
            payload,
            {
              page: productPage,
              page_size: pageSize,
              search: productSearchEnabled ? productSearch : "",
              unique_serial_only: true,
            },
            selectedObjectTypes,
          ),
          getAssetDistributionV2(payload, { page: 1, page_size: 50, search: "", unique_serial_only: false }, []),
        ]);
        setRows(assetData.rows);
        setObjectTypes(objectTypeCatalog.object_types ?? []);
        setSummary(assetData.summary ?? {});
        setAssetTotalCount(Number(assetData.total_count ?? 0));
        setProductCodeRows(productData.rows ?? []);
        setProductTotalCount(Number(productData.total_count ?? 0));
        setLoadError("");
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Failed to load asset distribution.");
      }
    };
    void load();
  }, [payload, hasSnapshotSelection, assetPage, productPage, pageSize, selectedObjectTypes, uniqueSerialOnly, productSearch, productSearchEnabled]);

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
    setProductPage(1);
  };

  const clearProductSearch = () => {
    setProductSearchInput("");
    setProductSearch("");
    setProductSearchOpen(false);
    setProductPage(1);
  };

  const toggleProductSearchEnabled = (enabled: boolean) => {
    setProductSearchEnabled(enabled);
    setProductSearch(enabled ? productSearchInput.trim() : "");
    setProductPage(1);
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

  const assetTotalPages = Math.max(1, Math.ceil(assetTotalCount / pageSize));
  const productTotalPages = Math.max(1, Math.ceil(productTotalCount / pageSize));

  const assetTableRows = useMemo(
    () =>
      rows.map((row) => {
        const signal = interpretAssetRow(row, filters.language);
        return withSignalColumn(row, signal, buildAssetRowKey(row));
      }),
    [rows, filters.language],
  );

  const productTableRows = useMemo(
    () =>
      productCodeRows.map((row) => ({
        ...row,
        _row_key: buildProductRowKey(row),
      })),
    [productCodeRows],
  );

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
    <PageShell title={t(filters.language, "page_asset_dist_title")}>
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
                style={{ background: `conic-gradient(#dc2626 ${kpiView.assetsPerSiteRate}%, #fee2e2 0)` }}
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
                  setAssetPage(1);
                  setProductPage(1);
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
                  setAssetPage(1);
                  setProductPage(1);
                }}
                className="h-9 rounded-xl border border-red-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-red-50"
              >
                {filters.language === "Français" ? "Désélectionner tout" : "Deselect all"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedObjectTypes((prev) => objectTypes.filter((item) => !prev.includes(item)));
                  setAssetPage(1);
                  setProductPage(1);
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
                          const next = checked ? (prev.includes(value) ? prev : [...prev, value]) : prev.filter((item) => item !== value);
                          setAssetPage(1);
                          setProductPage(1);
                          return next;
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
        <div className="mt-2 rounded-xl border border-red-100 bg-white px-3 py-2">
          <label className="flex cursor-pointer items-center justify-between gap-3 text-xs">
            <span className="font-medium text-slate-700">
              {filters.language === "Français"
                ? "Filtre redondance serial number (uniques seulement)"
                : "Serial redundancy filter (unique serials only)"}
            </span>
            <input
              type="checkbox"
              checked={uniqueSerialOnly}
              onChange={(event) => {
                setUniqueSerialOnly(event.target.checked);
                setAssetPage(1);
              }}
              className="h-4 w-4 accent-red-600"
            />
          </label>
          {uniqueSerialOnly ? (
            <p className="mt-1 text-[11px] text-red-700">
              {filters.language === "Français"
                ? `${rows.length.toLocaleString()} serial number unique(s) affiché(s) sur la page`
                : `${rows.length.toLocaleString()} unique serial number(s) displayed on page`}
            </p>
          ) : null}
        </div>
      </section>
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
        rows={assetTableRows}
        showControls={false}
        showSelection={true}
        onRowClick={openAssetInvestigation}
        rowSelection={{
          rowKey: "_row_key",
          selectedKeys: selectedAssetKey ? [selectedAssetKey] : [],
          headerLabel: fr ? "Enquête" : "Investigate",
          onToggle: (key, checked) => {
            if (checked) {
              const target = assetTableRows.find((row) => String(row._row_key ?? "") === key);
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
                          setProductPage(1);
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
        </div>
        <DataTable
          rows={productTableRows}
          showControls={false}
          showSelection={true}
          showIndex={false}
          visibleColumns={["object_type", "product_name", "product_code", "product_code_count"]}
          onRowClick={openProductInvestigation}
          rowSelection={{
            rowKey: "_row_key",
            selectedKeys: selectedProductKey ? [selectedProductKey] : [],
            headerLabel: fr ? "Enquête" : "Investigate",
            onToggle: (key, checked) => {
              if (checked) {
                const target = productTableRows.find((row) => String(row._row_key ?? "") === key);
                if (target) openProductInvestigation(target);
                return;
              }
              setSelectedProductKey(null);
              setInvestigation(null);
            },
          }}
        />
        <div className="flex items-center justify-end gap-2 rounded-xl border border-red-100 bg-red-50/20 px-3 py-2">
          <button
            type="button"
            onClick={() => setProductPage((prev) => Math.max(1, prev - 1))}
            disabled={productPage <= 1}
            className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {filters.language === "Français" ? "Précédent" : "Previous"}
          </button>
          <span className="text-[11px] text-slate-600">
            {filters.language === "Français" ? `Page ${productPage}/${productTotalPages}` : `Page ${productPage}/${productTotalPages}`}
          </span>
          <button
            type="button"
            onClick={() => setProductPage((prev) => Math.min(productTotalPages, prev + 1))}
            disabled={productPage >= productTotalPages}
            className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {filters.language === "Français" ? "Suivant" : "Next"}
          </button>
        </div>
      </section>

      {investigation ? (
        <AssetInvestigationPanel
          open={Boolean(investigation)}
          title={investigation.title}
          subtitle={investigation.subtitle}
          signal={investigation.signal}
          row={investigation.row}
          language={filters.language}
          onClose={() => {
            setInvestigation(null);
            setSelectedAssetKey(null);
            setSelectedProductKey(null);
          }}
        />
      ) : null}
    </PageShell>
  );
}
