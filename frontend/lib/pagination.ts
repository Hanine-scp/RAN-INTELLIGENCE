/** page_size = 0 → backend returns all rows (no LIMIT/OFFSET). */
export const UNLIMITED_PAGE_SIZE = 0;

/** Default page size for interactive tables (sites, inventory). */
export const DEFAULT_TABLE_PAGE_SIZE = 300;

export const UNLIMITED_PAGE_QUERY = {
  page: 1,
  page_size: UNLIMITED_PAGE_SIZE,
  search: "",
} as const;

export const DEFAULT_TABLE_PAGE_QUERY = {
  page: 1,
  page_size: DEFAULT_TABLE_PAGE_SIZE,
  search: "",
} as const;
