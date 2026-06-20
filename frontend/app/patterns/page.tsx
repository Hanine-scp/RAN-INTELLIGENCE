"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PatternsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/signals?view=patterns");
  }, [router]);
  return null;
}
