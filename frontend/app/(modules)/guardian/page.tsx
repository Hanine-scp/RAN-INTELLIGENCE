"use client";

import { Suspense } from "react";
import GuardianRedirect from "./redirect";

export default function GuardianPage() {
  return (
    <Suspense fallback={null}>
      <GuardianRedirect />
    </Suspense>
  );
}
