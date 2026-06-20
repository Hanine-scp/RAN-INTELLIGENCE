"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthPhoneField, AuthPasswordField, isPhoneValueValid } from "@/components/auth-fields";
import {
  AuthAlert,
  AuthDevCodesPanel,
  AuthField,
  AuthLayout,
  AuthLink,
  AuthPrimaryButton,
  AuthSecondaryButton,
  AuthSelect,
  AuthVirginForm,
  authTypography,
} from "@/components/auth-layout";
import { useAuth } from "@/components/auth-provider";
import { getJobProfiles, resendSignupOtp, signupUser, verifySignup } from "@/lib/api";
import { getNotificationsStatus } from "@/lib/auth-api";
import type { AuthSession } from "@/lib/auth";
import { isPasswordValid, passwordValidationMessage } from "@/lib/password-strength";
import { AUTH_INPUT_NAMES, clearAuthRememberEmail, useVirginFormKey } from "@/lib/auth-virgin-form";
import { useLocale } from "@/lib/use-locale";

type Step = "form" | "verify" | "key";

const DEFAULT_INVITE_KEY = process.env.NEXT_PUBLIC_SIGNUP_INVITE_KEY ?? "RAN-USER-INVITE-2026";

export default function SignupPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const { locale, isFr, ta } = useLocale();
  const [step, setStep] = useState<Step>("form");
  const [jobProfiles, setJobProfiles] = useState<{ id: string; fr: string; en: string }[]>([]);
  const [userId, setUserId] = useState<number | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [jobProfile, setJobProfile] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [sessionAccessKey, setSessionAccessKey] = useState("");
  const [pendingSession, setPendingSession] = useState<AuthSession | null>(null);
  const [devEmailCode, setDevEmailCode] = useState("");
  const [devSmsCode, setDevSmsCode] = useState("");
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notificationsReady, setNotificationsReady] = useState<boolean | null>(null);
  const virginFormKey = useVirginFormKey();

  useEffect(() => {
    clearAuthRememberEmail();
    getJobProfiles()
      .then(setJobProfiles)
      .catch(() => setJobProfiles([]));
    getNotificationsStatus()
      .then((s) => setNotificationsReady(s.email_ready && s.sms_ready))
      .catch(() => setNotificationsReady(false));
  }, []);

  const titles: Record<Step, string> = {
    form: ta("auth_signup"),
    verify: ta("auth_verify"),
    key: ta("auth_session_key"),
  };

  const subtitles: Record<Step, string> = {
    form: ta("auth_sub_signup"),
    verify: ta("auth_sub_verify"),
    key: ta("auth_sub_session_key"),
  };

  const onSignup = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const pwdError = passwordValidationMessage(password, locale);
    if (pwdError) {
      setError(pwdError);
      return;
    }
    if (!isPasswordValid(password)) {
      setError(ta("auth_err_password_rules"));
      return;
    }
    if (password !== confirmPassword) {
      setError(ta("auth_err_password_mismatch"));
      return;
    }
    if (!jobProfile) {
      setError(ta("auth_err_job_profile"));
      return;
    }
    if (!isPhoneValueValid(phone)) {
      setError(ta("auth_err_phone"));
      return;
    }

    setLoading(true);
    setInfo("");
    setDevEmailCode("");
    setDevSmsCode("");
    try {
      const data = await signupUser({
        full_name: fullName.trim(),
        email: email.trim(),
        phone,
        password,
        job_profile: jobProfile,
        signup_access_key: DEFAULT_INVITE_KEY,
      });
      setUserId(data.user_id);
      setStep("verify");

      const emailSent = data.notifications?.email_otp;
      const smsSent = data.notifications?.sms_otp;
      setInfo(emailSent && smsSent ? ta("auth_info_codes_sent") : ta("auth_info_account_created_dev"));
      setDevEmailCode(data.verification.dev_email_code ?? "");
      setDevSmsCode(data.verification.dev_phone_code ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : ta("auth_err_signup_denied"));
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const data = await resendSignupOtp(userId);
      setInfo(data.message || ta("auth_info_codes_resent"));
      setDevEmailCode(data.verification.dev_email_code ?? "");
      setDevSmsCode(data.verification.dev_phone_code ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : ta("auth_err_resend_failed"));
    } finally {
      setLoading(false);
    }
  };

  const onVerify = async (event: FormEvent) => {
    event.preventDefault();
    if (!userId) return;
    if (!/^[A-Z0-9]{6}$/.test(emailCode)) {
      setError(ta("auth_err_email_otp_format"));
      return;
    }
    if (!/^\d{6}$/.test(phoneCode)) {
      setError(ta("auth_err_sms_otp_format"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const session = await verifySignup({
        user_id: userId,
        email_code: emailCode.trim(),
        phone_code: phoneCode.trim(),
      });
      setPendingSession(session);
      setInfo(session.message || "");
      if (session.session_access_key) {
        setSessionAccessKey(session.session_access_key);
        setStep("key");
      } else if (session.message) {
        setStep("key");
      } else {
        setSession(session);
        router.replace("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : ta("auth_err_verify_failed"));
    } finally {
      setLoading(false);
    }
  };

  const onFinish = () => {
    if (!pendingSession) {
      router.replace("/login");
      return;
    }
    setSession(pendingSession);
    router.replace("/");
  };

  return (
    <AuthLayout
      formTitle={titles[step]}
      formSubtitle={step === "form" ? undefined : subtitles[step]}
      footer={
        <>
          {ta("auth_has_account")} <AuthLink href="/login">{ta("auth_login")}</AuthLink>
          <p className={`mt-3 ${authTypography.line2}`}>
            {ta("auth_admin_signup_hint")}{" "}
            <AuthLink href="/admin/setup">{ta("auth_admin_signup_link")}</AuthLink>
          </p>
        </>
      }
    >
      {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}
      {info ? <AuthAlert tone="success">{info}</AuthAlert> : null}
      <AuthDevCodesPanel emailCode={devEmailCode} smsCode={devSmsCode} />

      {step === "form" ? (
        <AuthVirginForm key={virginFormKey} onSubmit={onSignup} className="space-y-3">
          <AuthField
            label={ta("auth_full_name")}
            name={AUTH_INPUT_NAMES.fullName}
            value={fullName}
            onChange={setFullName}
            placeholder={ta("auth_placeholder_full_name")}
            icon="user"
          />
          <AuthField
            label={ta("auth_email")}
            type="email"
            name={AUTH_INPUT_NAMES.email}
            value={email}
            onChange={setEmail}
            placeholder={ta("auth_placeholder_email")}
            icon="mail"
          />
          <AuthPhoneField label={ta("auth_phone")} value={phone} onChange={setPhone} defaultRegion="TN" />
          <div className="space-y-2">
            <AuthPasswordField label={ta("auth_password")} value={password} onChange={setPassword} placeholder={ta("auth_placeholder_password")} />
            <AuthPasswordField
              label={ta("auth_confirm_password")}
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder={ta("auth_confirm_password")}
              showStrength={false}
              showRules={false}
            />
          </div>
          <AuthSelect
            label={ta("auth_job_profile")}
            value={jobProfile}
            onChange={setJobProfile}
            options={jobProfiles.map((p) => ({ id: p.id, label: isFr ? p.fr : p.en }))}
          />
          {notificationsReady === false ? <p className="text-[10px] text-white/50">{ta("auth_notifications_hint")}</p> : null}
          <AuthPrimaryButton disabled={loading}>{loading ? "..." : ta("auth_signup")}</AuthPrimaryButton>
        </AuthVirginForm>
      ) : null}

      {step === "verify" ? (
        <AuthVirginForm key={`${virginFormKey}-verify`} onSubmit={onVerify} className="space-y-3">
          <AuthField
            label={ta("auth_email_code")}
            name={AUTH_INPUT_NAMES.emailOtp}
            value={emailCode}
            onChange={(v) => setEmailCode(v.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6))}
            icon="mail"
            placeholder={ta("auth_placeholder_email_otp")}
            maxLength={6}
            autoComplete="one-time-code"
            virgin={false}
          />
          <AuthField
            label={ta("auth_sms_code")}
            name={AUTH_INPUT_NAMES.phoneOtp}
            value={phoneCode}
            onChange={(v) => setPhoneCode(v.replace(/\D/g, "").slice(0, 6))}
            icon="phone"
            placeholder={ta("auth_placeholder_sms_otp")}
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            virgin={false}
          />
          <AuthPrimaryButton disabled={loading}>{loading ? "..." : ta("auth_verify")}</AuthPrimaryButton>
          <AuthSecondaryButton disabled={loading} onClick={() => void onResend()}>
            {ta("auth_resend_codes")}
          </AuthSecondaryButton>
          <AuthSecondaryButton
            variant="ghost"
            onClick={() => {
              setStep("form");
              setEmailCode("");
              setPhoneCode("");
              setDevEmailCode("");
              setDevSmsCode("");
              setError("");
            }}
          >
            {ta("auth_back")}
          </AuthSecondaryButton>
        </AuthVirginForm>
      ) : null}

      {step === "key" ? (
        <div className="space-y-4">
          <AuthAlert tone="success">{ta("auth_account_activated")}</AuthAlert>
          <div className="rounded-md border border-white/25 bg-white/10 px-4 py-4 text-center backdrop-blur-sm">
            {sessionAccessKey ? (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/55">{ta("auth_next_session_key")}</p>
                <p className="mt-2 break-all font-mono text-base font-bold text-white">{sessionAccessKey}</p>
              </>
            ) : (
              <p className="text-sm text-white/85">{ta("auth_session_key_sent")}</p>
            )}
          </div>
          <AuthPrimaryButton type="button" onClick={onFinish}>
            {ta("auth_continue")}
          </AuthPrimaryButton>
        </div>
      ) : null}
    </AuthLayout>
  );
}
