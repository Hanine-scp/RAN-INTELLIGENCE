export type FilterContext = {
  selected_dates: string[];
  selected_files: string[];
  selected_sites: string[];
  selected_file_dates: string[];
  effective_dates: string[];
  site_search: string;
  date_search: string;
  language: "Français" | "English";
};

export type FilterPayload = {
  selected_dates: string[];
  selected_files: string[];
  selected_sites: string[];
  selected_file_dates: string[];
  effective_dates: string[];
  site_search: string;
  date_search: string;
  language: "Français" | "English";
};

export type ApiEnvelope<T> = {
  data: T;
};
