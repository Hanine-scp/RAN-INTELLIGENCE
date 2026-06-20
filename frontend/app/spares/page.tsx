"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SparesPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/foresight?view=spares");
  }, [router]);
  return null;
}
