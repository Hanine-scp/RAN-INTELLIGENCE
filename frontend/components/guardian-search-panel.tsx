"use client";

import { FormEvent, useCallback, useRef, useState } from "react";
import Link from "next/link";
import { searchPlatform, searchWeb, type GuardianSearchResult, type WebSearchApiResponse } from "@/lib/api";
import { t, type Locale } from "@/lib/i18n";
import type { FilterPayload } from "@/lib/types";

type GuardianSearchPanelProps = {
  language: Locale;
  payload: FilterPayload;
};

type SearchMode = "platform" | "web";

type ResultRow = GuardianSearchResult & {
  source: "platform" | "web";
};

export function GuardianSearchPanel({ language, payload }: GuardianSearchPanelProps) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("platform");
  const [results, setResults] = useState<ResultRow[]>([]);
  const [webMeta, setWebMeta] = useState<WebSearchApiResponse | null>(null);
  const [sourceLabel, setSourceLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const lastQueryRef = useRef("");

  const resolveQuery = useCallback(
    (forced?: string) => {
      const value = (forced ?? query).trim();
      if (value) lastQueryRef.current = value;
      return value || lastQueryRef.current.trim();
    },
    [query],
  );

  const runWebSearch = useCallback(
    async (forcedQuery?: string) => {
      const value = resolveQuery(forcedQuery);
      if (!value) {
        setError(t(language, "guardian_search_empty_query"));
        setResults([]);
        setWebMeta(null);
        return;
      }

      setMode("web");
      setLoading(true);
      setError("");
      setResults([]);
      setWebMeta(null);
      setSourceLabel(t(language, "guardian_search_source_web"));

      try {
        const data = await searchWeb(value, language);
        setWebMeta(data);
        const mapped = (data.results ?? []).map((row) => ({
          type: "Web",
          title: row.title || row.url || "Source",
          description: row.snippet || "",
          url: row.url,
          source: "web" as const,
        }));
        setResults(mapped);
        if (!mapped.length && !data.abstract) {
          setError(t(language, "guardian_search_no_results"));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t(language, "guardian_search_error_web"));
        setResults([]);
        setWebMeta(null);
      } finally {
        setLoading(false);
      }
    },
    [language, resolveQuery],
  );

  const runSmartSearch = useCallback(
    async (forcedQuery?: string) => {
      const value = resolveQuery(forcedQuery);
      if (!value) {
        setError(t(language, "guardian_search_empty_query"));
        setResults([]);
        setWebMeta(null);
        return;
      }

      setMode("platform");
      setLoading(true);
      setError("");
      setWebMeta(null);
      setSourceLabel(t(language, "guardian_search_source_platform"));

      try {
        const data = await searchPlatform(payload, value);
        const mapped = (data.results ?? []).map((row) => ({ ...row, source: "platform" as const }));
        setResults(mapped);
        if (!mapped.length) {
          setError(t(language, "guardian_search_platform_empty"));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t(language, "guardian_search_error_platform"));
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [language, payload, resolveQuery],
  );

  const switchToWeb = useCallback(() => {
    const value = resolveQuery();
    if (!value) {
      setError(t(language, "guardian_search_empty_query"));
      return;
    }
    void runWebSearch(value);
  }, [language, resolveQuery, runWebSearch]);

  const switchToPlatform = useCallback(() => {
    setMode("platform");
    const value = resolveQuery();
    if (value) void runSmartSearch(value);
  }, [resolveQuery, runSmartSearch]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === "web") void runWebSearch();
    else void runSmartSearch();
  };

  const loadingLabel =
    mode === "web" ? t(language, "guardian_search_loading_web") : t(language, "guardian_search_loading");

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
      <div className="mb-3 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
        <button
          type="button"
          onClick={() => void switchToPlatform()}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            mode === "platform" ? "bg-white text-teal-800 shadow-sm" : "text-slate-600 hover:text-teal-700"
          }`}
        >
          {t(language, "guardian_search_smart")}
        </button>
        <button
          type="button"
          onClick={() => switchToWeb()}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            mode === "web" ? "bg-white text-teal-800 shadow-sm" : "text-slate-600 hover:text-teal-700"
          }`}
        >
          {t(language, "guardian_search_web")}
        </button>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t(language, "guardian_search_placeholder")}
          className="flex-1 rounded-xl border border-slate-200 px-4 py-3.5 text-sm text-slate-800 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-800 disabled:opacity-60"
        >
          {mode === "web" ? t(language, "guardian_search_web") : t(language, "guardian_search_smart")}
        </button>
      </form>

      {loading ? <p className="mt-3 text-sm text-slate-500">{loadingLabel}</p> : null}
      {error ? (
        <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{error}</p>
      ) : null}

      {mode === "web" && webMeta?.corrected_query && webMeta.corrected_query !== lastQueryRef.current ? (
        <p className="mt-3 text-xs text-slate-500">
          {t(language, "guardian_search_corrected")} :{" "}
          <strong className="text-slate-800">{webMeta.corrected_query}</strong>
        </p>
      ) : null}

      {mode === "web" && webMeta?.abstract ? (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {t(language, "ai_web_summary")}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{webMeta.abstract}</p>
        </div>
      ) : null}

      {results.length ? (
        <div className="mt-4 grid gap-3">
          {results.map((item, index) => {
            const card = (
              <>
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-teal-700">
                  {sourceLabel} · {item.type}
                </p>
                <p className="mt-1 text-base font-extrabold text-slate-900">{item.title}</p>
                {item.description ? <p className="mt-1 text-sm text-slate-500">{item.description}</p> : null}
                {item.url ? (
                  <p className="mt-2 text-sm font-medium text-teal-700">{t(language, "guardian_search_open")}</p>
                ) : null}
              </>
            );

            if (item.url) {
              return (
                <a
                  key={`${item.title}-${index}`}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-teal-200 hover:shadow-sm"
                >
                  {card}
                </a>
              );
            }

            if (item.href) {
              return (
                <Link
                  key={`${item.title}-${index}`}
                  href={item.href}
                  className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-teal-200 hover:shadow-sm"
                >
                  {card}
                </Link>
              );
            }

            return (
              <div key={`${item.title}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                {card}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
