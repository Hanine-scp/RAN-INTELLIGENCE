"use client";

import { InvestigationPanel, InvestigationSection, InvestigationStatCard } from "@/components/investigation-panel";
import type { AssetSignal, SignalTone } from "@/lib/asset-interpretation";
import { signalToneClass } from "@/lib/asset-interpretation";

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

type AssetInvestigationPanelProps = {
  open: boolean;
  title: string;
  subtitle: string;
  signal: AssetSignal;
  row: Record<string, unknown>;
  language: "Français" | "English";
  onClose: () => void;
};

export function AssetInvestigationPanel({ open, title, subtitle, signal, row, language, onClose }: AssetInvestigationPanelProps) {
  const fr = language === "Français";

  return (
    <InvestigationPanel
      open={open}
      onClose={onClose}
      eyebrow={fr ? "Enquête Assets" : "Asset Investigation"}
      title={title}
      subtitle={subtitle}
      badge={
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${signalToneClass[signal.tone]}`}>
          <SignalIcon tone={signal.tone} />
          {signal.label}
        </span>
      }
    >
      <div className="space-y-3">
        <InvestigationSection title={signal.title}>
          <p className="text-xs leading-relaxed text-slate-700">{signal.summary}</p>
        </InvestigationSection>

        <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
          {signal.insights.map((item) => (
            <InvestigationStatCard key={item.label} label={item.label} value={item.value} />
          ))}
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

        <InvestigationSection title={fr ? "Données brutes" : "Raw data"}>
          <div className="grid grid-cols-1 gap-1.5 text-[11px] md:grid-cols-2">
            {Object.entries(row)
              .filter(([key]) => !key.startsWith("_"))
              .map(([key, value]) => (
                <p key={key} className="rounded-md border border-slate-200/80 bg-slate-50/50 px-2 py-1.5">
                  <span className="font-semibold text-slate-800">{key}: </span>
                  <span className="text-slate-600">{String(value ?? "-")}</span>
                </p>
              ))}
          </div>
        </InvestigationSection>
      </div>
    </InvestigationPanel>
  );
}
