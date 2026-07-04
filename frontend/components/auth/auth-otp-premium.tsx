"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useAuthFormTheme, type AuthFormTheme } from "@/lib/auth/auth-theme";
import { useLocale } from "@/lib/hooks/use-locale";

function authPanel(theme: AuthFormTheme) {
  return {
    card: theme === "card",
    centered: theme === "centered",
    light: theme === "card",
  };
}

type OtpPremiumInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  length?: number;
  numeric?: boolean;
  autoComplete?: string;
  name?: string;
  placeholder?: string;
  /** E.164 phone for WebOTP SMS autofill (mobile browsers) */
  webOtpHint?: string;
};

export function OtpPremiumInput({
  label,
  value,
  onChange,
  length = 6,
  numeric = false,
  autoComplete = "one-time-code",
  name,
  placeholder,
  webOtpHint,
}: OtpPremiumInputProps) {
  const inputId = useId();
  const panel = authPanel(useAuthFormTheme());

  const normalize = useCallback(
    (raw: string) => {
      const cleaned = numeric ? raw.replace(/\D/g, "") : raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      return cleaned.slice(0, length);
    },
    [length, numeric],
  );

  const setValue = (next: string) => onChange(normalize(next));

  useEffect(() => {
    if (!webOtpHint || typeof window === "undefined") return;
    const ac = new AbortController();
    if (!("OTPCredential" in window) || !navigator.credentials) return;

    navigator.credentials
      .get({
        otp: { transport: ["sms"] },
        signal: ac.signal,
      } as CredentialRequestOptions)
      .then((cred) => {
        if (cred && "code" in cred && typeof (cred as { code?: string }).code === "string") {
          setValue((cred as { code: string }).code);
        }
      })
      .catch(() => {
        /* WebOTP unavailable or user dismissed */
      });

    return () => ac.abort();
  }, [webOtpHint, setValue]);

  return (
    <div className="block">
      <label
        htmlFor={inputId}
        className={`mb-2 block text-sm font-semibold ${
          panel.centered ? "text-white/90" : panel.card ? "text-slate-700" : "text-white/90"
        }`}
      >
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        name={name}
        inputMode={numeric ? "numeric" : "text"}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={length}
        placeholder={placeholder ?? (numeric ? "000000" : "ABC123")}
        className={
          panel.centered
            ? "h-11 w-full border-0 border-b-2 border-white/55 bg-transparent px-1 text-center text-base font-semibold tracking-[0.28em] text-white outline-none transition placeholder:font-normal placeholder:tracking-normal placeholder:text-white/40 focus:border-white"
            : panel.card
              ? "h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-center text-base font-semibold tracking-[0.28em] text-slate-900 shadow-sm outline-none transition placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 focus:border-[#b51218] focus:ring-4 focus:ring-[#b51218]/10"
              : "h-12 w-full rounded-xl border border-white/50 bg-white/95 px-4 text-center text-base font-semibold tracking-[0.28em] text-slate-900 shadow-[0_4px_16px_rgba(0,0,0,0.14)] outline-none transition placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 focus:border-white focus:ring-4 focus:ring-white/25"
        }
        aria-label={label}
      />
    </div>
  );
}

type ResendCountdownProps = {
  seconds: number;
  disabled?: boolean;
  onResend: () => void | Promise<void>;
};

export function OtpResendCountdown({ seconds, disabled, onResend }: ResendCountdownProps) {
  const { ta } = useLocale();
  const panel = authPanel(useAuthFormTheme());
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setRemaining(seconds);
  }, [seconds]);

  useEffect(() => {
    if (remaining <= 0) return;
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [remaining]);

  const canResend = remaining <= 0 && !disabled && !loading;

  return (
    <button
      type="button"
      disabled={!canResend}
      onClick={async () => {
        if (!canResend) return;
        setLoading(true);
        try {
          await onResend();
          setRemaining(seconds);
        } finally {
          setLoading(false);
        }
      }}
      className={`w-full text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${
        panel.centered
          ? "text-white/65 hover:text-white disabled:hover:text-white/65"
          : panel.card
            ? "text-slate-500 hover:text-[#b51218] disabled:hover:text-slate-500"
            : "text-white/55 hover:text-white disabled:hover:text-white/55"
      }`}
    >
      {remaining > 0
        ? `${ta("auth_otp_resend_in")} ${remaining}s`
        : loading
          ? "..."
          : ta("auth_resend_codes")}
    </button>
  );
}

export function OtpDeliveryBanner({
  emailMasked,
  phoneMasked,
  expiresMinutes,
}: {
  emailMasked?: string;
  phoneMasked?: string;
  expiresMinutes?: number;
}) {
  const { ta } = useLocale();
  const panel = authPanel(useAuthFormTheme());
  if (!emailMasked && !phoneMasked) return null;

  return (
    <div
      className={
        panel.centered
          ? "rounded-md border border-white/20 bg-white/8 px-4 py-3 backdrop-blur-sm"
          : panel.card
            ? "rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            : "rounded-lg border border-white/20 bg-white/8 px-4 py-3 backdrop-blur-sm"
      }
    >
      <p
        className={`text-[10px] font-bold uppercase tracking-[0.12em] ${
          panel.centered ? "text-white/55" : panel.card ? "text-slate-500" : "text-white/55"
        }`}
      >
        {ta("auth_otp_sent_title")}
      </p>
      <div className={`mt-2 space-y-1 text-sm ${panel.centered ? "text-white/88" : panel.card ? "text-slate-700" : "text-white/88"}`}>
        {emailMasked ? (
          <p className="flex items-center gap-2">
            <span className="text-white/50">✉</span>
            <span>{emailMasked}</span>
          </p>
        ) : null}
        {phoneMasked ? (
          <p className="flex items-center gap-2">
            <span className="text-white/50">📱</span>
            <span>{phoneMasked}</span>
          </p>
        ) : null}
      </div>
      {expiresMinutes ? (
        <p className={`mt-2 text-[10px] ${panel.centered ? "text-white/45" : panel.card ? "text-slate-400" : "text-white/45"}`}>
          {ta("auth_otp_expires")} {expiresMinutes} min
        </p>
      ) : null}
    </div>
  );
}
