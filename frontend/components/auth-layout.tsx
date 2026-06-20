"use client";

import Link from "next/link";
import { FormEvent, useId, type ReactNode } from "react";
import { useVirginInput, AUTH_FORM_AUTOCOMPLETE } from "@/lib/auth-virgin-form";
import { useAuthFormTheme } from "@/lib/auth-theme";
import { BrandLogo } from "@/components/brand-logo";
import { OoredooPolyBackground } from "@/components/ooredoo-poly-bg";
import { useLocale } from "@/lib/use-locale";

/** Typographie brand auth — alignée panneau gauche / droite */
export const authTypography = {
  line1: "text-[15px] font-medium leading-relaxed tracking-wide text-white/90 lg:text-base",
  line2: "text-sm font-light leading-relaxed text-white/65 lg:text-[15px]",
  eyebrow: "text-[11px] font-bold uppercase tracking-[0.34em] text-white/90 md:text-[10px] md:tracking-[0.38em]",
  heroTitle: "text-4xl font-extrabold leading-[1.08] tracking-tight lg:text-[2.75rem]",
  formTitle: "text-4xl font-extrabold leading-[1.08] tracking-tight lg:text-[2.75rem]",
  link: "font-medium tracking-wide text-white/90 transition hover:text-white",
} as const;

export function AuthFormIcon() {
  return (
    <div className="mb-5 flex justify-center">
      <svg viewBox="0 0 64 40" className="h-10 w-16 text-[#b51218]/80" fill="currentColor" aria-hidden>
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
  name,
  virgin = true,
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
  name?: string;
  virgin?: boolean;
}) {
  const theme = useAuthFormTheme();
  const isCard = theme === "card";
  const { virginProps } = useVirginInput();
  const useVirgin = virgin !== false;
  const isEmail = type === "email";
  const inputType = isEmail && useVirgin ? "text" : type;
  const inputModeResolved = isEmail && useVirgin ? "email" : inputMode;
  const autoCompleteResolved =
    autoComplete ?? (type === "password" && useVirgin ? "new-password" : AUTH_FORM_AUTOCOMPLETE);

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
        <span
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${isCard ? "left-0 text-slate-400" : "left-3 text-white/80"}`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
            {icons[icon]}
          </svg>
        </span>
        <input
          type={inputType}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? label}
          inputMode={inputModeResolved}
          maxLength={maxLength}
          autoComplete={autoCompleteResolved}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
          aria-label={label}
          {...(useVirgin ? virginProps : {})}
          className={
            isCard
              ? "h-11 w-full border-0 border-b border-slate-200 bg-transparent pl-7 pr-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#b51218] focus:ring-0"
              : "h-11 w-full rounded-md border border-white/30 bg-white/15 pl-10 pr-3 text-sm text-white outline-none backdrop-blur-sm transition placeholder:text-white/45 focus:border-white/55 focus:bg-white/22 focus:ring-2 focus:ring-white/10"
          }
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
  const theme = useAuthFormTheme();
  const isCard = theme === "card";

  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <div className="relative">
        <span
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${isCard ? "left-0 text-slate-400" : "left-3 text-white/80"}`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
            <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" />
          </svg>
        </span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className={
            isCard
              ? "h-11 w-full appearance-none border-0 border-b border-slate-200 bg-transparent pl-7 pr-3 text-sm text-slate-800 outline-none focus:border-[#b51218]"
              : "h-11 w-full appearance-none rounded-md border border-white/30 bg-white/15 pl-10 pr-3 text-sm text-white outline-none backdrop-blur-sm transition focus:border-white/55 focus:bg-white/22 focus:ring-2 focus:ring-white/10"
          }
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
  compact,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  type?: "submit" | "button";
  onClick?: () => void;
  compact?: boolean;
}) {
  const theme = useAuthFormTheme();
  const isCard = theme === "card";

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={
        isCard
          ? `h-11 rounded-full bg-[#b51218] px-10 text-xs font-bold uppercase tracking-[0.18em] text-white shadow-[0_6px_20px_rgba(181,18,24,0.35)] transition hover:bg-[#9f1218] disabled:cursor-not-allowed disabled:opacity-60 ${compact ? "w-auto shrink-0" : "w-full"}`
          : "h-11 w-full rounded-md border border-white/25 bg-white text-sm font-extrabold uppercase tracking-[0.22em] text-[#b51218] shadow-[0_12px_32px_rgba(0,0,0,0.25)] transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      {children}
    </button>
  );
}

