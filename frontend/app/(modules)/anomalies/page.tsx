"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AnomaliesPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/guardian?view=anomalies");
  }, [router]);

  return null;
}
