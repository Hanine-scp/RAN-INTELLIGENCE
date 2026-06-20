"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RiskCardsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/guardian?view=cartes-risque");
  }, [router]);

  return null;
}
