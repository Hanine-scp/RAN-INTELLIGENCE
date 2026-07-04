"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TemporalChangesPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/guardian?view=changements&panel=evolutions");
  }, [router]);

  return null;
}
