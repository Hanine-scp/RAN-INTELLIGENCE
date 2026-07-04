"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AuthAlert,
  AuthDevCodesPanel,
  AuthField,
  AuthLayout,
  AuthLink,
  AuthModeTabs,
  AuthPrimaryButton,
  AuthSecondaryButton,
  AuthVirginForm,
} from "@/components/layout/auth-layout";
import { OtpDeliveryBanner, OtpPremiumInput, OtpResendCountdown } from "@/components/auth/auth-otp-premium";
import { useAuth } from "@/components/providers/auth-provider";
import { getBootstrapStatus } from "@/lib/auth/auth-api";
import {
  ApiFlowError,
  loginAdminStep1,
  loginAdminStep2,
  loginAuth,
  loginUserStep1,
  loginUserStep2,
  resendLoginAdminMfa,
  resendLoginSecurityOtp,
  resendLoginUserMfa,
  resendVerificationEmail,
  verifyLoginSecurity,
} from "@/lib/api";
import { AUTH_INPUT_NAMES, clearAuthRememberEmail, loadAuthRememberEmail, saveAuthRememberEmail, useVirginFormKey } from "@/lib/auth/auth-virgin-form";
import { isPublicSignupEnabled } from "@/lib/auth/auth-signup-policy";
import { useLocale } from "@/lib/hooks/use-locale";

