import { findNavItem } from "@/lib/nav";
import { t, type Locale } from "@/lib/i18n";

export type PageReportConfig = {
  scopeId: string;
  title: string;
  viewLabel: string | null;
};

const EXCLUDED_EXACT = new Set(["/ai-assistant", "/import"]);
const EXCLUDED_OWN_REPORT = new Set(["/", "/guardian", "/timeline", "/delta", "/power-bi", "/cartographie-reseau"]);

type TabKey = Parameters<typeof t>[1];

const INSIGHT_TAB_KEYS: Record<string, TabKey> = {
  statistics: "insight_tab_statistics",
  analytics: "insight_tab_analytics",
  executive: "insight_tab_executive",
};

const FORESIGHT_TAB_KEYS: Record<string, TabKey> = {
  prediction: "foresight_tab_prediction",
  spares: "foresight_tab_spares",
};

const SIGNALS_TAB_KEYS: Record<string, TabKey> = {
  patterns: "signals_tab_patterns",
  clustering: "signals_tab_clustering",
};

function normalizeView(view: string | null): string {
  return (view ?? "").toLowerCase().trim();
}

function resolveInsightTab(view: string | null): keyof typeof INSIGHT_TAB_KEYS {
  const normalized = normalizeView(view);
  if (normalized === "analytics" || normalized === "analytique") return "analytics";
  if (normalized === "executive" || normalized === "power-bi" || normalized === "powerbi") return "executive";
  return "statistics";
}

function resolveForesightTab(view: string | null): keyof typeof FORESIGHT_TAB_KEYS {
  const normalized = normalizeView(view);
  if (normalized === "spares" || normalized === "spare") return "spares";
  return "prediction";
}

function resolveSignalsTab(view: string | null): keyof typeof SIGNALS_TAB_KEYS {
  const normalized = normalizeView(view);
  if (normalized === "clustering" || normalized === "cluster") return "clustering";
  return "patterns";
}

export function shouldShowStandardPageReport(pathname: string): boolean {
  if (EXCLUDED_EXACT.has(pathname)) return false;
  if (EXCLUDED_OWN_REPORT.has(pathname)) return false;
  return true;
}

export function buildReportContextBadge(
  viewLabel: string | null,
  effectiveDates: string[],
  selectedDates: string[],
): string {
  const dates = effectiveDates.length ? effectiveDates : selectedDates;
  const datePart =
    dates.length === 1
      ? dates[0]
      : dates.length > 1
        ? `${[...dates].sort()[0]} → ${[...dates].sort().slice(-1)[0]}`
        : "";

  if (viewLabel && datePart) return `${viewLabel} — ${datePart}`;
  return viewLabel || datePart;
}

export function resolveHubPageReportConfig(
  hub: "insight" | "foresight" | "signals",
  tab: string,
  language: Locale,
): PageReportConfig {
  if (hub === "insight") {
    const resolved = resolveInsightTab(tab);
    return {
      scopeId: `insight-${resolved}`,
      title: t(language, "hub_report_title_insight"),
      viewLabel: t(language, INSIGHT_TAB_KEYS[resolved]),
    };
  }

  if (hub === "foresight") {
    const resolved = resolveForesightTab(tab);
    return {
      scopeId: `foresight-${resolved}`,
      title: t(language, "hub_report_title_foresight"),
      viewLabel: t(language, FORESIGHT_TAB_KEYS[resolved]),
    };
  }

  const resolved = resolveSignalsTab(tab);
  return {
    scopeId: `signals-${resolved}`,
    title: t(language, "hub_report_title_signals"),
    viewLabel: t(language, SIGNALS_TAB_KEYS[resolved]),
  };
}

export function resolvePageReportConfig(
  pathname: string,
  view: string | null,
  language: Locale,
): PageReportConfig | null {
  if (!shouldShowStandardPageReport(pathname)) return null;

  if (pathname === "/power-bi" || pathname.startsWith("/power-bi/")) {
    return {
      scopeId: "power-bi",
      title: t(language, "hub_report_title_cartographie"),
      viewLabel: t(language, "page_cartographie_reseau_title"),
    };
  }

  if (pathname === "/cartographie-reseau" || pathname.startsWith("/cartographie-reseau/")) {
    return {
      scopeId: "cartographie-reseau",
      title: t(language, "hub_report_title_cartographie"),
      viewLabel: t(language, "page_cartographie_reseau_title"),
    };
  }

  if (pathname === "/insight" || pathname.startsWith("/insight/")) {
    const tab = resolveInsightTab(view);
    return {
      scopeId: `insight-${tab}`,
      title: t(language, "hub_report_title_insight"),
      viewLabel: t(language, INSIGHT_TAB_KEYS[tab]),
    };
  }

  if (pathname === "/foresight" || pathname.startsWith("/foresight/")) {
    const tab = resolveForesightTab(view);
    return {
      scopeId: `foresight-${tab}`,
      title: t(language, "hub_report_title_foresight"),
      viewLabel: t(language, FORESIGHT_TAB_KEYS[tab]),
    };
  }

  if (pathname === "/signals" || pathname.startsWith("/signals/")) {
    const tab = resolveSignalsTab(view);
    return {
      scopeId: `signals-${tab}`,
      title: t(language, "hub_report_title_signals"),
      viewLabel: t(language, SIGNALS_TAB_KEYS[tab]),
    };
  }

  if (pathname === "/ops" || pathname.startsWith("/ops/")) {
    return {
      scopeId: "ops",
      title: t(language, "hub_report_title_ops"),
      viewLabel: t(language, "page_ops_title"),
    };
  }

  if (pathname.startsWith("/admin")) {
    const viewLabel =
      pathname.includes("/users")
        ? t(language, "hub_report_view_admin_users")
        : pathname.includes("/setup")
          ? t(language, "hub_report_view_admin_setup")
          : t(language, "hub_report_view_admin");
    return {
      scopeId: pathname.replace(/\//g, "-") || "admin",
      title: t(language, "hub_report_title_admin"),
      viewLabel,
    };
  }

  const nav = findNavItem(pathname);
  if (nav) {
    const pageName = t(language, nav.key);
    const fr = language === "Français";
    return {
      scopeId: pathname.replace(/\//g, "-") || "page",
      title: fr ? `Rapport ${pageName}` : `${pageName} Report`,
      viewLabel: null,
    };
  }

  return {
    scopeId: pathname.replace(/\//g, "-") || "page",
    title: t(language, "page_report_title"),
    viewLabel: null,
  };
}
