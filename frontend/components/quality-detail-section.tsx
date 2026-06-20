"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { MultiBarChart } from "@/components/charts";
import { DataTable } from "@/components/data-table";
import { InvestigationPanel, InvestigationSection, InvestigationStatCard } from "@/components/investigation-panel";
import { useAppContext } from "@/components/app-provider";
import { getQuality, investigateSerial, investigateSite } from "@/lib/api";
import { t } from "@/lib/i18n";
import { CHART_PRIMARY, CHART_SECONDARY, CHART_TERTIARY } from "@/lib/chart-theme";

export function QualityDetailSection() {
  const { payload, filters } = useAppContext();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown>>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [siteId, setSiteId] = useState("");
  const [objectType, setObjectType] = useState("");
  const [serial, setSerial] = useState("");
  const [selectedQualityKeys, setSelectedQualityKeys] = useState<string[]>([]);
  const [siteInvestigation, setSiteInvestigation] = useState<{
    site_history: Record<string, unknown>[];
    equipment: Record<string, unknown>[];
  }>({ site_history: [], equipment: [] });
  const [serialRows, setSerialRows] = useState<Record<string, unknown>[]>([]);
  const toNum = (value: unknown) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  useEffect(() => {
    const load = async () => {
      if (!payload.effective_dates.length && !payload.selected_dates.length) {
        setRows([]);
        setSummary({});
        setErrorMessage("");
        return;
      }
      try {
        const data = await getQuality(payload);
        setRows(data.rows);
        setSummary(data.summary);
        setErrorMessage("");
      } catch (error) {
        setRows([]);
        setSummary({});
        setErrorMessage(error instanceof Error ? error.message : "Failed to load quality data.");
      }
    };
    void load();
  }, [payload]);

  const onInvestigateSite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!siteId.trim()) {
      return;
    }
    try {
      const data = await investigateSite(payload, siteId.trim(), objectType.trim());
      setSiteInvestigation(data);
      setErrorMessage("");
    } catch (error) {
      setSiteInvestigation({ site_history: [], equipment: [] });
      setErrorMessage(error instanceof Error ? error.message : "Site investigation failed.");
    }
  };

  const onInvestigateSerial = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!serial.trim()) {
      return;
    }
    try {
      const data = await investigateSerial(payload, serial.trim());
      setSerialRows(data.rows);
      setErrorMessage("");
    } catch (error) {
      setSerialRows([]);
      setErrorMessage(error instanceof Error ? error.message : "Serial investigation failed.");
    }
  };

  const qualityScore = toNum(summary.network_quality_score);
  const avgCompleteness = toNum(summary.avg_completeness);
  const avgSerialQuality = toNum(summary.avg_serial_quality);
  const totalMissing = toNum(summary.total_missing);
  const totalDuplicates = toNum(summary.total_duplicates);
  const criticalGroups = toNum(summary.critical_groups);
  const totalRecords = Math.max(1, toNum(summary.total_records));

  const scoreBars = useMemo(
    () => [
      {
        metric: filters.language === "Français" ? "Qualité réseau" : "Network quality",
        score: qualityScore,
      },
      {
        metric: filters.language === "Français" ? "Complétude moyenne" : "Avg completeness",
        score: avgCompleteness,
      },
      {
        metric: filters.language === "Français" ? "Qualité serial" : "Serial quality",
        score: avgSerialQuality,
      },
    ],
    [avgCompleteness, avgSerialQuality, filters.language, qualityScore],
  );

  const defectBars = useMemo(
    () => [
      {
        category: filters.language === "Français" ? "Champs manquants" : "Missing fields",
        value: totalMissing,
      },
      {
        category: filters.language === "Français" ? "Doublons" : "Duplicates",
        value: totalDuplicates,
      },
      {
        category: filters.language === "Français" ? "Groupes critiques" : "Critical groups",
        value: criticalGroups,
      },
    ],
    [criticalGroups, filters.language, totalDuplicates, totalMissing],
  );

  const severityBars = useMemo(() => {
    const buckets = new Map<string, number>([
      ["low", 0],
      ["medium", 0],
      ["high", 0],
    ]);
    rows.forEach((row) => {
      const severity = String(row.severity ?? "").toLowerCase();
      const records = toNum(row.records);
      if (buckets.has(severity)) {
        buckets.set(severity, (buckets.get(severity) ?? 0) + records);
      }
    });
    return [
      {
        severity: filters.language === "Français" ? "Faible" : "Low",
        records: buckets.get("low") ?? 0,
      },
      {
        severity: filters.language === "Français" ? "Moyenne" : "Medium",
        records: buckets.get("medium") ?? 0,
      },
      {
        severity: filters.language === "Français" ? "Élevée" : "High",
        records: buckets.get("high") ?? 0,
      },
    ];
  }, [filters.language, rows]);

  const qualityRows = useMemo<Record<string, unknown>[]>(
    () =>
      rows.map((row, idx) => ({
        ...row,
        __quality_key: `${String(row.site_id ?? "")}|${String(row.object_type ?? "")}|${idx}`,
      })),
    [rows],
  );

  const selectedQualityRow = useMemo<Record<string, unknown> | null>(() => {
    const key = selectedQualityKeys[0];
    if (!key) return null;
    return qualityRows.find((row) => String(row.__quality_key ?? "") === key) ?? null;
  }, [qualityRows, selectedQualityKeys]);

  const closeQualityDetail = () => {
    setSelectedQualityKeys([]);
  };

  return (
    <div className="space-y-4">
      {errorMessage ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{errorMessage}</p> : null}
      <section className="space-y-3 rounded-2xl border border-red-100 bg-white p-3 shadow-[0_10px_26px_rgba(220,38,38,0.08)]">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <article className="rounded-xl border border-red-100 bg-red-50/30 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
              {filters.language === "Français" ? "Indice de qualité global" : "Global quality index"}
            </p>
            <p className="mt-1 text-3xl font-extrabold text-slate-900">{qualityScore.toFixed(1)}</p>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-red-100">
              <div className="h-full rounded-full bg-red-600 transition-all" style={{ width: `${Math.max(0, Math.min(100, qualityScore))}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-600">
              {filters.language === "Français" ? "Couverture complétude + qualité serial" : "Completeness + serial quality coverage"}
            </p>
          </article>
          <article className="rounded-xl border border-red-100 bg-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">
              {filters.language === "Français" ? "Scores qualité (%)" : "Quality scores (%)"}
            </p>
            <MultiBarChart
              data={scoreBars}
              xKey="metric"
              height={200}
              framed={false}
              bars={[{ key: "score", color: CHART_PRIMARY }]}
            />
          </article>
          <article className="rounded-xl border border-red-100 bg-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">
              {filters.language === "Français" ? "Impact défauts" : "Defect impact"}
            </p>
            <MultiBarChart
              data={defectBars}
              xKey="category"
              height={200}
              framed={false}
              bars={[{ key: "value", color: CHART_SECONDARY }]}
            />
          </article>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <article className="rounded-xl border border-red-100 bg-red-50/30 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">{filters.language === "Français" ? "Records contrôlés" : "Records audited"}</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{toNum(summary.total_records).toLocaleString()}</p>
          </article>
          <article className="rounded-xl border border-red-100 bg-red-50/30 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">{filters.language === "Français" ? "Champs manquants" : "Missing fields"}</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{totalMissing.toLocaleString()}</p>
            <p className="text-[10px] text-slate-500">{((totalMissing * 100) / totalRecords).toFixed(1)}%</p>
          </article>
          <article className="rounded-xl border border-red-100 bg-red-50/30 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">{filters.language === "Français" ? "Doublons" : "Duplicates"}</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{totalDuplicates.toLocaleString()}</p>
            <p className="text-[10px] text-slate-500">{((totalDuplicates * 100) / totalRecords).toFixed(1)}%</p>
          </article>
          <article className="rounded-xl border border-red-100 bg-red-50/30 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">{filters.language === "Français" ? "Groupes critiques" : "Critical groups"}</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{criticalGroups.toLocaleString()}</p>
          </article>
        </div>
        <article className="rounded-xl border border-red-100 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">
            {filters.language === "Français" ? "Répartition de sévérité" : "Severity distribution"}
          </p>
          <MultiBarChart
            data={severityBars}
            xKey="severity"
            height={180}
            framed={false}
            bars={[{ key: "records", color: CHART_TERTIARY }]}
          />
        </article>
      </section>
      <DataTable
        rows={qualityRows}
        rowSelection={{
          rowKey: "__quality_key",
          selectedKeys: selectedQualityKeys,
          onToggle: (rowKey, checked) => {
            if (!rowKey) return;
            setSelectedQualityKeys(checked ? [rowKey] : []);
          },
          headerLabel: filters.language === "Français" ? "Choix" : "Select",
        }}
      />

      <InvestigationPanel
        open={Boolean(selectedQualityRow)}
        onClose={closeQualityDetail}
        eyebrow={t(filters.language, "investigation_eyebrow")}
        title={filters.language === "Français" ? "Détail qualité" : "Quality detail"}
        subtitle={
          selectedQualityRow
            ? `${String(selectedQualityRow.site_id ?? "-")} · ${String(selectedQualityRow.object_type ?? "-")}`
            : undefined
        }
      >
        {selectedQualityRow ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
              <InvestigationStatCard label="Site" value={String(selectedQualityRow.site_id ?? "-")} />
              <InvestigationStatCard label="Object type" value={String(selectedQualityRow.object_type ?? "-")} />
              <InvestigationStatCard
                label={filters.language === "Français" ? "Complétude" : "Completeness"}
                value={`${String(selectedQualityRow.completeness_percent ?? 0)}%`}
                tone="info"
              />
              <InvestigationStatCard
                label={filters.language === "Français" ? "Sévérité" : "Severity"}
                value={String(selectedQualityRow.severity ?? "-")}
                tone={String(selectedQualityRow.severity ?? "").toLowerCase() === "high" ? "danger" : "warning"}
              />
            </div>
            <InvestigationSection title={filters.language === "Français" ? "Analyse des défauts" : "Defect analysis"}>
              <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-5">
                <InvestigationStatCard label="Records" value={String(selectedQualityRow.records ?? 0)} />
                <InvestigationStatCard
                  label={filters.language === "Français" ? "Manquants serial" : "Missing serial"}
                  value={String(selectedQualityRow.missing_serial ?? 0)}
                  tone="warning"
                />
                <InvestigationStatCard
                  label={filters.language === "Français" ? "Manquants code" : "Missing code"}
                  value={String(selectedQualityRow.missing_product_code ?? 0)}
                  tone="warning"
                />
                <InvestigationStatCard
                  label={filters.language === "Français" ? "Manquants nom" : "Missing name"}
                  value={String(selectedQualityRow.missing_product_name ?? 0)}
                  tone="warning"
                />
                <InvestigationStatCard
                  label={filters.language === "Français" ? "Doublons" : "Duplicates"}
                  value={String(selectedQualityRow.duplicated_records ?? 0)}
                  tone="danger"
                />
              </div>
            </InvestigationSection>
          </div>
        ) : null}
      </InvestigationPanel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <form
          onSubmit={onInvestigateSite}
          className="space-y-3 rounded-2xl border border-red-100 bg-white p-4 shadow-[0_8px_24px_rgba(220,38,38,0.08)]"
        >
          <div className="border-b border-red-100 pb-2">
            <h3 className="text-sm font-semibold text-slate-900">
              {filters.language === "Français" ? "Investigation site" : "Site investigation"}
            </h3>
            <p className="text-xs text-slate-500">
              {filters.language === "Français"
                ? "Saisir un site pour afficher son historique et ses equipements."
                : "Enter a site to load history and equipment details."}
            </p>
          </div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Site ID
            <input
              className="mt-1 h-10 w-full rounded-xl border border-red-100 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
              placeholder="Ex: 1012195"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            {filters.language === "Français" ? "Type objet (optionnel)" : "Object type (optional)"}
            <input
              className="mt-1 h-10 w-full rounded-xl border border-red-100 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
              placeholder="CABINET / BBMOD / RMOD ..."
              value={objectType}
              onChange={(e) => setObjectType(e.target.value)}
            />
          </label>
          <button
            className="inline-flex h-9 items-center rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            disabled={!siteId.trim()}
          >
            {filters.language === "Français" ? "Lancer l'enquete" : "Run investigation"}
          </button>
        </form>

        <form
          onSubmit={onInvestigateSerial}
          className="space-y-3 rounded-2xl border border-red-100 bg-white p-4 shadow-[0_8px_24px_rgba(220,38,38,0.08)]"
        >
          <div className="border-b border-red-100 pb-2">
            <h3 className="text-sm font-semibold text-slate-900">
              {filters.language === "Français" ? "Investigation serial" : "Serial investigation"}
            </h3>
            <p className="text-xs text-slate-500">
              {filters.language === "Français"
                ? "Verifier la trace d'un serial sur les snapshots."
                : "Trace a serial number across snapshots."}
            </p>
          </div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            {filters.language === "Français" ? "Numero de serie" : "Serial number"}
            <input
              className="mt-1 h-10 w-full rounded-xl border border-red-100 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
              placeholder={filters.language === "Français" ? "Ex: NSN..." : "Ex: NSN..."}
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
            />
          </label>
          <button
            className="inline-flex h-9 items-center rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            disabled={!serial.trim()}
          >
            {filters.language === "Français" ? "Lancer l'enquete" : "Run investigation"}
          </button>
        </form>
      </div>

      {siteInvestigation.site_history.length ? <DataTable rows={siteInvestigation.site_history} /> : null}
      {siteInvestigation.equipment.length ? <DataTable rows={siteInvestigation.equipment} /> : null}
      {serialRows.length ? <DataTable rows={serialRows} /> : null}
    </div>
  );
}
