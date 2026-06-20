"use client";

import { Component, type ReactNode } from "react";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";

async function reportClientError(payload: Record<string, unknown>) {
  if (SENTRY_DSN) {
    console.error("[client-error]", payload);
  }
  try {
    await fetch(`${API_BASE}/ops/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // ignore telemetry failures
  }
}

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ClientErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    void reportClientError({
      message: error.message,
      stack: error.stack,
      component_stack: info.componentStack,
      path: typeof window !== "undefined" ? window.location.pathname : "",
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="m-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Une erreur inattendue est survenue. Rechargez la page ou contactez le support NOC.
        </div>
      );
    }
    return this.props.children;
  }
}

export function installGlobalErrorReporter() {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (event) => {
    void reportClientError({
      message: event.message,
      stack: event.error instanceof Error ? event.error.stack : undefined,
      source: event.filename,
      line: event.lineno,
      path: window.location.pathname,
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    void reportClientError({
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      path: window.location.pathname,
      kind: "unhandledrejection",
    });
  });
}
