"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SitesPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/?view=sites#sites-table");
  }, [router]);

  return null;
}
