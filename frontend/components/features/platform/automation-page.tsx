"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlatformPeriodBanner } from "@/components/layout/platform-period-banner";
import { useAppContext } from "@/components/providers/app-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { getN8nStatus, triggerN8nWorkflow, type N8nStatus } from "@/lib/api";
import { isAdmin } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { PBI } from "@/lib/pbi-theme";

const CLIENT_EMBED_URL = (process.env.NEXT_PUBLIC_N8N_EMBED_URL ?? "").trim();

function iconFor(name: string) {
  if (name.includes("ingest")) return "⬆";
  if (name.includes("shield") || name.includes("guardian")) return "🛡";
  if (name.includes("chart") || name.includes("power")) return "📊";
  return "⚡";
}

export function AutomationPage() {
  const { filters } = useAppContext();
  const { user } = useAuth();
  const fr = filters.language === "Français";
  const admin = isAdmin(user);

  const [status, setStatus] = useState<N8nStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [running, setRunning] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const embedUrl = useMemo(() => CLIENT_EMBED_URL || status?.embedUrl || status?.baseUrl || "", [status]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setStatus(await getN8nStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load n8n status.");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runWorkflow = async (workflowId: string) => {
    setRunning(workflowId);
    setToast("");
    try {
      await triggerN8nWorkflow(workflowId, { vendor: filters.vendor, language: filters.language });
      setToast(fr ? "Workflow n8n déclenché." : "n8n workflow triggered.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trigger failed.");
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="animate-premium-in flex min-h-[calc(100vh-140px)] flex-col gap-4">
      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <header className="premium-card relative flex flex-col justify-center overflow-hidden rounded-2xl px-5 py-4">
          <div
            className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rotate-12 opacity-[0.06]"
            style={{ backgroundColor: PBI.teal }}
            aria-hidden
          />
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#64748B]">RAN Intelligence</p>
          <h2 className="text-lg font-bold tracking-tight text-[#1E293B]">
            {fr ? "Automatisation n8n" : "n8n Automation"}
          </h2>
          <p className="mt-1 text-sm text-[#64748B]">
            {fr
              ? "Orchestration post-ingestion, Guardian, Power BI et alertes NOC — remplace le moniteur Guardian."
              : "Post-ingest, Guardian, Power BI and NOC alert orchestration — replaces the Guardian monitor."}
          </p>
        </header>

        <PlatformPeriodBanner />
      </div>

      {toast ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{toast}</p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <section className="premium-card space-y-3 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-slate-900">{fr ? "Workflows" : "Workflows"}</h3>
          {loading ? (
            <p className="text-sm text-slate-500">{t(filters.language, "loading")}</p>
          ) : (
            <ul className="space-y-3">
              {(status?.workflows ?? []).map((flow) => (
                <li key={flow.id} className="rounded-xl border border-slate-100 bg-white p-3">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F8FAFC] text-lg">
                      {iconFor(flow.icon)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">{flow.name}</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">{flow.description}</p>
                      <span
                        className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          flow.configured ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
                        }`}
                      >
                        {flow.configured
                          ? fr
                            ? "Webhook configuré"
                            : "Webhook configured"
                          : fr
                            ? "Webhook à configurer"
                            : "Webhook pending"}
                      </span>
                    </div>
                  </div>
                  {admin && flow.configured ? (
                    <button
                      type="button"
                      disabled={running === flow.id}
                      onClick={() => void runWorkflow(flow.id)}
                      className="mt-3 w-full rounded-xl border border-[#1E293B] bg-[#1E293B] px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60"
                    >
                      {running === flow.id ? (fr ? "Exécution…" : "Running…") : fr ? "Déclencher" : "Trigger"}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="premium-card flex min-h-[520px] flex-col rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">n8n</h3>
            {embedUrl ? (
              <a
                href={embedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-teal-500 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50"
              >
                {fr ? "Ouvrir n8n" : "Open n8n"}
              </a>
            ) : null}
          </div>
          {embedUrl ? (
            <iframe
              title="n8n — RAN Intelligence"
              src={embedUrl}
              className="min-h-[480px] w-full flex-1 rounded-xl border border-slate-200 bg-white"
              allowFullScreen
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-6 text-center">
              <p className="text-sm font-semibold text-slate-700">
                {fr ? "n8n non configuré" : "n8n not configured"}
              </p>
              <p className="mt-2 max-w-md text-xs text-slate-500">
                {fr
                  ? "Lancez docker compose -f docker-compose.identity.yml up -d puis définissez NEXT_PUBLIC_N8N_EMBED_URL."
                  : "Run docker compose -f docker-compose.identity.yml up -d then set NEXT_PUBLIC_N8N_EMBED_URL."}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
