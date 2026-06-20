"use client";

import { useReportWebVitals } from "next/web-vitals";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
const METRICS_ENDPOINT = process.env.NEXT_PUBLIC_METRICS_ENDPOINT ?? `${API_BASE}/ops/client-vitals`;

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (process.env.NODE_ENV === "development") {
      console.debug("[web-vitals]", metric.name, Math.round(metric.value), metric.id);
    }
    if (!METRICS_ENDPOINT) return;
    const body = JSON.stringify({
      name: metric.name,
      value: metric.value,
      id: metric.id,
      rating: metric.rating,
      navigationType: metric.navigationType,
      path: window.location.pathname,
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(METRICS_ENDPOINT, body);
      return;
    }
    void fetch(METRICS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  });
  return null;
}
