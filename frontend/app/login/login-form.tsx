"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AuthAlert,
  AuthDevCodesPanel,
  AuthField,
  AuthLayout,
  AuthLink,
  AuthPrimaryButton,
  AuthSecondaryButton,
  AuthVirginForm,
  authTypography,
} from "@/components/auth-layout";
import { OtpDeliveryBanner, OtpPremiumInput } from "@/components/auth-otp-premium";
import { useAuth } from "@/components/auth-provider";
import { getBootstrapStatus } from "@/lib/auth-api";
import {
  loginAdminStep1,
  loginAdminStep2,
  loginAuth,
  loginUserStep1,
  loginUserStep2,
  resendVerificationEmail,
} from "@/lib/api";
import { AUTH_INPUT_NAMES, clearAuthRememberEmail, useVirginFormKey } from "@/lib/auth-virgin-form";
import { useLocale } from "@/lib/use-locale";

type Mode = "user" | "admin";
type Step = "credentials" | "mfa" | "session_key";

function LoginModeTabs({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const { ta } = useLocale();
  const items: { id: Mode; label: string }[] = [
    { id: "user", label: ta("auth_tab_user") },
    { id: "admin", label: ta("auth_tab_admin") },
  ];

  return (
    <div className="mb-4 grid grid-cols-2 gap-1.5">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={`rounded-md border px-1 py-1.5 transition sm:px-1.5 ${
            mode === item.id
              ? "border-white/50 bg-white/20 text-[15px] font-medium tracking-wide text-white"
              : "border-white/15 text-[15px] font-medium tracking-wide text-white/65 hover:border-white/30 hover:text-white/90"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setSession } = useAuth();
  const { ta } = useLocale();
  const tabParam = searchParams.get("tab");
  const initialMode: Mode = tabParam === "admin" ? "admin" : "user";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [step, setStep] = useState<Step>("credentials");
  const [userId, setUserId] = useState<number | null>(null);
  const [requiresSms, setRequiresSms] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [masterKey, setMasterKey] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [devEmailCode, setDevEmailCode] = useState("");
  const [devSmsCode, setDevSmsCode] = useState("");
  const [emailMasked, setEmailMasked] = useState("");
  const [phoneMasked, setPhoneMasked] = useState("");
  const [otpExpiresMinutes, setOtpExpiresMinutes] = useState(10);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionAccessKey, setSessionAccessKey] = useState("");
  const [bootstrapEnabled, setBootstrapEnabled] = useState(false);
  const virginFormKey = useVirginFormKey();

  useEffect(() => {
    clearAuthRememberEmail();
    getBootstrapStatus()
      .then((s) => setBootstrapEnabled(s.bootstrap_enabled))
      .catch(() => setBootstrapEnabled(false));
  }, []);

  const resetAll = () => {
    setStep("credentials");
    setUserId(null);
    setRequiresSms(true);
    setEmailCode("");
    setPhoneCode("");
    setDevEmailCode("");
    setDevSmsCode("");
    setEmailMasked("");
    setPhoneMasked("");
    setError("");
    setInfo("");
  };

  const applyVerificationMeta = (verification?: {
    dev_email_code?: string;
    dev_phone_code?: string;
    contact?: { email_masked?: string; phone_masked?: string };
    otp_expires_minutes?: number;
  }) => {
    if (!verification) return;
    setDevEmailCode(verification.dev_email_code ?? "");
    setDevSmsCode(verification.dev_phone_code ?? "");
    setEmailMasked(verification.contact?.email_masked ?? "");
    setPhoneMasked(verification.contact?.phone_masked ?? "");
    setOtpExpiresMinutes(verification.otp_expires_minutes ?? 10);
  };

  const onModeChange = (next: Mode) => {
    setMode(next);
    setPassword("");
    setMasterKey("");
    resetAll();
  };

  const onResendVerification = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await resendVerificationEmail({ email: email.trim() });
      setInfo(data.message);
      if (data.dev_verify_token) {
        setInfo(`${data.message} — ${ta("auth_dev_verify_token")}: ${data.dev_verify_token}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : ta("auth_err_resend_failed"));
    } finally {
      setLoading(false);
    }
  };

  const onCredentials = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");
    setDevEmailCode("");
    setDevSmsCode("");

    try {
      if (mode === "admin") {
        const data = await loginAdminStep1({ email, password, master_key: masterKey });
        setUserId(data.user_id);
        setRequiresSms(true);
        setStep("mfa");
        setInfo(data.message || ta("auth_info_mfa_sent"));
        applyVerificationMeta(data.verification);
        return;
      }

      try {
        const session = await loginAuth({ email, password });
        setSession(session);
        router.replace(searchParams.get("next") || "/");
        return;
      } catch (jwtErr) {
        const jwtMessage = jwtErr instanceof Error ? jwtErr.message : ta("auth_err_login_denied");
        const lower = jwtMessage.toLowerCase();
        if (lower.includes("email not verified") || lower.includes("inactive")) {
          throw jwtErr;
        }
        try {
          const data = await loginUserStep1({ email, password });
          setUserId(data.user_id);
          setRequiresSms(data.requires_sms ?? true);
          setStep("mfa");
          setInfo(data.message || ta("auth_info_mfa_sent"));
          applyVerificationMeta(data.verification);
        } catch {
          throw jwtErr;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : ta("auth_err_login_denied"));
    } finally {
      setLoading(false);
    }
  };

  const onMfa = async (event: FormEvent) => {
    event.preventDefault();
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const payload = { user_id: userId, email_code: emailCode.trim(), phone_code: phoneCode.trim() };
      const session = mode === "admin" ? await loginAdminStep2(payload) : await loginUserStep2(payload);
      setSession(session);
      if (mode === "user" && (session.session_access_key || session.message)) {
        setSessionAccessKey(session.session_access_key || "");
        setInfo(session.message || "");
        setStep("session_key");
        return;
      }
      router.replace(searchParams.get("next") || "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : ta("auth_err_mfa_failed"));
    } finally {
      setLoading(false);
    }
  };

  const formTitle =
    step === "session_key" ? ta("auth_session_key") : step === "credentials" ? ta("auth_login") : ta("auth_verify");

  const formSubtitle =
    step === "session_key"
      ? ta("auth_sub_login_session_key")
      : step === "credentials"
        ? mode === "admin"
          ? ta("auth_sub_login_admin")
          : ta("auth_sub_login_user")
        : mode === "admin"
          ? ta("auth_sub_login_mfa_admin")
          : ta("auth_sub_login_mfa");

  const showResendVerification =
    mode === "user" && step === "credentials" && error.toLowerCase().includes("email not verified");

  const forgotHref =
    mode === "admin" ? "/forgot-password?mode=admin" : "/forgot-password?mode=user";

  return (
    <AuthLayout
      formTitle={formTitle}
      formSubtitle={formSubtitle}
      footer={
        <>
          {ta("auth_no_account")} <AuthLink href="/register">{ta("auth_register")}</AuthLink>
          {" · "}
          <AuthLink href="/signup">{ta("auth_signup_enterprise")}</AuthLink>
          {bootstrapEnabled ? (
            <>
              {" · "}
              <AuthLink href="/admin/setup">{ta("auth_setup_admin_link")}</AuthLink>
            </>
          ) : null}
        </>
      }
    >
      {step === "session_key" ? (
        <div className="space-y-4">
          <AuthAlert tone="success">{ta("auth_login_success")}</AuthAlert>
          <div className="rounded-md border border-white/25 bg-white/10 px-4 py-4 text-center backdrop-blur-sm">
            {sessionAccessKey ? (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/55">{ta("auth_next_session_key")}</p>
                <p className="mt-2 break-all font-mono text-base font-bold text-white">{sessionAccessKey}</p>
              </>
            ) : (
              <p className="text-sm text-white/85">{ta("auth_session_key_sent_rich")}</p>
            )}
          </div>
          <AuthPrimaryButton type="button" onClick={() => router.replace(searchParams.get("next") || "/")}>
            {ta("auth_continue")}
          </AuthPrimaryButton>
        </div>
      ) : null}

      {step === "credentials" ? <LoginModeTabs mode={mode} onChange={onModeChange} /> : null}

      {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}
      {error.toLowerCase().includes("pending verification") ? (
        <p className="text-center text-[11px] text-white/75">
          {ta("auth_admin_pending_login_hint")}{" "}
          <AuthLink href="/admin/setup">{ta("auth_admin_pending_login_link")}</AuthLink>
        </p>
      ) : null}
      {info ? <AuthAlert tone="success">{info}</AuthAlert> : null}
      <AuthDevCodesPanel emailCode={devEmailCode} smsCode={devSmsCode} />

      {showResendVerification ? (
        <AuthSecondaryButton disabled={loading} onClick={() => void onResendVerification()}>
          {ta("auth_resend_verification")}
        </AuthSecondaryButton>
      ) : null}

      {step === "credentials" ? (
        <AuthVirginForm key={virginFormKey} onSubmit={onCredentials} className="space-y-3">
          <AuthField
            label={ta("auth_email")}
            type="email"
            name={AUTH_INPUT_NAMES.email}
            value={email}
            onChange={setEmail}
            placeholder={ta("auth_placeholder_email")}
            icon="mail"
          />
          <AuthField
            label={ta("auth_password")}
            type="password"
            name={AUTH_INPUT_NAMES.password}
            value={password}
            onChange={setPassword}
            icon="lock"
          />
          {mode === "admin" ? (
            <AuthField
              label={ta("auth_master_key")}
              name={AUTH_INPUT_NAMES.masterKey}
              value={masterKey}
              onChange={setMasterKey}
              placeholder={ta("auth_placeholder_master_key")}
              icon="key"
            />
          ) : null}

          {(mode === "user" || mode === "admin") && (
            <div className={`flex justify-end pt-1 ${authTypography.line2}`}>
              <AuthLink href={forgotHref}>{ta("auth_forgot_password_link")}</AuthLink>
            </div>
          )}

          <AuthPrimaryButton disabled={loading}>{loading ? "..." : ta("auth_login")}</AuthPrimaryButton>
        </AuthVirginForm>
      ) : step !== "session_key" ? (
        <AuthVirginForm key={`${virginFormKey}-mfa`} onSubmit={onMfa} className="space-y-3">
          <OtpDeliveryBanner
            emailMasked={emailMasked}
            phoneMasked={requiresSms ? phoneMasked : undefined}
            expiresMinutes={otpExpiresMinutes}
          />
          <OtpPremiumInput
            label={ta("auth_email_code")}
            value={emailCode}
            onChange={setEmailCode}
            name={AUTH_INPUT_NAMES.emailOtp}
            placeholder={ta("auth_placeholder_email_otp_short")}
            autoComplete="one-time-code"
          />
          {requiresSms ? (
            <OtpPremiumInput
              label={ta("auth_sms_code")}
              value={phoneCode}
              onChange={setPhoneCode}
              name={AUTH_INPUT_NAMES.phoneOtp}
              numeric
              placeholder={ta("auth_placeholder_sms_otp")}
              autoComplete="one-time-code"
            />
          ) : null}
          <AuthPrimaryButton disabled={loading}>{loading ? "..." : ta("auth_verify")}</AuthPrimaryButton>
          <AuthSecondaryButton onClick={resetAll}>{ta("auth_restart")}</AuthSecondaryButton>
        </AuthVirginForm>
      ) : null}
    </AuthLayout>
  );
}
