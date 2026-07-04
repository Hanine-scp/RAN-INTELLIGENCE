"use client";

import { useMemo } from "react";
import { MultiBarChart } from "@/components/charts/charts";
import { HomeHubPageReportContent } from "@/components/reports/home-hub-page-report-content";
import { InvestigationSection, InvestigationStatCard } from "@/components/ui/investigation-panel";
import type { AiReport, AssistantInsightResponse } from "@/lib/api";
import { TECH_COLORS } from "@/lib/chart-theme";
import { cleanAiReportMessage } from "@/lib/reports/import-report-export";
import { getHomeHubPageKpis, type HomeHubPageContext } from "@/lib/reports/home-hub-page-report-data";
import { t, type Locale } from "@/lib/i18n";

type HomeHubStructuredReportBodyProps = {
  language: Locale;
  report: AiReport;
  pageContext: HomeHubPageContext | null;
  aiInsight: AssistantInsightResponse | null;
};

function ReportBlock({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
      <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-teal-50/40 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-800">{title}</p>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

function AiMarkdownBody({ content }: { content: string }) {
  const blocks = content.split("\n\n");
  return (
    <div className="space-y-3 text-sm leading-relaxed text-slate-700">
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith("## ")) {
          return (
            <h4 key={i} className="border-b border-teal-100 pb-1 text-xs font-bold uppercase tracking-[0.14em] text-teal-800">
              {trimmed.replace(/^##\s*/, "")}
            </h4>
          );
        }
        return <p key={i} className="whitespace-pre-wrap">{trimmed}</p>;
      })}
    </div>
  );
}

export function HomeHubStructuredReportBody({
  language,
  report,
  pageContext,
  aiInsight,
}: HomeHubStructuredReportBodyProps) {
  const fr = language === "Français";
  const lang = fr ? "fr" : "en";
  const aiInsightMessage = aiInsight?.message;
  const aiMessage = useMemo(() => (aiInsightMessage ? cleanAiReportMessage(aiInsightMessage) : ""), [aiInsightMessage]);

  const pageKpis = useMemo(() => getHomeHubPageKpis(pageContext, fr), [fr, pageContext]);
  const reportKpis = useMemo(() => {
    const m = report.metrics;
    return [
      { label: fr ? "Sites" : "Sites", value: String(m.total_sites ?? 0) },
      { label: fr ? "Actifs" : "Active", value: String(m.active_sites ?? 0) },
      { label: fr ? "Équipements" : "Equipment", value: String(m.total_equipment ?? 0) },
      { label: fr ? "Indice risque" : "Risk index", value: `${report.risk_index ?? 0}/100` },
    ];
  }, [fr, report]);

  const findings = report.critical_findings ?? [];
  const decisions = report.decisions ?? [];

  return (
    <div className="space-y-4">
      <ReportBlock
        title={t(language, "home_report_section_global")}
        subtitle={t(language, "home_report_section_global_hint")}
      >
        <p className="rounded-xl border border-teal-100 bg-teal-50/40 p-4 text-sm leading-relaxed text-slate-700">
          {report.executive[lang]}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-[11px] font-bold text-teal-800">
            {fr ? "Indice risque" : "Risk index"}: {report.risk_index ?? 0}/100
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
            {report.period.start} → {report.period.end}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
            {report.period.snapshots} snapshot{report.period.snapshots > 1 ? "s" : ""}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {(pageKpis.length ? pageKpis : reportKpis).map((kpi) => (
            <InvestigationStatCard key={kpi.label} label={kpi.label} value={kpi.value} />
          ))}
        </div>
      </ReportBlock>

      {pageContext ? (
        <ReportBlock
          title={t(language, "home_report_section_page_data")}
          subtitle={t(language, "home_report_section_page_data_hint")}
        >
          <HomeHubPageReportContent pageContext={pageContext} language={language} />
        </ReportBlock>
      ) : null}

      <ReportBlock
        title={t(language, "home_report_section_analysis")}
        subtitle={t(language, "home_report_section_analysis_hint")}
      >
        {findings.length > 0 ? (
          <InvestigationSection title={t(language, "home_report_section_findings")}>
            <div className="space-y-2">
              {findings.map((item, index) => (
                <div key={index} className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-slate-700">
                  <span className="mr-2 text-[10px] font-bold uppercase text-amber-700">{item.severity}</span>
                  {item[lang]}
                </div>
              ))}
            </div>
          </InvestigationSection>
        ) : null}

        {decisions.length > 0 ? (
          <InvestigationSection title={t(language, "home_report_section_decisions")}>
            <div className="space-y-2">
              {decisions.map((item, index) => (
                <div key={index} className="flex gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-teal-600 text-[10px] font-bold text-white">
                    {item.priority}
                  </span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{item.category}</p>
                    <p className="text-sm text-slate-700">{item[lang]}</p>
                  </div>
                </div>
              ))}
            </div>
          </InvestigationSection>
        ) : null}

        {report.sections.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {report.sections.map((section) => (
              <InvestigationSection key={section.id} title={section.title[lang]}>
                <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">
                  {section.lines[lang].map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ul>
              </InvestigationSection>
            ))}
          </div>
        ) : null}

        {report.trend.length > 1 ? (
          <InvestigationSection title={fr ? "Tendance cellules" : "Cell trend"}>
            <MultiBarChart
              data={report.trend}
              xKey="snapshot_date"
              height={220}
              framed={false}
              bars={[
                { key: "cells_2g", color: TECH_COLORS.cells_2g },
                { key: "cells_3g", color: TECH_COLORS.cells_3g },
                { key: "cells_4g", color: TECH_COLORS.cells_4g },
                { key: "cells_5g", color: TECH_COLORS.cells_5g },
              ]}
            />
          </InvestigationSection>
        ) : null}

        {!findings.length && !decisions.length && !report.sections.length && report.trend.length <= 1 ? (
          <p className="text-sm text-slate-500">{t(language, "home_report_section_analysis_empty")}</p>
        ) : null}
      </ReportBlock>

      {aiMessage ? (
        <ReportBlock title={t(language, "delta_report_ai_analysis")}>
          <AiMarkdownBody content={aiMessage} />
        </ReportBlock>
      ) : null}
    </div>
  );
}
