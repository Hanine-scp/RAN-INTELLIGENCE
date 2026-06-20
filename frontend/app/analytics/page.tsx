"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AnalyticsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/insight?view=analytics");
  }, [router]);
  return null;
}
