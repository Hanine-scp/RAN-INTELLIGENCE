"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AUTH_INPUT_NAMES, useVirginInput } from "@/lib/auth/auth-virgin-form";
import {
  buildFullPhone,
  digitsMaskPlaceholder,
  findRegion,
  flagImageUrl,
  formatLocalPhone,
  isPhoneComplete,
  parsePhoneValue,
  PHONE_REGIONS,
  type PhoneRegion,
} from "@/lib/phone-regions";
import {
  evaluatePasswordStrength,
  getPasswordRules,
  STRENGTH_META,
  type PasswordStrength,
} from "@/lib/password-strength";
import { useAuthFormTheme } from "@/lib/auth/auth-theme";

export function AuthPhoneField({
  label,
  value,
  onChange,
  defaultRegion = "TN",
}: {
  label: string;
  value: string;
  onChange: (fullPhone: string) => void;
  defaultRegion?: string;
}) {
  const parsed = useMemo(() => parsePhoneValue(value, defaultRegion), [value, defaultRegion]);
  const [regionCode, setRegionCode] = useState(parsed.regionCode);
  const [local, setLocal] = useState(parsed.local);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { virginProps } = useVirginInput();

  const region = findRegion(regionCode);
  const complete = isPhoneComplete(regionCode, local);
  const theme = useAuthFormTheme();
  const isCard = theme === "card";

  useEffect(() => {
    const parsedValue = parsePhoneValue(value, defaultRegion);
    setRegionCode(parsedValue.regionCode);
    setLocal(parsedValue.local);
  }, [value, defaultRegion]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const update = (nextRegion: string, nextLocal: string) => {
    const r = findRegion(nextRegion);
    const trimmed = formatLocalPhone(nextLocal, r.digits);
    setRegionCode(nextRegion);
    setLocal(trimmed);
    onChange(buildFullPhone(r.dial, trimmed));
  };

  const pickRegion = (r: PhoneRegion) => {
    setOpen(false);
    update(r.code, local);
  };

  const labelClass = isCard
    ? "mb-1.5 block text-sm font-semibold text-slate-700"
    : "mb-1.5 block text-sm font-semibold text-white/90";

  const shellClass = isCard
    ? `flex h-12 items-center overflow-hidden rounded-xl border bg-white shadow-sm transition focus-within:border-[#b51218] focus-within:ring-4 focus-within:ring-[#b51218]/10 ${
        complete ? "border-emerald-400" : "border-slate-200"
      }`
    : `flex h-12 items-center overflow-hidden rounded-xl border bg-white/95 shadow-[0_4px_16px_rgba(0,0,0,0.14)] transition focus-within:border-white focus-within:ring-4 focus-within:ring-white/25 ${
        complete ? "border-emerald-400" : "border-white/50"
      }`;

  return (
    <div ref={rootRef} className="block">
      <span className={labelClass}>{label}</span>
      <div className={shellClass}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={`Pays : ${region.name}`}
          className="flex h-full shrink-0 items-center gap-2 border-r border-slate-200 px-2 text-slate-700 transition hover:bg-slate-50 sm:px-3"
        >
          <img
            src={flagImageUrl(region.code)}
            alt=""
            width={22}
            height={16}
            className="h-4 w-[22px] shrink-0 rounded-[2px] object-cover shadow-sm"
          />
          <span className="max-w-[92px] truncate text-xs font-medium">{region.name}</span>
          <svg viewBox="0 0 24 24" className={`h-3 w-3 shrink-0 fill-current text-slate-400 ${open ? "rotate-180" : ""}`}>
            <path d="M7 10l5 5 5-5H7Z" />
          </svg>
        </button>

        <input
          type="tel"
          name={AUTH_INPUT_NAMES.phone}
          inputMode="numeric"
          value={local}
          onChange={(e) => update(regionCode, e.target.value)}
          placeholder={digitsMaskPlaceholder(region.digits)}
          maxLength={region.digits}
          autoComplete="new-password"
          autoCorrect="off"
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
          aria-label={label}
          {...virginProps}
          className="min-w-0 flex-1 bg-transparent px-2 text-sm tracking-widest text-slate-800 outline-none placeholder:tracking-[0.2em] placeholder:text-slate-400 sm:px-3"
        />

        <span className="shrink-0 border-l border-slate-200 px-2 text-[10px] text-slate-400 sm:px-3">
          {region.digits} chiffres
        </span>
      </div>

      {open ? (
        <ul
          className={
            isCard
              ? "relative z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
              : "relative z-50 mt-1 max-h-48 overflow-y-auto rounded-md border border-white/25 bg-[#8b0f14]/95 py-1 shadow-xl backdrop-blur-md"
          }
        >
          {PHONE_REGIONS.map((r) => (
            <li key={r.code}>
              <button
                type="button"
                onClick={() => pickRegion(r)}
                className={
                  isCard
                    ? `flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs transition hover:bg-red-50 ${
                        r.code === regionCode ? "bg-red-50 text-[#b51218]" : "text-slate-700"
                      }`
                    : `flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs transition hover:bg-white/15 ${
                        r.code === regionCode ? "bg-white/10 text-white" : "text-white/85"
                      }`
                }
              >
                <img src={flagImageUrl(r.code)} alt="" width={22} height={16} className="h-4 w-[22px] rounded-[2px] object-cover" />
                <span className="flex-1">{r.name}</span>
                <span className={`font-mono text-[10px] ${isCard ? "text-slate-400" : "text-white/50"}`}>{r.dial}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RuleItem({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const isCard = useAuthFormTheme() === "card";
  return (
    <li className={`flex items-center gap-1.5 ${ok ? (isCard ? "text-emerald-600" : "text-emerald-300/90") : isCard ? "text-slate-400" : "text-white/45"}`}>
      <span
        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold ${
          ok
            ? isCard
              ? "bg-emerald-100 text-emerald-700"
              : "bg-emerald-500/30 text-emerald-200"
            : isCard
              ? "border border-slate-200 text-transparent"
              : "border border-white/25 text-transparent"
        }`}
      >
        ✓
      </span>
      {children}
    </li>
  );
}

function StrengthBar({ strength }: { strength: PasswordStrength }) {
  const isCard = useAuthFormTheme() === "card";
  if (strength === "empty") {
    return (
      <div className="mt-2 flex gap-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full ${isCard ? "bg-slate-200" : "bg-white/15"}`} />
        ))}
      </div>
    );
  }

  const meta = STRENGTH_META[strength];
  const filled = strength === "weak" ? 1 : strength === "medium" ? 2 : 3;

  return (
    <div className="mt-1.5">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${i < filled ? meta.bar : isCard ? "bg-slate-200" : "bg-white/15"}`}
          />
        ))}
      </div>
      <p className={`mt-1 text-[10px] font-semibold uppercase tracking-wider ${isCard ? "text-slate-500" : meta.color}`}>
        Sécurité : {meta.label}
      </p>
    </div>
  );
}

export function AuthPasswordField({
  label,
  value,
  onChange,
  placeholder,
  showStrength = true,
  showRules = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  showStrength?: boolean;
  showRules?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const strength = evaluatePasswordStrength(value);
  const rules = getPasswordRules(value);
  const { virginProps } = useVirginInput();
  const isCard = useAuthFormTheme() === "card";

  const labelClass = isCard
    ? "mb-1.5 block text-sm font-semibold text-slate-700"
    : "mb-1.5 block text-sm font-semibold text-white/90";

  const shellClass = isCard
    ? "flex h-12 items-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition focus-within:border-[#b51218] focus-within:ring-4 focus-within:ring-[#b51218]/10"
    : "flex h-12 items-center overflow-hidden rounded-xl border border-white/50 bg-white/95 shadow-[0_4px_16px_rgba(0,0,0,0.14)] transition focus-within:border-white focus-within:ring-4 focus-within:ring-white/25";

  const iconClass = "text-slate-400";
  const inputClass =
    "min-w-0 flex-1 border-0 bg-transparent px-2 text-sm text-slate-900 outline-none placeholder:text-slate-400";

  const toggleClass =
    "flex h-full w-9 shrink-0 items-center justify-center text-slate-400 transition hover:text-slate-600";

  return (
    <div className="block">
      <span className={labelClass}>{label}</span>
      <div className={shellClass}>
        <span className={`flex h-full w-10 shrink-0 items-center justify-center ${iconClass}`} aria-hidden>
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
            <path d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V11a2 2 0 0 0-2-2Zm-3 0H10V7a2 2 0 1 1 4 0Z" />
          </svg>
        </span>
        <input
          type={visible ? "text" : "password"}
          name={AUTH_INPUT_NAMES.passwordNew}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? label}
          autoComplete="new-password"
          autoCorrect="off"
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
          aria-label={label}
          {...virginProps}
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Masquer" : "Afficher"}
          className={toggleClass}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
            {visible ? (
              <path d="M3.3 2.5 2 3.8l3 3C3.5 8.2 2 10 2 10s3.5 7 10 7c1.6 0 3-.3 4.2-.8l3.3 3.3 1.3-1.3L3.3 2.5ZM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" />
            ) : (
              <path d="M12 5C7 5 2.7 8.1 1 12c1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z" />
            )}
          </svg>
        </button>
      </div>
      {showStrength ? <StrengthBar strength={strength} /> : null}
      {showRules && value ? (
        <ul className="mt-2 space-y-1 text-[10px]">
          <RuleItem ok={rules.minLength}>10 caractères minimum</RuleItem>
          <RuleItem ok={rules.uppercase}>Une majuscule (A-Z)</RuleItem>
          <RuleItem ok={rules.special}>Un caractère spécial (* / ! @ # …)</RuleItem>
          <RuleItem ok={rules.digit}>Un chiffre (0-9)</RuleItem>
        </ul>
      ) : null}
    </div>
  );
}

export function isPhoneValueValid(fullPhone: string, defaultRegion = "TN"): boolean {
  const { regionCode, local } = parsePhoneValue(fullPhone, defaultRegion);
  return isPhoneComplete(regionCode, local);
}
