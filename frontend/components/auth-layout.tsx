"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { OoredooPolyBackground } from "@/components/ooredoo-poly-bg";

export function AuthFormIcon() {
  return (
    <div className="mb-5 flex justify-center md:justify-start">
      <svg viewBox="0 0 64 40" className="h-10 w-16 text-white/90" fill="currentColor" aria-hidden>
        <circle cx="14" cy="14" r="7" />
        <path d="M4 36c0-6 4.5-10 10-10s10 4 10 10H4Zm20-22a5 5 0 1 1-5-5 5 5 0 0 1 5 5Zm-8 22c0-4.5 3-7.5 8-7.5s8 3 8 7.5H16Zm18-22a6 6 0 1 1-6-6 6 6 0 0 1 6 6Zm-10 22c0-5 3.5-8.5 10-8.5s10 3.5 10 8.5H24Z" />
        <circle cx="50" cy="14" r="7" />
      </svg>
    </div>
  );
}

export function AuthField({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  icon,
  inputMode,
  maxLength,
  autoComplete,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  icon: "user" | "lock" | "mail" | "phone" | "key";
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
  autoComplete?: string;
}) {
  const icons = {
    user: <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" />,
    lock: <path d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V11a2 2 0 0 0-2-2Zm-3 0H10V7a2 2 0 1 1 4 0Z" />,
    mail: <path d="M4 6h16v12H4Zm2 2 6 4 6-4V8l-6 4-6-4Z" />,
    phone: <path d="M7 3h3l2 5-2 1a11 11 0 0 0 5 5l1-2 5 2v3c0 1-1 2-2 2A15 15 0 0 1 5 5c0-1 1-2 2-2Z" />,
    key: <path d="M14 3a5 5 0 0 0-3.2 8.9L5 17.7V21h3.3l3.8-3.8A5 5 0 1 0 14 3Zm0 2a3 3 0 1 1-3 3 3 3 0 0 1 3-3Z" />,
  };

  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/80">
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
            {icons[icon]}
          </svg>
        </span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? label}
          inputMode={inputMode}
          maxLength={maxLength}
          autoComplete={autoComplete}
          aria-label={label}
          className="h-11 w-full rounded-md border border-white/30 bg-white/15 pl-10 pr-3 text-sm text-white outline-none backdrop-blur-sm transition placeholder:text-white/45 focus:border-white/55 focus:bg-white/22 focus:ring-2 focus:ring-white/10"
        />
      </div>
    </label>
  );
}

export function AuthSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/80">
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
            <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" />
          </svg>
        </span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="h-11 w-full appearance-none rounded-md border border-white/30 bg-white/15 pl-10 pr-3 text-sm text-white outline-none backdrop-blur-sm transition focus:border-white/55 focus:bg-white/22 focus:ring-2 focus:ring-white/10"
        >
          <option value="" disabled className="text-slate-800">
            {label}
          </option>
          {options.map((opt) => (
            <option key={opt.id} value={opt.id} className="text-slate-800">
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}

export function AuthPrimaryButton({
  children,
  disabled,
  type = "submit",
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  type?: "submit" | "button";
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="h-11 w-full rounded-md border border-white/25 bg-white text-sm font-extrabold uppercase tracking-[0.22em] text-[#b51218] shadow-[0_12px_32px_rgba(0,0,0,0.25)] transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function AuthLayout({
  formTitle,
  formSubtitle,
  children,
  footer,
}: {
  formTitle: string;
  formSubtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen">
      <OoredooPolyBackground />

      <div className="relative grid min-h-screen md:grid-cols-2 md:items-center">
        <section className="flex items-center justify-center px-10 py-12 text-white md:py-16 lg:px-16 xl:px-24">
          <div className="w-full max-w-md">
            <div className="flex flex-col gap-1.5">
              <BrandLogo size="auth" className="brightness-0 invert" priority />
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/65">Ooredoo · Plateforme interne</p>
            </div>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight lg:text-[2.6rem]">RAN Intelligence</h1>
            <p className="mt-4 text-sm leading-relaxed text-white/80">
              Pilotage réseau, inventaire hardware, analytics et intelligence artificielle — accès sécurisé réservé aux équipes autorisées.
            </p>
            <div className="mt-8 hidden space-y-2 border-l-2 border-white/30 pl-4 text-[11px] text-white/70 md:block">
              <p>Authentification MFA renforcée</p>
              <p>Vérification email & SMS</p>
              <p>Gouvernance Admin / User</p>
            </div>
          </div>
        </section>

        <div className="absolute left-1/2 top-1/2 hidden h-[72%] max-h-[640px] w-px -translate-x-1/2 -translate-y-1/2 bg-white/30 md:block" />

        <section className="flex items-center justify-center px-8 py-10 md:py-16 md:px-12 lg:px-16 xl:px-24">
          <div className="w-full max-w-sm text-white">
            <div className="mb-5 md:hidden">
              <AuthFormIcon />
            </div>
            <div className="mb-5">
              <h2 className="text-2xl font-bold uppercase tracking-wide">{formTitle}</h2>
              {formSubtitle ? <p className="mt-1 text-xs text-white/65">{formSubtitle}</p> : null}
            </div>

            <div>{children}</div>

            {footer ? <div className="mt-6 text-[11px] text-white/60">{footer}</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-white hover:text-red-100">
      {children}
    </Link>
  );
}

export function AuthAlert({ tone, children }: { tone: "error" | "warning" | "success"; children: React.ReactNode }) {
  const styles =
    tone === "error"
      ? "border-red-300/40 bg-red-950/40 text-red-100"
      : tone === "success"
        ? "border-emerald-300/40 bg-emerald-950/30 text-emerald-100"
        : "border-amber-300/40 bg-amber-950/30 text-amber-100";
  return <p className={`mb-3 rounded-md border px-3 py-2 text-[11px] ${styles}`}>{children}</p>;
}

export function AuthModeTabs({ mode, onChange }: { mode: "user" | "admin"; onChange: (mode: "user" | "admin") => void }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2">
      {(["user", "admin"] as const).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={`rounded-md border px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] transition ${
            mode === item ? "border-white/50 bg-white/20 text-white" : "border-white/15 text-white/55 hover:border-white/30 hover:text-white/85"
          }`}
        >
          {item === "user" ? "Utilisateur" : "Administrateur"}
        </button>
      ))}
    </div>
  );
}
