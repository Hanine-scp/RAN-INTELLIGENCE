"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AssetDistributionPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/?view=assets");
  }, [router]);

  return null;
}
