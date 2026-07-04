"use client";

import { useEffect } from "react";
import { installGlobalErrorReporter } from "@/components/ui/error-reporter";

export function ErrorReporterInit() {
  useEffect(() => {
    installGlobalErrorReporter();
  }, []);
  return null;
}
