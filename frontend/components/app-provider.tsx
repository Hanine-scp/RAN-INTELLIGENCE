"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { FilterContext, FilterPayload } from "@/lib/types";

type AppContextType = {
  filters: FilterContext;
  setFilters: (filters: FilterContext) => void;
  payload: FilterPayload;
};

const defaultFilters: FilterContext = {
  selected_dates: [],
  selected_files: [],
  selected_sites: [],
  selected_file_dates: [],
  effective_dates: [],
  site_search: "",
  date_search: "",
  language: "Français",
};

const AppContext = createContext<AppContextType>({
  filters: defaultFilters,
  setFilters: () => undefined,
  payload: defaultFilters,
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<FilterContext>(defaultFilters);

  const payload = useMemo<FilterPayload>(
    () => ({
      selected_dates: filters.selected_dates,
      selected_files: filters.selected_files,
      selected_sites: filters.selected_sites,
      selected_file_dates: filters.selected_file_dates,
      effective_dates: filters.effective_dates,
      site_search: filters.site_search,
      date_search: filters.date_search,
      language: filters.language,
    }),
    [filters],
  );

  return <AppContext.Provider value={{ filters, setFilters, payload }}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  return useContext(AppContext);
}
