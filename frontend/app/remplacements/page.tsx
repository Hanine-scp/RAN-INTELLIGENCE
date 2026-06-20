"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ReplacementsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/guardian?view=changements");
  }, [router]);

  return null;
}
