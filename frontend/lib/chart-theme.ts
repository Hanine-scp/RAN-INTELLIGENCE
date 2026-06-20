/** Premium business dashboard palette — navy · teal · royal blue · sage · target red · orange */

export const BRAND = {
  navy: "#5A7389",
  navyMid: "#64748B",
  teal: "#16A085",
  tealBright: "#2ECCBA",
  royalBlue: "#0984E3",
  skyBlue: "#74B9FF",
  sage: "#9DB09E",
  orange: "#E67E22",
  red: "#D63031",
  track: "#F1F5F9",
  trackTeal: "#EEF8F5",
  muted: "#64748B",
  border: "#E2E8F0",
  pageBg: "#FAFBFC",
  card: "#FFFFFF",
} as const;

export const CHART_PALETTE = [
  BRAND.teal,
  BRAND.navy,
  BRAND.royalBlue,
  BRAND.sage,
  BRAND.orange,
  BRAND.skyBlue,
  BRAND.tealBright,
  "#34495E",
  BRAND.red,
  "#7F8C8D",
] as const;

export const CHART_PRIMARY = BRAND.teal;
export const CHART_SECONDARY = BRAND.royalBlue;
export const CHART_TERTIARY = BRAND.royalBlue;
export const CHART_LINE = BRAND.teal;
export const CHART_GRID = BRAND.track;
export const CHART_AXIS = BRAND.muted;
export const CHART_RING_TRACK = BRAND.trackTeal;
export const CHART_TARGET = BRAND.red;

export const TECH_COLORS: Record<string, string> = {
  cells_2g: BRAND.sage,
  cells_3g: BRAND.teal,
  cells_4g: BRAND.royalBlue,
  cells_4g_fdd: BRAND.royalBlue,
  cells_4g_tdd: BRAND.tealBright,
  cells_5g: BRAND.orange,
  "2G": BRAND.sage,
  "3G": BRAND.teal,
  "4G": BRAND.royalBlue,
  "5G": BRAND.orange,
};

export const DELTA_COLORS = {
  before: BRAND.sage,
  after: BRAND.teal,
  added: BRAND.teal,
  removed: BRAND.red,
  ancien: BRAND.sage,
  nouveau: BRAND.teal,
  nouvelle_valeur: BRAND.teal,
  ancienne_valeur: "#BDC3C7",
  beforeLight: "#D5DBDB",
  afterLight: BRAND.trackTeal,
} as const;

export const SEVERITY_COLORS: Record<string, string> = {
  High: BRAND.orange,
  Medium: BRAND.orange,
  Low: BRAND.teal,
  Critical: BRAND.red,
  Critique: BRAND.red,
  Fragile: BRAND.orange,
  Stable: BRAND.teal,
};

export const CLUSTER_COLORS = [...CHART_PALETTE];

export const HEADER_ACCENT_CYCLE = [BRAND.teal, BRAND.royalBlue, BRAND.orange, BRAND.sage] as const;

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
