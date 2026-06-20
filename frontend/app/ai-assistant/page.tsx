"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AiAssistantWorkspace } from "@/components/ai-assistant-workspace";
import { useAppContext } from "@/components/app-provider";

function AiAssistantContent() {
  const { filters, payload } = useAppContext();
  const searchParams = useSearchParams();
  const siteId = searchParams.get("site_id")?.trim() || undefined;
  const action = searchParams.get("action")?.trim();
  const fr = filters.language === "Français";

  const seedPrompt = siteId
    ? action === "rca"
      ? fr
        ? `RCA complète et analyse premium du site ${siteId} — KPI CSSR/DCR/PRB, impact, cause probable et actions terrain.`
        : `Full premium RCA for site ${siteId} — CSSR/DCR/PRB KPIs, impact, probable cause and field actions.`
      : fr
        ? `Analyse IA complète du site ${siteId}`
        : `Full AI analysis for site ${siteId}`
    : undefined;

  return (
    <div className="relative min-h-[calc(100vh-5.5rem)] w-full px-4 py-5 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,#f0fdfa_0%,#f8fafc_45%,#eef2f7_100%)]" />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-7xl">
        <AiAssistantWorkspace
          language={filters.language}
          payload={payload}
          seedSiteId={siteId}
          seedPrompt={seedPrompt}
        />
      </div>
    </div>
  );
}

export default function AiAssistantPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100vh-5.5rem)] items-center justify-center text-sm text-slate-500">
          Chargement RAN Intelligence…
        </div>
      }
    >
      <AiAssistantContent />
    </Suspense>
  );
}
