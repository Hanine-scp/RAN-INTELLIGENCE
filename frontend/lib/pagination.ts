/** page_size = 0 → backend returns all rows (no LIMIT/OFFSET). */
export const UNLIMITED_PAGE_SIZE = 0;

export const UNLIMITED_PAGE_QUERY = {
  page: 1,
  page_size: UNLIMITED_PAGE_SIZE,
  search: "",
} as const;
