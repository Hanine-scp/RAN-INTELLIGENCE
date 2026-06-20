"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function StatistiquesPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/insight?view=statistics");
  }, [router]);
  return null;
}
