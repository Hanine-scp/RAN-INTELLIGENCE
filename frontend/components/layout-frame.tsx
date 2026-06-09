"use client";

import { usePathname } from "next/navigation";
import { useAppContext } from "@/components/app-provider";
import { useAuth } from "@/components/auth-provider";
import { FilterPanel } from "@/components/filter-panel";
import { PlatformPolyAccent } from "@/components/ooredoo-poly-bg";
import { TopBar } from "@/components/top-bar";
import { VendorBanner } from "@/components/vendor-banner";
import { isPublicRoute } from "@/lib/permissions";

export function LayoutFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { sidebarOpen } = useAppContext();
  const { loading } = useAuth();

  if (isPublicRoute(pathname)) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="platform-shell flex min-h-screen items-center justify-center text-sm font-medium text-slate-500">
        <PlatformPolyAccent />
        <div className="premium-card rounded-2xl px-8 py-6">Chargement de la session...</div>
      </div>
    );
  }

  return (
    <div className="platform-shell flex min-h-screen w-full">
      <PlatformPolyAccent />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex w-full flex-1 flex-col gap-5 px-4 py-5 lg:flex-row lg:px-6 lg:py-6">
          {sidebarOpen && pathname !== "/ai-assistant" ? <FilterPanel /> : null}
          <section className="min-w-0 flex-1">
            {pathname !== "/ai-assistant" ? <VendorBanner /> : null}
            {children}
          </section>
        </main>
      </div>
    </div>
  );
}
