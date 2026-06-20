"use client";

import { t } from "@/lib/i18n";

type UniqueSerialFilterToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  language: "Français" | "English";
};

export function UniqueSerialFilterToggle({ checked, onChange, language }: UniqueSerialFilterToggleProps) {
  return (
    <label
      className="flex shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-red-100 bg-white px-2.5 py-1.5 text-xs"
      title={t(language, "filters_unique_serial_hint")}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 shrink-0 accent-red-600"
      />
      <span className="whitespace-nowrap font-medium text-slate-700">{t(language, "filters_unique_serial")}</span>
    </label>
  );
}
