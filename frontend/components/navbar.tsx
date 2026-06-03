"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppContext } from "@/components/app-provider";
import { t } from "@/lib/i18n";

const navItems = [
  { href: "/", key: "nav_home" },
  { href: "/sites", key: "nav_sites" },
  { href: "/inventaire", key: "nav_inventory" },
  { href: "/delta", key: "nav_delta" },
  { href: "/statistiques", key: "nav_stats" },
  { href: "/prediction", key: "nav_prediction" },
  { href: "/delta-intelligence", key: "nav_delta_intel" },
  { href: "/analytics", key: "nav_analytics" },
  { href: "/ai-assistant", key: "nav_ai" },
] as const;

export function Navbar() {
  const pathname = usePathname();
  const { filters } = useAppContext();

  return (
    <header className="sticky top-0 z-20 border-b border-red-100 bg-white/95 backdrop-blur">
      <nav className="mx-auto flex max-w-[1400px] items-center gap-2 overflow-x-auto px-4 py-3">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                active ? "bg-red-600 text-white shadow-sm" : "bg-red-50 text-red-700 hover:bg-red-100"
              }`}
            >
              {t(filters.language, item.key)}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
