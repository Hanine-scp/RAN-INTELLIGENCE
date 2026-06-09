import type { t } from "@/lib/i18n";

export type NavKey = Parameters<typeof t>[1];

export type NavItem = {
  href: string;
  key: NavKey;
  icon: string;
};

export type NavSection = {
  label: { Français: string; English: string };
  items: NavItem[];
};

export const navSections: NavSection[] = [
  {
    label: { Français: "Pilotage", English: "Operations" },
    items: [
      { href: "/", key: "nav_home", icon: "home" },
      { href: "/sites", key: "nav_sites", icon: "pin" },
      { href: "/inventaire", key: "nav_inventory", icon: "box" },
      { href: "/asset-distribution", key: "nav_asset_distribution", icon: "layers" },
      { href: "/quality", key: "nav_quality", icon: "shield" },
      { href: "/ops", key: "nav_ops", icon: "pulse" },
    ],
  },
  {
    label: { Français: "Évolution", English: "Evolution" },
    items: [
      { href: "/delta", key: "nav_delta", icon: "compare" },
      { href: "/remplacements", key: "nav_replacements", icon: "compare" },
      { href: "/statistiques", key: "nav_stats", icon: "bars" },
      { href: "/prediction", key: "nav_prediction", icon: "trend" },
      { href: "/spares", key: "nav_spares", icon: "package" },
    ],
  },
  {
    label: { Français: "Analytique", English: "Analytics" },
    items: [
      { href: "/analytics", key: "nav_analytics", icon: "pie" },
      { href: "/temporal-changes", key: "nav_temporal_changes", icon: "clock" },
      { href: "/global-counters", key: "nav_global_counters", icon: "hash" },
    ],
  },
  {
    label: { Français: "IA & Risques", English: "AI & Risk" },
    items: [
      { href: "/anomalies", key: "nav_anomalies", icon: "alert" },
      { href: "/cartes-risque", key: "nav_risk_cards", icon: "shield" },
      { href: "/patterns", key: "nav_patterns", icon: "sparkles" },
      { href: "/clustering", key: "nav_clustering", icon: "scatter" },
      { href: "/ai-report", key: "nav_report", icon: "report" },
      { href: "/ai-assistant", key: "nav_ai", icon: "sparkles" },
    ],
  },
];

export const flatNavItems: NavItem[] = navSections.flatMap((section) => section.items);

export function findNavItem(pathname: string): NavItem | undefined {
  const exact = flatNavItems.find((item) => item.href === pathname);
  if (exact) return exact;
  // Longest non-root prefix match for nested routes.
  return flatNavItems
    .filter((item) => item.href !== "/" && pathname.startsWith(item.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
