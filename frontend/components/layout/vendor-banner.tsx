"use client";

import { useEffect, useState } from "react";
import { useAppContext } from "@/components/providers/app-provider";
import { getVendors } from "@/lib/api";
import { t } from "@/lib/i18n";

export function VendorBanner() {
  const { filters } = useAppContext();
  const [phase, setPhase] = useState<string>("live");

  useEffect(() => {
    const run = async () => {
      try {
        const data = await getVendors();
        const current = data.vendors.find((v) => v.vendor === filters.vendor);
        setPhase(current?.phase ?? "scaffold");
      } catch {
        setPhase(filters.vendor === "huawei" ? "scaffold" : "live");
      }
    };
    void run();
  }, [filters.vendor]);

  if (filters.vendor === "nokia" && phase === "live") return null;

  const isFr = filters.language === "Français";
  const label = filters.vendor === "huawei" ? "Huawei RAN" : "Nokia RAN";

  return (
    <div
      className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${
        phase === "scaffold"
          ? "border-amber-200/90 bg-gradient-to-r from-amber-50 to-white text-amber-950"
          : "border-red-200/90 bg-gradient-to-r from-red-50 to-white text-red-900"
      }`}
    >
      <p className="font-bold">{label}</p>
      <p className="mt-0.5 text-xs opacity-90">
        {phase === "scaffold"
          ? isFr
            ? t(filters.language, "vendor_scaffold_message")
            : t(filters.language, "vendor_scaffold_message")
          : isFr
            ? "Données actives — même plateforme, même parcours que Nokia."
            : "Live data — same platform experience as Nokia."}
      </p>
    </div>
  );
}
