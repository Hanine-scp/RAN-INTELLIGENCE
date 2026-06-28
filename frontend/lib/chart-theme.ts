/**
 * Palette premium — alignée Power BI (navy · rouge Ooredoo · teal).
 */

import { PBI, PBI_CHART_COLORS } from "@/lib/pbi-theme";

export const PALETTE = {
  gunmetal: PBI.navy,
  turquoise: PBI.teal,
  mintCream: PBI.pageBg,
  bittersweet: PBI.red,
  yellow: "#D97706",
} as const;

export const BRAND = {
  teal: PBI.teal,
  tealDark: "#0D5F58",
  tealBright: PBI.tealMid,
  gray: PBI.textMuted,
  grayDark: PBI.navy,
  grayLight: PBI.border,
  red: PBI.red,
  redDark: PBI.redDark,
  redMid: "#F87171",
  redLight: "#FECACA",
  redSoft: "#FEE2E2",
  rose: PBI.red,
  roseLight: "#F87171",
  purple: PBI.navy,
  orange: PBI.warn,
  yellow: "#D97706",
  olive: PBI.teal,
  navy: PBI.navy,
  navyMid: PBI.navyMid,
  navyLight: "#475569",
  royalBlue: PBI.tealMid,
  skyBlue: "#E2E8F0",
  sage: PBI.textMuted,
  muted: PBI.textMuted,
  border: PBI.border,
  track: PBI.pageBgDeep,
  trackTeal: "#ECFDF5",
  pageBg: PBI.pageBg,
  card: PBI.card,
  premium: PBI.navy,
  premiumDark: PBI.navy,
  premiumLight: PBI.textSoft,
} as const;

/** Séries multiples — cycle palette Power BI */
export const CHART_PALETTE = [...PBI_CHART_COLORS] as const;

export const STACKED_PALETTE = [...PBI_CHART_COLORS] as const;

export const CHART_GRID = PBI.border;
export const CHART_AXIS = PBI.textMuted;
export const CHART_TOOLTIP_BORDER = PBI.border;

/** Style Recharts partagé — flat analytics pro */
export const CHART_PRO = {
  margin: { top: 12, right: 12, left: 0, bottom: 4 },
  marginDualAxis: { top: 16, right: 56, left: 8, bottom: 4 },
  marginCompact: { top: 4, right: 4, left: 0, bottom: 0 },
  grid: {
    stroke: CHART_GRID,
    strokeDasharray: "0",
    vertical: false,
  },
  axis: {
    tick: { fill: CHART_AXIS, fontSize: 10, fontFamily: "Inter, Segoe UI, sans-serif" },
    axisLine: false as const,
    tickLine: false as const,
  },
  tooltip: {
    borderRadius: 4,
    border: `1px solid ${CHART_TOOLTIP_BORDER}`,
    boxShadow: "0 4px 16px rgba(41, 47, 54, 0.08)",
    fontSize: 11,
    color: PALETTE.gunmetal,
  },
  legend: {
    fontSize: 10,
    color: CHART_AXIS,
  },
  bar: {
    maxBarSize: 28,
    radius: [2, 2, 0, 0] as [number, number, number, number],
    categoryGap: "18%",
  },
  line: {
    strokeWidth: 2,
    type: "linear" as const,
    dot: false,
    activeDot: { r: 3, strokeWidth: 0 },
  },
  area: {
    fillOpacity: 0.22,
    type: "linear" as const,
  },
  pie: {
    innerRadius: "58%",
    outerRadius: "82%",
    paddingAngle: 1,
    stroke: "#FFFFFF",
    strokeWidth: 2,
  },
  frame: "rounded-lg border border-[#E2E8F0] bg-white p-4 shadow-[0_1px_3px_rgba(30,41,59,0.06)]",
  card: "rounded-lg border border-[#E2E8F0] bg-white p-4 shadow-[0_1px_3px_rgba(30,41,59,0.06)]",
  cardTitle: "text-[10px] font-semibold uppercase tracking-[0.12em] text-[#64748B]",
  cardValue: "text-3xl font-bold leading-none tracking-tight text-[#1E293B]",
} as const;

export const CHART_PRIMARY = PBI.teal;
export const CHART_SECONDARY = PBI.red;
export const CHART_TERTIARY = PBI.navy;
export const CHART_LINE = PBI.teal;
export const CHART_RING_TRACK = BRAND.track;
export const CHART_TARGET = PBI.red;
export const CHART_POSITIVE = PBI.good;
export const CHART_NEGATIVE = PBI.red;

export const TECH_COLORS: Record<string, string> = {
  cells_2g: "#D97706",
  cells_3g: PBI.teal,
  cells_4g: PBI.navyMid,
  cells_4g_fdd: PBI.navy,
  cells_4g_tdd: PBI.tealMid,
  cells_5g: PBI.red,
  "2G": "#D97706",
  "3G": PBI.teal,
  "4G": PBI.navyMid,
  "5G": PBI.red,
};

export const DELTA_COLORS = {
  before: PBI.textMuted,
  after: PBI.teal,
  added: PBI.teal,
  removed: PBI.red,
  ancien: PBI.textMuted,
  nouveau: PBI.teal,
  nouvelle_valeur: PBI.teal,
  ancienne_valeur: PBI.textMuted,
  beforeLight: PBI.textSoft,
  afterLight: "#14B8A6",
} as const;

export const SEVERITY_COLORS: Record<string, string> = {
  High: PALETTE.bittersweet,
  Medium: PALETTE.yellow,
  Low: PALETTE.turquoise,
  Critical: PALETTE.gunmetal,
  Critique: PALETTE.gunmetal,
  Fragile: PALETTE.bittersweet,
  Stable: PALETTE.turquoise,
};

export const CLUSTER_COLORS = [...CHART_PALETTE];

export const HEADER_ACCENT_CYCLE = [
  PALETTE.turquoise,
  PALETTE.bittersweet,
  PALETTE.yellow,
  PALETTE.gunmetal,
  "#3AB8B0",
  "#FF8585",
] as const;

export function headerAccent(index: number): string {
  return HEADER_ACCENT_CYCLE[index % HEADER_ACCENT_CYCLE.length];
}

export function chartColor(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length];
}

export function paletteForKeys(keys: string[]): { key: string; color: string }[] {
  return keys.map((key, index) => ({
    key,
    color: TECH_COLORS[key] ?? chartColor(index),
  }));
}

export function techBar(key: string, fallbackIndex = 0): { key: string; color: string } {
  return { key, color: TECH_COLORS[key] ?? chartColor(fallbackIndex) };
}

export const CSS_VARS = {
  accent: PBI.teal,
  accentDeep: "#0D5F58",
  accentGlow: "rgba(15, 118, 110, 0.12)",
  brandTeal: PBI.teal,
  brandRed: PBI.red,
  brandPurple: PBI.navy,
  brandOrange: PBI.red,
  brandYellow: "#D97706",
  brandOlive: PBI.teal,
} as const;
