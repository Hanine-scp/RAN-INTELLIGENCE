"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PredictionPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/foresight?view=prediction");
  }, [router]);
  return null;
}
