"use client";

import { useCallback } from "react";
import { useAppContext } from "@/components/app-provider";
import type { Locale } from "@/lib/i18n";
import { authT, type AuthKey } from "@/lib/auth-i18n";

export function useLocale() {
  const { filters, setFilters } = useAppContext();
  const locale = filters.language;
  const isFr = locale === "Français";

  const setLocale = useCallback(
    (language: Locale) => {
      setFilters((prev) => ({ ...prev, language }));
    },
    [setFilters],
  );

  const ta = useCallback((key: AuthKey) => authT(locale, key), [locale]);

  return { locale, isFr, setLocale, ta };
}
