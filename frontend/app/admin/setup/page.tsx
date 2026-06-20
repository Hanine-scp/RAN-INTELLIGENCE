"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AuthPhoneField,
  AuthPasswordField,
  isPhoneValueValid,
} from "@/components/auth-fields";
import { OtpDeliveryBanner, OtpResendCountdown } from "@/components/auth-otp-premium";
import {
  AuthAlert,
  AuthDevCodesPanel,
  AuthField,
  AuthLayout,
  AuthLink,
  AuthPrimaryButton,
  AuthVirginForm,
} from "@/components/auth-layout";
import { useAuth } from "@/components/auth-provider";
import {
  bootstrapAdminSignup,
  getBootstrapStatus,
  getNotificationsStatus,
  resendBootstrapAdminOtp,
  verifyBootstrapAdmin,
} from "@/lib/auth-api";
import { isPasswordValid, passwordValidationMessage } from "@/lib/password-strength";
import { AUTH_INPUT_NAMES, clearAuthRememberEmail, useVirginFormKey } from "@/lib/auth-virgin-form";
import { useLocale } from "@/lib/use-locale";

type Step = "form" | "verify" | "done";

export default function AdminSetupPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const { locale, ta } = useLocale();
  const [step, setStep] = useState<Step>("form");
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [bootstrapKey, setBootstrapKey] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [devEmailCode, setDevEmailCode] = useState("");
  const [devSmsCode, setDevSmsCode] = useState("");
  const [emailMasked, setEmailMasked] = useState("");
  const [phoneMasked, setPhoneMasked] = useState("");
  const [resendAfterSeconds, setResendAfterSeconds] = useState(59);
  const [otpExpiresMinutes, setOtpExpiresMinutes] = useState(10);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notificationsReady, setNotificationsReady] = useState<boolean | null>(null);
  const virginFormKey = useVirginFormKey();

  const titles: Record<Step, string> = {
    form: ta("auth_admin_title_form"),
    verify: ta("auth_admin_title_verify"),
    done: ta("auth_admin_title_done"),
  };

  const subtitles: Record<Step, string> = {
    form: ta("auth_sub_admin_form"),
    verify: ta("auth_sub_admin_verify"),
    done: ta("auth_sub_admin_done"),
  };

  const applyVerificationMeta = (verification: {
    dev_email_code?: string;
    dev_phone_code?: string;
    contact?: { email_masked?: string; phone_masked?: string };
    resend_after_seconds?: number;
    otp_expires_minutes?: number;
  }) => {
    setDevEmailCode(verification.dev_email_code ?? "");
    setDevSmsCode(verification.dev_phone_code ?? "");
    setEmailMasked(verification.contact?.email_masked ?? email);
    setPhoneMasked(verification.contact?.phone_masked ?? phone);
    setResendAfterSeconds(verification.resend_after_seconds ?? 59);
    setOtpExpiresMinutes(verification.otp_expires_minutes ?? 10);
  };

  const applyOtpDeliveryFeedback = (data: {
    notifications?: { email_otp?: boolean; sms_otp?: boolean };
    verification: {
      dev_email_code?: string;
      dev_phone_code?: string;
      contact?: { email_masked?: string; phone_masked?: string };
      resend_after_seconds?: number;
      otp_expires_minutes?: number;
    };
    message?: string;
  }) => {
    const emailSent = data.notifications?.email_otp;
    const smsSent = data.notifications?.sms_otp;
    const hasDevCodes = Boolean(data.verification.dev_email_code && data.verification.dev_phone_code);

    if (emailSent && smsSent) {
      setError("");
      setInfo(data.message || ta("auth_info_codes_sent"));
    } else if (hasDevCodes) {
      setError("");
      setInfo(ta("auth_info_dev_codes_ready"));
    } else {
      setError(ta("auth_err_notifications_failed"));
      setInfo("");
    }
    applyVerificationMeta(data.verification);
  };

  useEffect(() => {
    clearAuthRememberEmail();
    getBootstrapStatus()
      .then(async (status) => {
        setAllowed(status.bootstrap_enabled);
        if (status.pending_admin) {
          setUserId(status.pending_admin.user_id);
          setEmailMasked(status.pending_admin.email_masked);
          setPhoneMasked(status.pending_admin.phone_masked);
          setStep("verify");
          setInfo(ta("auth_admin_resume_verify"));
          try {
            const data = await resendBootstrapAdminOtp(status.pending_admin.user_id);
            applyOtpDeliveryFeedback(data);
          } catch (err) {
            setError(err instanceof Error ? err.message : ta("auth_err_resend_failed"));
          }
        }
      })
      .catch(() => setAllowed(false));
    getNotificationsStatus()
      .then((s) => setNotificationsReady(s.email_ready && s.sms_ready))
      .catch(() => setNotificationsReady(false));
  }, []);

  const onSubmit = async (event: FormEvent) => {
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
    if (!isPhoneValueValid(phone)) {
      setError(ta("auth_err_phone"));
      return;
    }
    if (!bootstrapKey.trim()) {
      setError(ta("auth_err_bootstrap_key"));
      return;
    }
    if (!recoveryEmail.trim()) {
      setError(ta("auth_err_recovery_email"));
      return;
    }

    setLoading(true);
    setInfo("");
    setDevEmailCode("");
    setDevSmsCode("");
    try {
      const data = await bootstrapAdminSignup({
        full_name: fullName.trim(),
        email: email.trim(),
        phone,
        password,
        recovery_email: recoveryEmail.trim(),
        bootstrap_key: bootstrapKey.trim(),
      });
      setUserId(data.user_id);
      setStep("verify");
      applyOtpDeliveryFeedback(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : ta("auth_err_admin_denied"));
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const data = await resendBootstrapAdminOtp(userId);
      applyOtpDeliveryFeedback(data);
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
      const session = await verifyBootstrapAdmin({
        user_id: userId,
        email_code: emailCode.trim(),
        phone_code: phoneCode.trim(),
      });
      setSession(session);
      setInfo(session.message || ta("auth_admin_done_success"));
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : ta("auth_err_verify_failed"));
    } finally {
      setLoading(false);
    }
  };

  if (allowed === null) {
    return (
      <AuthLayout formTitle={ta("auth_admin_setup")} formSubtitle={ta("auth_admin_loading")}>
        <p className="text-sm text-white/70">{ta("auth_admin_loading_check")}</p>
      </AuthLayout>
    );
  }

  if (!allowed) {
    return (
      <AuthLayout
        formTitle={ta("auth_admin_setup")}
        formSubtitle={ta("auth_admin_unavailable_title")}
        footer={
          <>
            <AuthLink href="/login">{ta("auth_back_login")}</AuthLink>
          </>
        }
      >
        <AuthAlert tone="error">{ta("auth_admin_unavailable_body")}</AuthAlert>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      formTitle={titles[step]}
      formSubtitle={subtitles[step]}
      footer={
        step === "done" ? null : (
          <>
            {ta("auth_already_configured")} <AuthLink href="/login">{ta("auth_login_admin_link")}</AuthLink>
          </>
        )
      }
    >
      {step !== "verify" && error ? <AuthAlert tone="error">{error}</AuthAlert> : null}
      {step !== "verify" && info ? <AuthAlert tone="success">{info}</AuthAlert> : null}
      {step !== "verify" ? <AuthDevCodesPanel emailCode={devEmailCode} smsCode={devSmsCode} /> : null}

      {step === "form" ? (
        <AuthVirginForm key={virginFormKey} onSubmit={onSubmit} className="space-y-3">
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
          <AuthPasswordField label={ta("auth_password")} value={password} onChange={setPassword} placeholder={ta("auth_placeholder_password")} />
          <AuthPasswordField
            label={ta("auth_confirm_password")}
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder={ta("auth_confirm_password")}
            showStrength={false}
            showRules={false}
          />
          <AuthField
            label={ta("auth_recovery_email")}
            type="email"
            value={recoveryEmail}
            onChange={setRecoveryEmail}
            placeholder={ta("auth_placeholder_recovery_email")}
            icon="mail"
          />
          <AuthField
            label={ta("auth_bootstrap_key")}
            type="password"
            name={AUTH_INPUT_NAMES.bootstrapKey}
            value={bootstrapKey}
            onChange={setBootstrapKey}
            placeholder={ta("auth_placeholder_bootstrap")}
            icon="key"
          />
          {notificationsReady === false ? <p className="text-[10px] text-white/50">{ta("auth_notifications_admin_hint")}</p> : null}
          <AuthPrimaryButton disabled={loading}>{loading ? "..." : ta("auth_create_admin")}</AuthPrimaryButton>
        </AuthVirginForm>
      ) : null}

      {step === "verify" ? (
        <AuthVirginForm key={`${virginFormKey}-verify`} onSubmit={onVerify} className="space-y-3">
          <OtpDeliveryBanner
            emailMasked={emailMasked}
            phoneMasked={phoneMasked}
            expiresMinutes={otpExpiresMinutes}
          />
          {info ? <AuthAlert tone="success">{info}</AuthAlert> : null}
          {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}
          <AuthDevCodesPanel emailCode={devEmailCode} smsCode={devSmsCode} />
          <AuthField
            label={ta("auth_email_code")}
            name={AUTH_INPUT_NAMES.emailOtp}
            value={emailCode}
            onChange={(v) => setEmailCode(v.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6))}
            icon="mail"
            placeholder={ta("auth_placeholder_email_otp_short")}
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
          <AuthPrimaryButton disabled={loading}>{loading ? "..." : ta("auth_admin_activate")}</AuthPrimaryButton>
          <OtpResendCountdown seconds={resendAfterSeconds} disabled={loading} onResend={onResend} />
        </AuthVirginForm>
      ) : null}

      {step === "done" ? (
        <div className="space-y-4">
          <AuthAlert tone="success">{ta("auth_admin_done_success")}</AuthAlert>
          <AuthPrimaryButton type="button" onClick={() => router.replace("/")}>
            {ta("auth_admin_open_platform")}
          </AuthPrimaryButton>
        </div>
      ) : null}
    </AuthLayout>
  );
}
