/**
 * Palette premium alignée Power BI (Ooredoo RAN Intelligence).
 * Miroir de docs/powerbi/ooredoo-ran-theme.json
 */
export const PBI = {
  navy: "#1E293B",
  navyMid: "#334155",
  red: "#ED1C24",
  redDark: "#DC2626",
  teal: "#0F766E",
  tealMid: "#0891B2",
  pageBg: "#F8FAFC",
  pageBgDeep: "#F1F5F9",
  card: "#FFFFFF",
  border: "#E2E8F0",
  rowAlt: "#F8FAFC",
  text: "#1E293B",
  textBody: "#334155",
  textMuted: "#64748B",
  textSoft: "#94A3B8",
  headerText: "#FFFFFF",
  good: "#059669",
  warn: "#D97706",
} as const;

export const PBI_CHART_COLORS = [
  PBI.navy,
  PBI.red,
  PBI.teal,
  PBI.tealMid,
  PBI.navyMid,
  "#475569",
  PBI.redDark,
  PBI.good,
] as const;
