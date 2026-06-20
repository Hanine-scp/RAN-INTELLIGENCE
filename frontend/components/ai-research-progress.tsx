"use client";

import { useEffect, useState } from "react";
import { t, type Locale } from "@/lib/i18n";

type AiResearchProgressProps = {
  language: Locale;
  active: boolean;
  withWeb: boolean;
};

const WEB_STEP_KEYS = [
  "ai_research_normalize",
  "ai_research_search",
  "ai_research_read",
  "ai_research_synthesize",
] as const;

const LOCAL_STEP_KEYS = ["ai_local_analyze", "ai_local_synthesize"] as const;

export function AiResearchProgress({ language, active, withWeb }: AiResearchProgressProps) {
  const stepKeys = withWeb ? WEB_STEP_KEYS : LOCAL_STEP_KEYS;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % stepKeys.length);
    }, 1400);
    return () => window.clearInterval(timer);
  }, [active, stepKeys.length]);

  if (!active) return null;

  return (
    <div className="ai-research-progress rounded-2xl border border-slate-200/90 bg-white px-4 py-3 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-600" />
        </span>
        <p className="text-xs font-semibold text-slate-700">
          {withWeb ? t(language, "ai_research_title") : t(language, "ai_thinking")}
        </p>
      </div>
      <ol className="space-y-2">
        {stepKeys.map((labelKey, stepIndex) => {
          const done = stepIndex < index;
          const current = stepIndex === index;
          return (
            <li
              key={labelKey}
              className={`flex items-center gap-2.5 text-[11px] transition ${
                current ? "font-semibold text-teal-800" : done ? "text-slate-500" : "text-slate-400"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                  done
                    ? "border-teal-200 bg-teal-50 text-teal-700"
                    : current
                      ? "border-teal-300 bg-teal-100 text-teal-800"
                      : "border-slate-200 bg-slate-50 text-slate-400"
                }`}
              >
                {done ? "✓" : stepIndex + 1}
              </span>
              <span>{t(language, labelKey)}</span>
              {current ? <span className="ai-thinking-dots inline-flex gap-0.5"><span /><span /><span /></span> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
