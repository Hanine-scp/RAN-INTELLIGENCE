"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { SWRConfig } from "swr";
import type { Dispatch, SetStateAction } from "react";
import type { FilterContext, FilterPayload, RanVendor } from "@/lib/types";

const VENDOR_STORAGE_KEY = "ran_intelligence_vendor";
const LANGUAGE_STORAGE_KEY = "ran_intelligence_language";

function readStoredVendor(): RanVendor {
  if (typeof window === "undefined") return "nokia";
  const stored = window.localStorage.getItem(VENDOR_STORAGE_KEY);
  return stored === "huawei" ? "huawei" : "nokia";
}

function readStoredLanguage(): FilterContext["language"] {
  if (typeof window === "undefined") return "Français";
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return stored === "English" ? "English" : "Français";
}

type AppContextType = {
  filters: FilterContext;
  setFilters: Dispatch<SetStateAction<FilterContext>>;
  payload: FilterPayload;
  sidebarOpen: boolean;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  navCollapsed: boolean;
  setNavCollapsed: Dispatch<SetStateAction<boolean>>;
};

const defaultFilters: FilterContext = {
  selected_dates: [],
  selected_files: [],
  selected_sites: [],
  selected_file_dates: [],
  effective_dates: [],
  site_search: "",
  date_search: "",
  period_start: "",
  period_end: "",
  smart_missing_serial: false,
  smart_duplicates: false,
  smart_critical_quality: false,
  language: "Français",
  vendor: "nokia",
};

const AppContext = createContext<AppContextType>({
  filters: defaultFilters,
  setFilters: () => undefined,
  payload: defaultFilters,
  sidebarOpen: true,
  setSidebarOpen: () => undefined,
  navCollapsed: false,
  setNavCollapsed: () => undefined,
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<FilterContext>(defaultFilters);

  useEffect(() => {
    const vendor = readStoredVendor();
    const language = readStoredLanguage();
    setFilters((prev) => ({
      ...prev,
      vendor: vendor !== "nokia" ? vendor : prev.vendor,
      language,
    }));
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [navCollapsed, setNavCollapsed] = useState(false);

  const payload = useMemo<FilterPayload>(
    () => ({
      selected_dates: filters.selected_dates,
      selected_files: filters.selected_files,
      selected_sites: filters.selected_sites,
      selected_file_dates: filters.selected_file_dates,
      effective_dates: filters.effective_dates,
      site_search: filters.site_search,
      date_search: filters.date_search,
      period_start: filters.period_start,
      period_end: filters.period_end,
      smart_missing_serial: filters.smart_missing_serial,
      smart_duplicates: filters.smart_duplicates,
      smart_critical_quality: filters.smart_critical_quality,
      language: filters.language,
      vendor: filters.vendor,
    }),
    [filters],
  );

  const setFiltersWithVendorPersist: typeof setFilters = (value) => {
    setFilters((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(VENDOR_STORAGE_KEY, next.vendor);
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next.language);
      }
      return next;
    });
  };

  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        dedupingInterval: 30_000,
        errorRetryCount: 2,
      }}
    >
      <AppContext.Provider
        value={{ filters, setFilters: setFiltersWithVendorPersist, payload, sidebarOpen, setSidebarOpen, navCollapsed, setNavCollapsed }}
      >
        {children}
      </AppContext.Provider>
    </SWRConfig>
  );
}

export function useAppContext() {
  return useContext(AppContext);
}
