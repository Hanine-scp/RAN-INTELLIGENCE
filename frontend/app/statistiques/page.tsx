"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function StatistiquesPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/power-bi");
  }, [router]);
  return null;
}
