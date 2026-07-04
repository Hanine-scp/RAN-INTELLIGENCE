"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ClusteringPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/signals?view=clustering");
  }, [router]);
  return null;
}
