"use client";

import { MultiBarChart } from "@/components/charts";
import { CellTechnologyShareCard } from "@/components/cell-technology-share-card";
import { HomeExecutiveDashboardSection } from "@/components/home-executive-dashboard-section";
import { CHART_PRIMARY, CHART_SECONDARY, CHART_TERTIARY } from "@/lib/chart-theme";
import type { HomeHubPageContext } from "@/lib/home-hub-page-report-data";
import { t, type Locale } from "@/lib/i18n";

type HomeHubPageReportContentProps = {
  pageContext: HomeHubPageContext;
  language: Locale;
};

function PreviewTable({
  columns,
  rows,
  fr,
}: {
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
  fr: boolean;
}) {
  if (!rows.length) {
    return <p className="text-sm text-slate-500">{fr ? "Aucune donnée." : "No data."}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[480px] border-collapse text-xs">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-600">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="odd:bg-white even:bg-slate-50/70">
              {columns.map((col) => (
                <td key={col.key} className="border-b border-slate-100 px-3 py-2 text-slate-800">
                  {String(row[col.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HomeHubPageReportContent({ pageContext, language }: HomeHubPageReportContentProps) {
  const fr = language === "Français";

  if (pageContext.tab === "sites") {
    return (
      <div className="space-y-4">
        <HomeExecutiveDashboardSection context={pageContext.data} language={language} compact />
        <CellTechnologyShareCard rows={pageContext.data.siteRows} language={language} />
      </div>
    );
  }

  if (pageContext.tab === "inventaire") {
    const { summary, charts, siteCounterPreview } = pageContext.data;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          {[
            { label: fr ? "Équipements totaux" : "Total equipment", value: summary.totalEquipment.toLocaleString() },
            { label: fr ? "Sites uniques" : "Unique sites", value: summary.uniqueSites.toLocaleString() },
            { label: fr ? "Types uniques" : "Unique types", value: summary.uniqueTypes.toLocaleString() },
            { label: fr ? "Moy. équip./site" : "Avg equip/site", value: String(summary.avgEquipmentPerSite) },
            {
              label: fr ? "Type dominant" : "Top type",
              value: `${summary.topType} (${summary.topTypeShare}%)`,
            },
          ].map((item) => (
            <article key={item.label} className="rounded-xl border border-red-100 bg-red-50/30 p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">{item.label}</p>
              <p className="mt-1 text-lg font-extrabold text-slate-900">{item.value}</p>
            </article>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <article className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">
              {fr ? "Équipements par type (top 8)" : "Equipment by type (top 8)"}
            </p>
            <MultiBarChart data={charts.byType} xKey="object_type" height={200} framed={false} bars={[{ key: "total_equipment", color: CHART_PRIMARY }]} />
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">
              {fr ? "Équipements par site (top 8)" : "Equipment by site (top 8)"}
            </p>
            <MultiBarChart data={charts.bySite} xKey="site_id" height={200} framed={false} bars={[{ key: "total_equipment", color: CHART_SECONDARY }]} />
          </article>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-platform-navy">
            {t(language, "table_inventory_site_counter_title")}
          </p>
          <PreviewTable
            fr={fr}
            rows={siteCounterPreview}
            columns={[
              { key: "site_id", label: "Site" },
              { key: "total_equipment", label: fr ? "Total" : "Total" },
              { key: "RMOD", label: "RMOD" },
              { key: "SMOD", label: "SMOD" },
            ]}
          />
        </div>
      </div>
    );
  }

  if (pageContext.tab === "assets") {
    const { summary, topProductCodes, chartsByType, pivotPreview } = pageContext.data;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            { label: fr ? "Lignes assets" : "Asset rows", value: summary.totalRows.toLocaleString() },
            { label: fr ? "Sites" : "Sites", value: summary.uniqueSites.toLocaleString() },
            { label: fr ? "Codes produit" : "Product codes", value: summary.uniqueCodes.toLocaleString() },
            { label: fr ? "Types équipement" : "Equipment types", value: summary.uniqueTypes.toLocaleString() },
          ].map((item) => (
            <article key={item.label} className="rounded-xl border border-teal-100 bg-white px-3 py-2.5 shadow-sm">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">{item.value}</p>
            </article>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <article className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-teal-700">
              {fr ? "Top codes produit" : "Top product codes"}
            </p>
            <MultiBarChart data={topProductCodes} xKey="product_code" height={220} framed={false} bars={[{ key: "compteur", color: CHART_TERTIARY }]} />
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-teal-700">
              {fr ? "Équipements par type" : "Equipment by type"}
            </p>
            <MultiBarChart data={chartsByType} xKey="object_type" height={220} framed={false} bars={[{ key: "total_equipment", color: CHART_PRIMARY }]} />
          </article>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-platform-navy">
              {t(language, "table_assets_pivot_product_code_name")}
            </p>
            <PreviewTable
              fr={fr}
              rows={pivotPreview.productCodeName}
              columns={[
                { key: "product_name", label: fr ? "Nom produit" : "Product name" },
                { key: "product_code", label: fr ? "Code produit" : "Product code" },
                { key: "serial_count", label: fr ? "Nb séries" : "Serial count" },
              ]}
            />
          </div>
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-platform-navy">
              {t(language, "table_assets_pivot_serial")}
            </p>
            <PreviewTable
              fr={fr}
              rows={pivotPreview.serial}
              columns={[
                { key: "serial_number", label: fr ? "N° série" : "Serial" },
                { key: "serial_occurrence", label: fr ? "Occurrences" : "Occurrences" },
              ]}
            />
          </div>
        </div>
      </div>
    );
  }

  const { metrics, topTypes, rowsPreview } = pageContext.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          { label: fr ? "Taux qualité serial" : "Serial quality rate", value: `${metrics.qualityRate}%` },
          { label: t(language, "kpi_object_types"), value: metrics.types.toLocaleString() },
          { label: t(language, "kpi_raw_records"), value: metrics.raw.toLocaleString() },
          { label: fr ? "Anomalies serial" : "Serial anomalies", value: (metrics.empty + metrics.duplicated).toLocaleString() },
        ].map((item) => (
          <article key={item.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{item.value}</p>
          </article>
        ))}
      </div>

      {topTypes.length ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <article className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
              {fr ? "Serials uniques vs vides par type" : "Unique vs empty serials by type"}
            </p>
            <MultiBarChart
              data={topTypes}
              xKey="object_type"
              height={220}
              framed={false}
              bars={[
                { key: "unique_serials", color: CHART_PRIMARY },
                { key: "empty_serials", color: CHART_SECONDARY },
              ]}
            />
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
              {fr ? "Volume & doublons par type" : "Volume & duplicates by type"}
            </p>
            <MultiBarChart
              data={topTypes}
              xKey="object_type"
              height={220}
              framed={false}
              bars={[
                { key: "raw_records", color: CHART_SECONDARY },
                { key: "duplicated_serials", color: CHART_TERTIARY },
              ]}
            />
          </article>
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
          {fr ? "Registre compteurs (aperçu)" : "Counter register (preview)"}
        </p>
        <PreviewTable
          fr={fr}
          rows={rowsPreview}
          columns={[
            { key: "object_type", label: fr ? "Type" : "Type" },
            { key: "raw_records", label: fr ? "Enregistrements" : "Records" },
            { key: "unique_serials", label: fr ? "Uniques" : "Unique" },
            { key: "empty_serials", label: fr ? "Vides" : "Empty" },
            { key: "duplicated_serials", label: fr ? "Doublons" : "Duplicates" },
            { key: "quality_rate", label: fr ? "Qualité %" : "Quality %" },
          ]}
        />
      </div>
    </div>
  );
}
