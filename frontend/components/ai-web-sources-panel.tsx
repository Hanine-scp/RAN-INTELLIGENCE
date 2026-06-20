"use client";

import { useState } from "react";
import { t, type Locale } from "@/lib/i18n";

export type WebSearchMeta = {
  status?: string;
  original_query?: string;
  search_query?: string;
  corrected_query?: string | null;
  abstract?: string;
  provider?: string;
  source_count?: number;
  searched_at?: string;
  results?: Array<{ title?: string; url?: string; snippet?: string }>;
};

function providerLabel(provider: string | undefined, language: Locale): string {
  const map: Record<string, { fr: string; en: string }> = {
    tavily_api: { fr: "Tavily API", en: "Tavily API" },
    serper_api: { fr: "Serper", en: "Serper" },
    brave_api: { fr: "Brave Search", en: "Brave Search" },
    wikipedia_api: { fr: "Wikipedia", en: "Wikipedia" },
    wikipedia_duckduckgo: { fr: "Wikipedia · DDG", en: "Wikipedia · DDG" },
  };
  const entry = provider ? map[provider] : undefined;
  if (entry) return language === "Français" ? entry.fr : entry.en;
  return provider || (language === "Français" ? "Web" : "Web");
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function faviconUrl(url: string): string {
  const host = hostFromUrl(url);
  return host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32` : "";
}

function IconGlobe({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
    </svg>
  );
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 text-slate-400 transition ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AiWebSourcesPanel({ language, meta }: { language: Locale; meta: WebSearchMeta }) {
  const [open, setOpen] = useState(true);
  const results = meta.results ?? [];
  const count = meta.source_count ?? results.length;
  const corrected = (meta.corrected_query || meta.search_query || "").trim();
  const original = (meta.original_query || "").trim();
  const showCorrection = Boolean(corrected && original && corrected.toLowerCase() !== original.toLowerCase());

  if (meta.status === "no_results") {
    return (
      <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-xs text-amber-900">
        {t(language, "ai_web_no_results")}
        {showCorrection ? (
          <p className="mt-1 text-[11px] text-amber-800/80">
            {t(language, "ai_web_corrected")} : <span className="font-semibold">{corrected}</span>
          </p>
        ) : null}
      </div>
    );
  }

  if (!results.length && !meta.abstract) return null;

  return (
    <div className="ai-web-sources mt-3 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50/80"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-teal-800">
            <IconGlobe className="h-3.5 w-3.5" />
            {t(language, "ai_web_sources_title")}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
            {count} {t(language, count === 1 ? "ai_web_source_one" : "ai_web_source_many")}
          </span>
          {meta.provider ? (
            <span className="text-[11px] text-slate-500">
              {providerLabel(meta.provider, language)}
            </span>
          ) : null}
          {showCorrection ? (
            <span className="truncate text-[11px] text-slate-500">
              · {t(language, "ai_web_corrected")} <strong className="text-slate-700">{corrected}</strong>
            </span>
          ) : null}
        </div>
        <IconChevron open={open} />
      </button>

      {results.length ? (
        <div className="border-t border-slate-100 px-4 py-2">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {results.slice(0, 8).map((row, index) => {
              const url = row.url || "";
              const host = url ? hostFromUrl(url) : `#${index + 1}`;
              const inner = (
                <>
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-teal-100 text-[9px] font-bold text-teal-800">
                    {index + 1}
                  </span>
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={faviconUrl(url)} alt="" className="h-3.5 w-3.5 shrink-0 rounded-sm" />
                  ) : null}
                  <span className="truncate">{host}</span>
                </>
              );
              if (!url) {
                return (
                  <span
                    key={`${host}-${index}`}
                    className="inline-flex max-w-[160px] shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600"
                  >
                    {inner}
                  </span>
                );
              }
              return (
                <a
                  key={`${url}-${index}`}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-[160px] shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:border-teal-200 hover:bg-teal-50"
                  title={row.title || url}
                >
                  {inner}
                </a>
              );
            })}
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="space-y-3 border-t border-slate-100 px-4 py-3">
          {meta.abstract ? (
            <div className="rounded-xl bg-slate-50/90 px-3.5 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t(language, "ai_web_summary")}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-700">{meta.abstract}</p>
            </div>
          ) : null}
          {results.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {results.slice(0, 6).map((row, index) => {
                const title = row.title || row.snippet || "Source";
                const url = row.url || "";
                const snippet = row.snippet || "";
                const card = (
                  <div className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-teal-600 text-[10px] font-bold text-white">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-semibold text-slate-900">{title}</p>
                      {url ? <p className="mt-0.5 truncate text-[11px] text-teal-700">{hostFromUrl(url)}</p> : null}
                      {snippet && snippet !== title ? (
                        <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-slate-600">{snippet}</p>
                      ) : null}
                    </div>
                  </div>
                );
                if (!url) {
                  return (
                    <div key={`${title}-${index}`} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                      {card}
                    </div>
                  );
                }
                return (
                  <a
                    key={`${url}-${index}`}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 transition hover:border-teal-200 hover:bg-teal-50/30"
                  >
                    {card}
                  </a>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