type Mode = "user" | "admin";
type Step = "credentials" | "security" | "mfa" | "session_key";

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
  const [resendAfterSeconds, setResendAfterSeconds] = useState(59);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionAccessKey, setSessionAccessKey] = useState("");
  const [bootstrapEnabled, setBootstrapEnabled] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const virginFormKey = useVirginFormKey();

  useEffect(() => {
    const saved = loadAuthRememberEmail();
    if (saved) {
      setEmail(saved);
      setRememberMe(true);
    }
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
    resend_after_seconds?: number;
  }) => {
    if (!verification) return;
    setDevEmailCode(verification.dev_email_code ?? "");
    setDevSmsCode(verification.dev_phone_code ?? "");
    setEmailMasked(verification.contact?.email_masked ?? "");
    setPhoneMasked(verification.contact?.phone_masked ?? "");
    setOtpExpiresMinutes(verification.otp_expires_minutes ?? 10);
    setResendAfterSeconds(verification.resend_after_seconds ?? 59);
  };

  const handleLoginSecurityRequired = (err: ApiFlowError) => {
    const userIdValue = Number(err.data.user_id);
    if (!Number.isFinite(userIdValue)) return false;
    setUserId(userIdValue);
    setStep("security");
    setError("");
    setInfo(String(err.data.message ?? ta("auth_info_security_verify")));
    applyVerificationMeta(err.data.verification as Parameters<typeof applyVerificationMeta>[0]);
    return true;
  };

  const finishLogin = (session: Awaited<ReturnType<typeof loginAuth>>, mustChange?: boolean) => {
    if (rememberMe && email.trim()) {
      saveAuthRememberEmail(email.trim());
    } else {
      clearAuthRememberEmail();
    }
    setSession(session);
    if (mustChange || session.must_change_password) {
      router.replace("/reset-password?forced=1");
      return;
    }
    router.replace(searchParams.get("next") || "/");
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

  const onResendMfa = async () => {
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const data = mode === "admin" ? await resendLoginAdminMfa(userId) : await resendLoginUserMfa(userId);
      setInfo(data.message || ta("auth_info_mfa_sent"));
      if (mode === "user" && data.requires_sms !== undefined) {
        setRequiresSms(data.requires_sms);
      }
      applyVerificationMeta(data.verification);
    } catch (err) {
      setError(err instanceof Error ? err.message : ta("auth_err_resend_failed"));
    } finally {
      setLoading(false);
    }
  };

  const onResendSecurity = async () => {
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const data = await resendLoginSecurityOtp(userId);
      setInfo(data.message || ta("auth_info_security_code_sent"));
      applyVerificationMeta(data.verification);
    } catch (err) {
      setError(err instanceof Error ? err.message : ta("auth_err_resend_failed"));
    } finally {
      setLoading(false);
    }
  };

  const onSecurityVerify = async (event: FormEvent) => {
    event.preventDefault();
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const data = await verifyLoginSecurity({ user_id: userId, email_code: emailCode.trim() });
      setInfo(data.message || ta("auth_info_security_cleared"));
      setEmailCode("");
      setStep("credentials");
    } catch (err) {
      setError(err instanceof Error ? err.message : ta("auth_err_mfa_failed"));
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
        try {
          const data = await loginAdminStep1({ email, password, master_key: masterKey });
          if (!data.mfa_required) {
            finishLogin(data as unknown as Awaited<ReturnType<typeof loginAuth>>);
            return;
          }
          setUserId(data.user_id);
          setRequiresSms(true);
          setStep("mfa");
          setInfo(data.message || ta("auth_info_mfa_sent"));
          applyVerificationMeta(data.verification);
        } catch (err) {
          if (err instanceof ApiFlowError && err.code === "login_security_required" && handleLoginSecurityRequired(err)) {
            return;
          }
          throw err;
        }
        return;
      }

      try {
        const session = await loginAuth({ email, password });
        finishLogin(session);
        return;
      } catch (jwtErr) {
        if (jwtErr instanceof ApiFlowError && jwtErr.code === "login_security_required" && handleLoginSecurityRequired(jwtErr)) {
          return;
        }
        const jwtMessage = jwtErr instanceof Error ? jwtErr.message : ta("auth_err_login_denied");
        const lower = jwtMessage.toLowerCase();
        if (lower.includes("email not verified") || lower.includes("inactive")) {
          throw jwtErr;
        }
        try {
          const data = await loginUserStep1({ email, password });
          if (!data.mfa_required) {
            const session = data as unknown as Awaited<ReturnType<typeof loginAuth>>;
            finishLogin(session, session.must_change_password);
            return;
          }
          setUserId(data.user_id);
          setRequiresSms(data.requires_sms ?? true);
          setStep("mfa");
          setInfo(data.message || ta("auth_info_mfa_sent"));
          applyVerificationMeta(data.verification);
        } catch (enterpriseErr) {
          if (
            enterpriseErr instanceof ApiFlowError &&
            enterpriseErr.code === "login_security_required" &&
            handleLoginSecurityRequired(enterpriseErr)
          ) {
            return;
          }
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
      if (mode === "user" && (session.session_access_key || session.message)) {
        setSession(session);
        setSessionAccessKey(session.session_access_key || "");
        setInfo(session.message || "");
        setStep("session_key");
        return;
      }
      finishLogin(session, session.must_change_password);
    } catch (err) {
      setError(err instanceof Error ? err.message : ta("auth_err_mfa_failed"));
    } finally {
      setLoading(false);
    }
  };

  const formTitle =
    step === "session_key"
      ? ta("auth_session_key")
      : step === "security"
        ? ta("auth_security_verify")
        : step === "credentials"
          ? ta("auth_login")
          : ta("auth_verify");

  const formSubtitle =
    step === "session_key"
      ? ta("auth_sub_login_session_key")
      : step === "security"
        ? ta("auth_sub_login_security")
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

  const publicSignup = isPublicSignupEnabled();

  return (
    <AuthLayout
      formTitle={formTitle}
      formSubtitle={step === "credentials" ? undefined : formSubtitle}
      footer={
        <>
          {publicSignup && step === "credentials" && mode === "user" ? (
            <p>
              {ta("auth_no_account")} <AuthLink href="/signup">{ta("auth_signup_user")}</AuthLink>
            </p>
          ) : (
            <p>{ta("auth_accounts_admin_managed")}</p>
          )}
          {bootstrapEnabled ? (
            <p className="mt-2">
              <AuthLink href="/admin/setup">{ta("auth_setup_admin_link")}</AuthLink>
            </p>
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

      {step === "credentials" ? (
        <AuthModeTabs mode={mode} onChange={onModeChange} userHint={ta("auth_sub_login_user")} />
      ) : null}

      {step === "security" ? (
        <AuthVirginForm key={`${virginFormKey}-security`} onSubmit={onSecurityVerify} className="space-y-3">
          <AuthAlert tone="warning">{ta("auth_security_verify_hint")}</AuthAlert>
          <OtpDeliveryBanner emailMasked={emailMasked} expiresMinutes={otpExpiresMinutes} />
          <OtpPremiumInput
            label={ta("auth_security_code")}
            value={emailCode}
            onChange={setEmailCode}
            name={AUTH_INPUT_NAMES.emailOtp}
            placeholder={ta("auth_placeholder_email_otp_short")}
            autoComplete="one-time-code"
          />
          <AuthPrimaryButton disabled={loading}>{loading ? "..." : ta("auth_verify")}</AuthPrimaryButton>
          <OtpResendCountdown seconds={resendAfterSeconds} disabled={loading} onResend={() => void onResendSecurity()} />
          <AuthSecondaryButton onClick={resetAll}>{ta("auth_restart")}</AuthSecondaryButton>
        </AuthVirginForm>
      ) : null}

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
        <AuthVirginForm key={virginFormKey} onSubmit={onCredentials} className="space-y-4">
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
              type="password"
              name={AUTH_INPUT_NAMES.masterKey}
              value={masterKey}
              onChange={setMasterKey}
              placeholder={ta("auth_placeholder_master_key")}
              icon="key"
            />
          ) : null}

          {(mode === "user" || mode === "admin") && (
            <div className="flex items-center justify-between pt-1">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-white/80">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-3.5 w-3.5 rounded-sm border-white/40 accent-white"
                />
                {ta("auth_remember_me")}
              </label>
              <AuthLink href={forgotHref}>{ta("auth_forgot_password_link")}</AuthLink>
            </div>
          )}

          <div className="pt-2">
            <AuthPrimaryButton disabled={loading}>{loading ? "..." : ta("auth_login")}</AuthPrimaryButton>
          </div>
        </AuthVirginForm>
      ) : step === "mfa" ? (
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
          <OtpResendCountdown seconds={resendAfterSeconds} disabled={loading} onResend={() => void onResendMfa()} />
          <AuthSecondaryButton onClick={resetAll}>{ta("auth_restart")}</AuthSecondaryButton>
        </AuthVirginForm>
      ) : null}
    </AuthLayout>
  );
}
