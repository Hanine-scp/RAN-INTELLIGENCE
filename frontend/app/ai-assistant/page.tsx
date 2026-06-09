"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AiAssistantWorkspace } from "@/components/ai-assistant-workspace";
import { useAppContext } from "@/components/app-provider";
import { OoredooPolyBackground } from "@/components/ooredoo-poly-bg";

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
    <div className="relative flex min-h-[calc(100vh-5.5rem)] w-full items-center justify-center px-4 py-5 sm:px-8">
      <OoredooPolyBackground className="rounded-2xl opacity-90" />
      <div className="relative z-10 w-full max-w-6xl">
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
