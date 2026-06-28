"use client";

import Link from "next/link";
import { FormEvent, useEffect, useId, useState, type ReactNode } from "react";
import { useVirginInput, AUTH_FORM_AUTOCOMPLETE } from "@/lib/auth-virgin-form";
import { getNotificationsStatus } from "@/lib/api";
import { useAuthFormTheme, AuthFormThemeProvider, type AuthFormTheme } from "@/lib/auth-theme";
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

function authPanel(theme: AuthFormTheme) {
  return {
    overlay: theme === "overlay",
    card: theme === "card",
    centered: theme === "centered",
    light: theme === "card",
  };
}

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
  const panel = authPanel(theme);
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

  const labelClass = panel.card
    ? "mb-1.5 block text-sm font-semibold text-slate-700"
    : panel.centered
      ? "sr-only"
      : "mb-1.5 block text-sm font-semibold text-white/90";

  const iconClass = panel.centered ? "text-white/80" : panel.light ? "text-slate-400" : "text-white/80";

  const inputClass = panel.centered
    ? "h-11 w-full border-0 border-b-2 border-white/55 bg-transparent pl-9 pr-1 text-sm text-white outline-none transition placeholder:text-white/45 focus:border-white"
    : panel.card
      ? "h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#b51218] focus:ring-4 focus:ring-[#b51218]/10"
      : "h-12 w-full rounded-xl border border-white/50 bg-white/95 pl-11 pr-4 text-sm text-slate-900 shadow-[0_4px_16px_rgba(0,0,0,0.14)] outline-none transition placeholder:text-slate-400 focus:border-white focus:ring-4 focus:ring-white/25";

  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <div className="relative">
        <span className={`pointer-events-none absolute top-1/2 left-0 -translate-y-1/2 ${iconClass}`}>
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
          className={inputClass}
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
  const panel = authPanel(useAuthFormTheme());

  const labelClass = panel.card
    ? "mb-1.5 block text-sm font-semibold text-slate-700"
    : panel.centered
      ? "sr-only"
      : "mb-1.5 block text-sm font-semibold text-white/90";

  const selectClass = panel.centered
    ? "h-11 w-full appearance-none border-0 border-b-2 border-white/55 bg-transparent pl-9 pr-3 text-sm text-white outline-none transition focus:border-white"
    : panel.card
      ? "h-12 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-11 pr-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#b51218] focus:ring-4 focus:ring-[#b51218]/10"
      : "h-12 w-full appearance-none rounded-xl border border-white/50 bg-white/95 pl-11 pr-3 text-sm text-slate-900 shadow-[0_4px_16px_rgba(0,0,0,0.14)] outline-none transition focus:border-white focus:ring-4 focus:ring-white/25";

  const iconClass = panel.centered ? "text-white/80" : panel.light ? "text-slate-400" : "text-white/80";

  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <div className="relative">
        <span className={`pointer-events-none absolute top-1/2 left-0 -translate-y-1/2 ${iconClass}`}>
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
            <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" />
          </svg>
        </span>
        <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className={selectClass}>
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
  const panel = authPanel(theme);

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={
        panel.centered
          ? `mx-auto block h-12 max-w-[280px] border border-white/20 bg-[#5a080c] px-12 text-sm font-semibold uppercase tracking-[0.28em] text-white shadow-[0_10px_28px_rgba(0,0,0,0.35)] transition hover:bg-[#7a0e12] disabled:cursor-not-allowed disabled:opacity-60 ${compact ? "w-auto" : "w-full"}`
          : panel.card
            ? `h-12 rounded-xl bg-[#b51218] px-10 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(181,18,24,0.28)] transition hover:bg-[#9f1218] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 ${compact ? "w-auto shrink-0" : "w-full"}`
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
  const panel = authPanel(useAuthFormTheme());
  const [devMode, setDevMode] = useState(false);

  useEffect(() => {
    let active = true;
    getNotificationsStatus()
      .then((status) => {
        if (active) setDevMode(Boolean(status.dev_mode));
      })
      .catch(() => {
        if (active) setDevMode(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!devMode || (!emailCode && !smsCode)) return null;

  return (
    <div
      className={
        panel.light
          ? "mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
          : "mb-4 rounded-lg border border-amber-300/45 bg-amber-950/40 px-4 py-3 backdrop-blur-sm"
      }
    >
      <p className={`text-[10px] font-bold uppercase tracking-widest ${panel.light ? "text-amber-800" : "text-amber-200/85"}`}>
        {ta("auth_dev_codes_label")}
      </p>
      <div className={`mt-2 space-y-1.5 font-mono text-sm font-semibold tracking-wide ${panel.light ? "text-amber-950" : "text-amber-50"}`}>
        {emailCode ? (
          <p>
            <span className={panel.light ? "text-amber-700" : "text-amber-200/70"}>{ta("auth_dev_email_code")}</span> {emailCode}
          </p>
        ) : null}
        {smsCode ? (
          <p>
            <span className={panel.light ? "text-amber-700" : "text-amber-200/70"}>{ta("auth_dev_sms_code")}</span> {smsCode}
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
  const panel = authPanel(useAuthFormTheme());

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full text-xs font-medium transition disabled:opacity-50 ${
        panel.centered
          ? variant === "ghost"
            ? "text-white/40 hover:text-white/70"
            : "text-white/65 hover:text-white"
          : panel.card
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

export function AuthFormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">{title}</h3>
        <div className="h-px flex-1 bg-slate-200" />
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function AuthLayout({
  formTitle,
  formSubtitle,
  formEyebrow,
  children,
  footer,
  wide = false,
  contentPanel = false,
}: {
  formTitle: string;
  formSubtitle?: string;
  formEyebrow?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  contentPanel?: boolean;
}) {
  return (
    <AuthFormThemeProvider theme="centered">
      <div className="relative flex min-h-screen flex-col">
        <OoredooPolyBackground />

        <header className="fixed inset-x-0 top-0 z-40 flex items-start justify-between px-5 py-5 md:px-10 md:py-7">
          <BrandLogo
            size="auth"
            className="brightness-0 invert drop-shadow-[0_4px_20px_rgba(0,0,0,0.35)] contrast-[1.12]"
            priority
          />
          <AuthLanguageToggle />
        </header>

        <main className="relative flex flex-1 items-center justify-center px-6 py-32 md:px-10 md:py-36">
          <div className={`w-full text-white ${wide ? "max-w-xl" : "max-w-sm"}`}>
            <div className="mb-8 text-center">
              {formEyebrow ? (
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.28em] text-white/55">{formEyebrow}</p>
              ) : null}
              <h2 className="text-[1.75rem] font-light uppercase tracking-[0.32em] text-white">{formTitle}</h2>
              {formSubtitle ? (
                <p className="mt-3 text-sm leading-relaxed text-white/75">{formSubtitle}</p>
              ) : null}
            </div>

            {contentPanel ? (
              <div className="rounded-2xl border border-white/20 bg-white/[0.97] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.35)] backdrop-blur-xl md:p-7">
                <AuthFormThemeProvider theme="card">{children}</AuthFormThemeProvider>
              </div>
            ) : (
              <div>{children}</div>
            )}

            {footer ? (
              <div className="mt-8 text-center text-xs leading-relaxed text-white/65">{footer}</div>
            ) : null}
          </div>
        </main>
      </div>
    </AuthFormThemeProvider>
  );
}

export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  const panel = authPanel(useAuthFormTheme());

  return (
    <Link
      href={href}
      className={
        panel.centered
          ? "text-sm italic text-white/75 transition hover:text-white"
          : panel.card
            ? "font-semibold text-[#b51218] hover:text-[#9f1218]"
            : authTypography.link
      }
    >
      {children}
    </Link>
  );
}

export function AuthAlert({ tone, children }: { tone: "error" | "warning" | "success"; children: React.ReactNode }) {
  const panel = authPanel(useAuthFormTheme());

  const styles = panel.light
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

  return <p className={`mb-3 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${styles}`}>{children}</p>;
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
  userHint,
}: {
  mode: "user" | "admin";
  onChange: (mode: "user" | "admin") => void;
  /** Affiché au clic sur Responsable, masqué quand le curseur quitte le bouton */
  userHint?: string;
}) {
  const { ta } = useLocale();
  const panel = authPanel(useAuthFormTheme());
  const [showUserHint, setShowUserHint] = useState(false);
  const items: { id: "user" | "admin"; label: string }[] = [
    { id: "user", label: ta("auth_tab_user") },
    { id: "admin", label: ta("auth_tab_admin") },
  ];

  return (
    <div
      className={`mb-6 grid grid-cols-2 ${
        panel.centered ? "gap-4 border-b border-white/20 pb-1" : panel.card ? "gap-1 rounded-xl bg-slate-100 p-1" : "gap-1.5"
      }`}
    >
      {items.map((item) => {
        const isUser = item.id === "user";
        const tabClass =
          panel.centered
            ? `w-full pb-2 text-sm font-medium tracking-wide transition ${
                mode === item.id
                  ? "border-b-2 border-white text-white"
                  : "border-b-2 border-transparent text-white/50 hover:text-white/75"
              }`
            : panel.card
              ? `w-full rounded-lg px-2 py-2.5 text-sm font-medium transition ${
                  mode === item.id
                    ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
                    : "text-slate-500 hover:text-slate-700"
                }`
              : `w-full rounded-md border px-1 py-1.5 text-[15px] font-medium tracking-wide transition sm:px-1.5 ${
                  mode === item.id
                    ? "border-white/50 bg-white/20 text-white"
                    : "border-white/15 text-white/65 hover:border-white/30 hover:text-white/90"
                }`;

        if (isUser && userHint) {
          return (
            <div
              key={item.id}
              className="relative"
              onMouseLeave={() => setShowUserHint(false)}
            >
              <button
                type="button"
                onClick={() => {
                  onChange(item.id);
                  setShowUserHint(true);
                }}
                className={tabClass}
              >
                {item.label}
              </button>
              {showUserHint ? (
                <div
                  role="tooltip"
                  className="pointer-events-none absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 rounded-md border border-white/20 bg-[#9f1218]/95 px-3 py-2.5 text-left text-[11px] leading-relaxed text-white shadow-[0_12px_32px_rgba(0,0,0,0.35)] backdrop-blur-sm"
                >
                  {userHint}
                </div>
              ) : null}
            </div>
          );
        }

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (isUser) setShowUserHint(false);
              onChange(item.id);
            }}
            className={tabClass}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
