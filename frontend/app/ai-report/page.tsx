"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiCards } from "@/components/kpi-cards";
import { MultiBarChart } from "@/components/charts";
import { PageShell } from "@/components/page-shell";
import { useAppContext } from "@/components/app-provider";
import { getAiReport, type AiReport } from "@/lib/api";
import { t } from "@/lib/i18n";

type ReportLang = "fr" | "en";

export default function AiReportPage() {
  const { payload, filters } = useAppContext();
  const fr = filters.language === "Français";
  const [report, setReport] = useState<AiReport | null>(null);
  const [reportLang, setReportLang] = useState<ReportLang>("fr");
  const [executiveOnly, setExecutiveOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const hasDates = payload.effective_dates.length > 0 || payload.selected_dates.length > 0;

  useEffect(() => {
    setReportLang(fr ? "fr" : "en");
  }, [fr]);

  useEffect(() => {
    const load = async () => {
      if (!hasDates) {
        setReport(null);
        return;
      }
      setLoading(true);
      setErrorMessage("");
      try {
        const result = await getAiReport(payload);
        setReport(result);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Report generation failed.");
        setReport(null);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [payload, hasDates]);

  const kpis = useMemo(() => {
    if (!report) return [];
    const m = report.metrics;
    return [
      { label: reportLang === "fr" ? "Sites totaux" : "Total sites", value: String(m.total_sites ?? 0) },
      { label: reportLang === "fr" ? "Sites bloqués" : "Blocked sites", value: String(m.blocked_sites ?? 0) },
      { label: reportLang === "fr" ? "Activations" : "Activations", value: String(m.added_sites ?? 0) },
      { label: reportLang === "fr" ? "Alertes critiques" : "Critical alerts", value: String(m.anomalies_critical ?? 0) },
      { label: reportLang === "fr" ? "Delta équipements" : "Equipment delta", value: String(m.equipment_delta ?? 0) },
    ];
  }, [report, reportLang]);

  const exportText = useCallback(() => {
    if (!report) return;
    const lines: string[] = [
      reportLang === "fr" ? "RAPPORT IA RAN" : "RAN AI REPORT",
      `${reportLang === "fr" ? "Généré" : "Generated"}: ${report.generated_at}`,
      `${reportLang === "fr" ? "Période" : "Period"}: ${report.period.start} -> ${report.period.end} (${report.period.snapshots} snapshots)`,
      "",
      reportLang === "fr" ? "RÉSUMÉ EXÉCUTIF" : "EXECUTIVE SUMMARY",
      report.executive[reportLang],
      "",
    ];
    if (!executiveOnly) {
      report.sections.forEach((section) => {
        lines.push(section.title[reportLang].toUpperCase());
        section.lines[reportLang].forEach((line) => lines.push(`  - ${line}`));
        lines.push("");
      });
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ran_ai_report_${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }, [report, reportLang, executiveOnly]);

  return (
    <PageShell
      title={t(filters.language, "page_report_title")}
      subtitle={fr ? "Narration automatique · executive 1 page + version technique · bilingue · export PDF" : "Automated narrative · 1-page executive + technical version · bilingual · PDF export"}
    >
      {!hasDates ? (
        <div className="rounded-2xl border border-red-100 bg-red-50/40 px-6 py-10 text-center text-sm text-slate-600">
          {fr
            ? "Sélectionnez au moins un snapshot dans le panneau de filtres pour générer le rapport."
            : "Select at least one snapshot in the filter panel to generate the report."}
        </div>
      ) : (
        <div className="space-y-5">
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] print:hidden">
            <div className="flex items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-full border border-slate-300 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setReportLang("fr")}
                  className={`px-3 py-1.5 ${reportLang === "fr" ? "bg-red-600 text-white" : "bg-white text-slate-600"}`}
                >
                  FR
                </button>
                <button
                  type="button"
                  onClick={() => setReportLang("en")}
                  className={`px-3 py-1.5 ${reportLang === "en" ? "bg-red-600 text-white" : "bg-white text-slate-600"}`}
                >
                  EN
                </button>
              </div>
              <label className="ml-2 flex items-center gap-2 text-xs font-semibold text-slate-600">
                <input type="checkbox" checked={executiveOnly} onChange={(event) => setExecutiveOnly(event.target.checked)} />
                {reportLang === "fr" ? "Version executive (1 page)" : "Executive version (1 page)"}
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-full border border-red-200 bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                {reportLang === "fr" ? "Exporter PDF (imprimer)" : "Export PDF (print)"}
              </button>
              <button
                type="button"
                onClick={exportText}
                className="rounded-full border border-red-200 bg-white px-4 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
              >
                {reportLang === "fr" ? "Exporter texte" : "Export text"}
              </button>
            </div>
          </section>

          {errorMessage ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{errorMessage}</p>
          ) : null}

          {loading && !report ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
              {fr ? "Génération du rapport..." : "Generating report..."}
            </div>
          ) : null}

          {report ? (
            <article className="space-y-5">
              <header className="rounded-2xl border border-red-100 bg-white px-6 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      {reportLang === "fr" ? "Rapport opérationnel RAN" : "RAN operational report"}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {reportLang === "fr" ? "Période" : "Period"}: {report.period.start} → {report.period.end} ·{" "}
                      {report.period.snapshots} snapshots · {report.generated_at}
                    </p>
                  </div>
                  <span className="rounded-full bg-red-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                    {executiveOnly ? "Executive" : reportLang === "fr" ? "Complet" : "Full"}
                  </span>
                </div>
                <p className="mt-4 rounded-xl border border-slate-100 bg-slate-50/60 p-4 text-sm leading-relaxed text-slate-700">
                  {report.executive[reportLang]}
                </p>
              </header>

              <KpiCards items={kpis} />

              {report.trend.length > 1 ? (
                <section>
                  <p className="mb-2 text-sm font-semibold text-slate-700">
                    {reportLang === "fr" ? "Tendance des cellules par technologie" : "Cell trend by technology"}
                  </p>
                  <MultiBarChart
                    data={report.trend}
                    xKey="snapshot_date"
                    bars={[
                      { key: "cells_2g", color: "#94a3b8" },
                      { key: "cells_3g", color: "#f59e0b" },
                      { key: "cells_4g", color: "#dc2626" },
                      { key: "cells_5g", color: "#7c3aed" },
                    ]}
                    height={260}
                  />
                </section>
              ) : null}

              {!executiveOnly ? (
                <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {report.sections.map((section) => (
                    <div
                      key={section.id}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
                    >
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-red-700">
                        <span className="h-2 w-2 rounded-full bg-red-600" />
                        {section.title[reportLang]}
                      </h3>
                      <ul className="space-y-2 text-sm text-slate-700">
                        {section.lines[reportLang].map((line, idx) => (
                          <li key={`${section.id}-${idx}`} className="flex gap-2">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              ) : null}
            </article>
          ) : null}
        </div>
      )}
    </PageShell>
  );
}
