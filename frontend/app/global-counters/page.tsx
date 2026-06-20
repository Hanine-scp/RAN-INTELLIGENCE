"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GlobalCountersPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/?view=compteurs");
  }, [router]);

  return null;
}