export function AuthLanguageToggle({ className = "" }: { className?: string }) {
  const { locale, setLocale, ta } = useLocale();

  return (
    <div
      className={`inline-flex items-center rounded-full border border-white/35 bg-white/15 p-1 shadow-[0_10px_28px_rgba(0,0,0,0.28)] backdrop-blur-md ${className}`}
      role="group"
      aria-label="Language"
    >
      {(["Français", "English"] as const).map((lng) => (
        <button
          key={lng}
          type="button"
          onClick={() => setLocale(lng)}
          className={`min-w-[2.75rem] rounded-full px-3.5 py-2 text-xs font-bold uppercase tracking-wide transition ${
            locale === lng
              ? "bg-white text-[#b51218] shadow-[0_4px_14px_rgba(0,0,0,0.22)]"
              : "text-white/85 hover:bg-white/12 hover:text-white"
          }`}
          aria-pressed={locale === lng}
        >
          {lng === "Français" ? ta("auth_lang_fr") : ta("auth_lang_en")}
        </button>
      ))}
    </div>
  );
}

export function AuthDevCodesPanel({ emailCode, smsCode }: { emailCode?: string; smsCode?: string }) {
  const { ta } = useLocale();
  const theme = useAuthFormTheme();
  const isCard = theme === "card";
  if (!emailCode && !smsCode) return null;

  return (
    <div
      className={
        isCard
          ? "mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
          : "mb-4 rounded-lg border border-amber-300/45 bg-amber-950/40 px-4 py-3 backdrop-blur-sm"
      }
    >
      <p className={`text-[10px] font-bold uppercase tracking-widest ${isCard ? "text-amber-800" : "text-amber-200/85"}`}>
        {ta("auth_dev_codes_label")}
      </p>
      <div className={`mt-2 space-y-1.5 font-mono text-sm font-semibold tracking-wide ${isCard ? "text-amber-950" : "text-amber-50"}`}>
        {emailCode ? (
          <p>
            <span className={isCard ? "text-amber-700" : "text-amber-200/70"}>{ta("auth_dev_email_code")}</span> {emailCode}
          </p>
        ) : null}
        {smsCode ? (
          <p>
            <span className={isCard ? "text-amber-700" : "text-amber-200/70"}>{ta("auth_dev_sms_code")}</span> {smsCode}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function AuthSecondaryButton({
  children,
  disabled,
  onClick,
  variant = "muted",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  variant?: "muted" | "ghost";
}) {
  const theme = useAuthFormTheme();
  const isCard = theme === "card";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full text-[10px] font-semibold uppercase tracking-wide transition disabled:opacity-50 ${
        isCard
          ? variant === "ghost"
            ? "text-slate-400 hover:text-slate-600"
            : "text-slate-500 hover:text-[#b51218]"
          : variant === "ghost"
            ? "text-white/40 hover:text-white/70"
            : `${authTypography.line2} hover:text-white`
      }`}
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
  const { ta } = useLocale();

  return (
    <div className="relative min-h-screen">
      <OoredooPolyBackground />
      <AuthLanguageToggle className="fixed left-5 top-5 z-40 md:left-8 md:top-8" />

      <div className="relative grid min-h-screen md:grid-cols-2">
        <section className="flex px-10 py-10 text-white md:min-h-screen md:items-start md:justify-start md:px-16 md:pb-16 md:pt-[1.5cm] lg:px-20 xl:px-24">
          <div className="ml-[1cm] w-full max-w-lg">
            <BrandLogo
              size="auth"
              className="brightness-0 invert drop-shadow-[0_6px_28px_rgba(0,0,0,0.45)] contrast-[1.15]"
              priority
            />
            <p className={`mt-4 ${authTypography.eyebrow}`}>
              {ta("auth_brand_eyebrow")}
            </p>
            <h1 className={`mt-6 ${authTypography.heroTitle}`}>RAN Intelligence</h1>
            <div className="mt-6 max-w-md space-y-5">
              <p className={authTypography.line1}>{ta("auth_brand_line1")}</p>
              <p className={authTypography.line2}>{ta("auth_brand_line2")}</p>
            </div>
          </div>
        </section>

        <div className="absolute left-1/2 top-1/2 hidden h-[72%] max-h-[640px] w-px -translate-x-1/2 -translate-y-1/2 bg-white/30 md:block" />

        <section className="flex min-h-[480px] items-center justify-center px-8 py-10 md:min-h-screen md:px-12 md:py-16 lg:px-16 xl:px-24">
          <div className="w-full max-w-sm text-white">
            <div className="mb-6 md:text-center">
              <h2 className={authTypography.formTitle}>{formTitle}</h2>
              {formSubtitle ? <p className={`mt-3 ${authTypography.line1}`}>{formSubtitle}</p> : null}
            </div>

            <div>{children}</div>

            {footer ? <div className={`mt-6 text-center ${authTypography.line2}`}>{footer}</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  const theme = useAuthFormTheme();
  const isCard = theme === "card";

  return (
    <Link
      href={href}
      className={
        isCard
          ? "font-semibold text-[#b51218] hover:text-[#9f1218]"
          : authTypography.link
      }
    >
      {children}
    </Link>
  );
}

export function AuthAlert({ tone, children }: { tone: "error" | "warning" | "success"; children: React.ReactNode }) {
  const theme = useAuthFormTheme();
  const isCard = theme === "card";

  const styles = isCard
    ? tone === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-amber-200 bg-amber-50 text-amber-900"
    : tone === "error"
      ? "border-red-300/40 bg-red-950/40 text-red-100"
      : tone === "success"
        ? "border-emerald-300/40 bg-emerald-950/30 text-emerald-100"
        : "border-amber-300/40 bg-amber-950/30 text-amber-100";

  return <p className={`mb-3 rounded-md border px-3 py-2 text-[11px] leading-relaxed ${styles}`}>{children}</p>;
}

export function AuthVirginForm({
  children,
  className,
  onSubmit,
}: {
  children: ReactNode;
  className?: string;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const trap = useId().replace(/:/g, "");

  return (
    <form autoComplete="off" onSubmit={onSubmit} className={className}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0"
      >
        <input type="text" name={`username_${trap}`} autoComplete="username" tabIndex={-1} defaultValue="" />
        <input type="password" name={`password_${trap}`} autoComplete="current-password" tabIndex={-1} defaultValue="" />
      </div>
      {children}
    </form>
  );
}

export function AuthModeTabs({
  mode,
  onChange,
}: {
  mode: "user" | "admin";
  onChange: (mode: "user" | "admin") => void;
}) {
  const { ta } = useLocale();
  const theme = useAuthFormTheme();
  const isCard = theme === "card";
  const items: { id: "user" | "admin"; label: string }[] = [
    { id: "user", label: ta("auth_tab_user") },
    { id: "admin", label: ta("auth_tab_admin") },
  ];

  return (
    <div className="mb-4 grid grid-cols-2 gap-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={
            isCard
              ? `rounded-full border px-2 py-2 text-[10px] font-bold uppercase tracking-[0.12em] transition ${
                  mode === item.id
                    ? "border-[#b51218] bg-[#b51218] text-white"
                    : "border-slate-200 text-slate-500 hover:border-[#b51218]/40 hover:text-[#b51218]"
                }`
              : `rounded-md border px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] transition ${
                  mode === item.id
                    ? "border-white/50 bg-white/20 text-white"
                    : "border-white/15 text-white/55 hover:border-white/30 hover:text-white/85"
                }`
          }
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
