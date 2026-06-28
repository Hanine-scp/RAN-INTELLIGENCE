"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function GuardianRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const view = searchParams.get("view");
    const panel = searchParams.get("panel");
    const params = new URLSearchParams();
    if (view) params.set("legacy", view);
    if (panel) params.set("panel", panel);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    router.replace(`/automation${suffix}`);
  }, [router, searchParams]);

  return null;
}
