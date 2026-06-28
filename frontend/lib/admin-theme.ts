import { BRAND, PALETTE } from "@/lib/chart-theme";

export { BRAND, PALETTE };

/** Styles communs pages admin (Security Center, Users, …) — thème clair */
export const ADMIN = {
  pageBg: PALETTE.mintCream,
  card: "#FFFFFF",
  border: BRAND.border,
  borderStrong: "#D4EBE8",
  gunmetal: PALETTE.gunmetal,
  turquoise: PALETTE.turquoise,
  mint: PALETTE.mintCream,
  red: PALETTE.bittersweet,
  yellow: PALETTE.yellow,
  text: PALETTE.gunmetal,
  textMuted: BRAND.premiumLight,
  /** En-têtes & hero — fond clair (mint / blanc) */
  headerBg: "#FFFFFF",
  headerGradient: `linear-gradient(135deg, #FFFFFF 0%, ${PALETTE.mintCream} 50%, #E8FAF8 100%)`,
  headerBorder: "#D4EBE8",
  sectionHeaderBg: "#F7FFF7",
  overlay: "rgba(41, 47, 54, 0.28)",
} as const;

export const KPI_ACCENTS = [
  { border: PALETTE.turquoise, bg: "#E8FAF8", text: "#2D9A94" },
  { border: "#94C5C1", bg: "#F0FCFB", text: "#2D9A94" },
  { border: PALETTE.yellow, bg: "#FFF9E0", text: "#8A7200" },
  { border: PALETTE.bittersweet, bg: "#FFE8E8", text: "#C44E4E" },
  { border: "#3AB8B0", bg: "#F0FCFB", text: "#2D9A94" },
] as const;
