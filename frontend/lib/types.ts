export type RanVendor = "nokia" | "huawei";

export type FilterContext = {
  selected_dates: string[];
  selected_files: string[];
  selected_sites: string[];
  selected_file_dates: string[];
  effective_dates: string[];
  site_search: string;
  date_search: string;
  period_start: string;
  period_end: string;
  smart_missing_serial: boolean;
  smart_duplicates: boolean;
  smart_critical_quality: boolean;
  language: "Français" | "English";
  vendor: RanVendor;
};

export type FilterPayload = {
  selected_dates: string[];
  selected_files: string[];
  selected_sites: string[];
  selected_file_dates: string[];
  effective_dates: string[];
  site_search: string;
  date_search: string;
  period_start: string;
  period_end: string;
  smart_missing_serial: boolean;
  smart_duplicates: boolean;
  smart_critical_quality: boolean;
  language: "Français" | "English";
  vendor: RanVendor;
};

export type ApiEnvelope<T> = {
  data: T;
};

export type PaginatedQuery = {
  page: number;
  page_size: number;
  search?: string;
  sort_by?: string;
  sort_direction?: "asc" | "desc";
  unique_serial_only?: boolean;
};
