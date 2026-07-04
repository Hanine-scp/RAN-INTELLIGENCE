"use client";

import { Suspense } from "react";
import { PageReportSectionByRoute } from "@/components/reports/page-report-host-inner";

export function PageReportHost() {
  return (
    <Suspense fallback={null}>
      <PageReportSectionByRoute />
    </Suspense>
  );
}
