"use client";

import { useEffect } from "react";
import { installGlobalErrorReporter } from "@/components/error-reporter";

export function ErrorReporterInit() {
  useEffect(() => {
    installGlobalErrorReporter();
  }, []);
  return null;
}
