"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppContext } from "@/components/app-provider";
import { NavIcon } from "@/components/nav-icon";
import { navSections } from "@/lib/nav";
import { t } from "@/lib/i18n";
import { BRAND } from "@/lib/chart-theme";

export function NavRail() {
  const pathname = usePathname();
  const { filters, navCollapsed, setNavCollapsed } = useAppContext();
  const language = filters.language;

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <aside
      className={`sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-white shadow-[2px_0_24px_rgba(15,23,42,0.04)] transition-[width] duration-200 md:flex ${
        navCollapsed ? "w-[78px]" : "w-64"
      }`}
    >
      <div
        className={`flex items-center border-b border-slate-100 px-3 py-3.5 ${navCollapsed ? "justify-center" : "justify-between gap-2"}`}
      >
        {!navCollapsed ? (
          <div className="min-w-0 pl-1">
            <p className="truncate text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">RAN</p>
            <p className="truncate text-sm font-semibold leading-tight text-slate-800">Intelligence</p>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setNavCollapsed((prev) => !prev)}
          aria-label={navCollapsed ? "Expand navigation" : "Collapse navigation"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-slate-500 transition hover:bg-slate-50"
        >
          {navCollapsed ? ">>" : "<<"}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {navSections.map((section) => (
          <div key={section.label.English} className="mb-5">
            {!navCollapsed ? (
              <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                {language === "Français" ? section.label.Français : section.label.English}
              </p>
            ) : (
              <div className="mx-auto mb-2 h-px w-6 bg-slate-200" />
            )}
            <ul className="space-y-1">
              {section.items.map((item, itemIndex) => {
                const active = isActive(item.href);
                const accent = [BRAND.teal, BRAND.royalBlue, BRAND.orange, BRAND.sage][itemIndex % 4];
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={t(language, item.key)}
                      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                        navCollapsed ? "justify-center" : ""
                      } ${active ? "" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
                      style={active ? { backgroundColor: `${accent}14`, color: accent } : undefined}
                    >
                      {active ? (
                        <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full" style={{ backgroundColor: accent }} />
                      ) : null}
                      <NavIcon
                        name={item.icon}
                        className={`h-[18px] w-[18px] shrink-0 ${active ? "" : "text-slate-400 group-hover:text-slate-600"}`}
                        style={active ? { color: accent } : undefined}
                      />
                      {!navCollapsed ? <span className="truncate">{t(language, item.key)}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
