"use client";

import { useMemo } from "react";
import { useAppContext } from "@/components/providers/app-provider";
import { PBI } from "@/lib/pbi-theme";

export function PlatformPeriodBanner() {
  const { payload, filters } = useAppContext();
  const fr = filters.language === "Français";

  const { start, end } = useMemo(() => {
    const raw = payload.effective_dates.length ? payload.effective_dates : payload.selected_dates;
    const sorted = [...raw].sort();
    const first = sorted[0] ?? "—";
    const last = sorted[sorted.length - 1] ?? first;
    return { start: first, end: last };
  }, [payload.effective_dates, payload.selected_dates]);

  return (
    <article className="relative w-full overflow-hidden rounded-lg border border-[#E2E8F0] bg-white p-5 shadow-[0_1px_3px_rgba(30,41,59,0.06)]">
      <div
        className="pointer-events-none absolute -right-4 -top-6 h-16 w-16 rotate-12 opacity-[0.07]"
        style={{ backgroundColor: PBI.red }}
        aria-hidden
      />
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#64748B]">
        {fr ? "Période" : "Period"}
      </p>
      <div className="mt-2">
        <div className="flex items-center gap-3">
          <span className="text-3xl font-bold leading-none tracking-tight text-[#ED1C24]">{start}</span>
          <span className="text-2xl font-bold leading-none text-[#ED1C24]" aria-hidden>
            →
          </span>
        </div>
        <span className="mt-1 block text-3xl font-bold leading-none tracking-tight text-[#ED1C24]">{end}</span>
      </div>
    </article>
  );
}
