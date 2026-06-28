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
    label: { Français: "Patrimoine", English: "Heritage" },
    items: [{ href: "/", key: "nav_home", icon: "home" }],
  },
  {
    label: { Français: "Supervision", English: "Supervision" },
    items: [
      { href: "/timeline", key: "nav_timeline", icon: "compare" },
      { href: "/automation", key: "nav_automation", icon: "workflow" },
    ],
  },
  {
    label: { Français: "Anticipation", English: "Foresight" },
    items: [{ href: "/foresight", key: "nav_foresight", icon: "trend" }],
  },
  {
    label: { Français: "Intelligence", English: "Intelligence" },
    items: [{ href: "/signals", key: "nav_signals", icon: "sparkles" }],
  },
  {
    label: { Français: "Plateforme", English: "Platform" },
    items: [
      { href: "/ai-assistant", key: "nav_ai", icon: "sparkles" },
      { href: "/power-bi", key: "nav_cartographie_reseau", icon: "bars" },
      { href: "/import", key: "nav_import", icon: "upload" },
      { href: "/ops", key: "nav_ops", icon: "pulse" },
    ],
  },
];

export const flatNavItems: NavItem[] = navSections.flatMap((section) => section.items);

export function findNavItem(pathname: string): NavItem | undefined {
  const exact = flatNavItems.find((item) => item.href === pathname);
  if (exact) return exact;
  return flatNavItems
    .filter((item) => item.href !== "/" && pathname.startsWith(item.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
