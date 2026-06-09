"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

  const region = findRegion(regionCode);
  const complete = isPhoneComplete(regionCode, local);

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

  return (
    <div ref={rootRef} className="block">
      <span className="sr-only">{label}</span>
      <div
        className={`flex h-11 items-center overflow-hidden rounded-md border bg-white/15 backdrop-blur-sm transition focus-within:border-white/55 focus-within:bg-white/22 focus-within:ring-2 focus-within:ring-white/10 ${
          complete ? "border-emerald-300/40" : "border-white/30"
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={`Pays : ${region.name}`}
          className="flex h-full shrink-0 items-center gap-2 border-r border-white/20 px-3 text-white transition hover:bg-white/10"
        >
          <img
            src={flagImageUrl(region.code)}
            alt=""
            width={22}
            height={16}
            className="h-4 w-[22px] shrink-0 rounded-[2px] object-cover shadow-sm"
          />
          <span className="max-w-[92px] truncate text-xs font-medium">{region.name}</span>
          <svg viewBox="0 0 24 24" className={`h-3 w-3 shrink-0 fill-current text-white/60 ${open ? "rotate-180" : ""}`}>
            <path d="M7 10l5 5 5-5H7Z" />
          </svg>
        </button>

        <input
          type="tel"
          inputMode="numeric"
          value={local}
          onChange={(e) => update(regionCode, e.target.value)}
          placeholder={digitsMaskPlaceholder(region.digits)}
          maxLength={region.digits}
          aria-label={label}
          className="min-w-0 flex-1 bg-transparent px-3 text-sm tracking-widest text-white outline-none placeholder:tracking-[0.2em] placeholder:text-white/35"
        />

        <span className="shrink-0 border-l border-white/15 px-3 text-[10px] text-white/45">{region.digits} chiffres</span>
      </div>

      {open ? (
        <ul className="relative z-50 mt-1 max-h-48 overflow-y-auto rounded-md border border-white/25 bg-[#8b0f14]/95 py-1 shadow-xl backdrop-blur-md">
          {PHONE_REGIONS.map((r) => (
            <li key={r.code}>
              <button
                type="button"
                onClick={() => pickRegion(r)}
                className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs transition hover:bg-white/15 ${
                  r.code === regionCode ? "bg-white/10 text-white" : "text-white/85"
                }`}
              >
                <img src={flagImageUrl(r.code)} alt="" width={22} height={16} className="h-4 w-[22px] rounded-[2px] object-cover" />
                <span className="flex-1">{r.name}</span>
                <span className="font-mono text-[10px] text-white/50">{r.dial}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RuleItem({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-1.5 ${ok ? "text-emerald-300/90" : "text-white/45"}`}>
      <span
        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold ${
          ok ? "bg-emerald-500/30 text-emerald-200" : "border border-white/25 text-transparent"
        }`}
      >
        ✓
      </span>
      {children}
    </li>
  );
}

function StrengthBar({ strength }: { strength: PasswordStrength }) {
  if (strength === "empty") {
    return (
      <div className="mt-2 flex gap-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-1 flex-1 rounded-full bg-white/15" />
        ))}
      </div>
    );
  }

  const meta = STRENGTH_META[strength];
  const filled = strength === "weak" ? 1 : strength === "medium" ? 2 : 3;

  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i < filled ? meta.bar : "bg-white/15"}`} />
        ))}
      </div>
      <p className={`mt-1 text-[10px] font-semibold uppercase tracking-wider ${meta.color}`}>Sécurité : {meta.label}</p>
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

  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/80">
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
            <path d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V11a2 2 0 0 0-2-2Zm-3 0H10V7a2 2 0 1 1 4 0Z" />
          </svg>
        </span>
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? label}
          aria-label={label}
          className="h-11 w-full rounded-md border border-white/30 bg-white/15 pl-10 pr-10 text-sm text-white outline-none backdrop-blur-sm transition placeholder:text-white/45 focus:border-white/55 focus:bg-white/22 focus:ring-2 focus:ring-white/10"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Masquer" : "Afficher"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/55 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
            {visible ? (
              <path d="M3.3 2.5 2 3.8l3 3C3.5 8.2 2 10 2 10s3.5 7 10 7c1.6 0 3-.3 4.2-.8l3.3 3.3 1.3-1.3L3.3 2.5Z" />
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
    </label>
  );
}

export function isPhoneValueValid(fullPhone: string, defaultRegion = "TN"): boolean {
  const { regionCode, local } = parsePhoneValue(fullPhone, defaultRegion);
  return isPhoneComplete(regionCode, local);
}
