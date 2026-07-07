"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthPasswordField, AuthPhoneField, isPhoneValueValid } from "@/components/auth/auth-fields";
import {
  AuthAlert,
  AuthDevCodesPanel,
  AuthField,
  AuthFormSection,
  AuthLayout,
  AuthLink,
  AuthPrimaryButton,
  AuthSelect,
  AuthVirginForm,
} from "@/components/layout/auth-layout";
import { getJobProfiles, resendSignupOtp, signupUser, verifySignup } from "@/lib/api";
import { isPublicSignupEnabled } from "@/lib/auth/auth-signup-policy";
import { type JobProfile } from "@/lib/auth";
import { isPasswordValid, passwordValidationMessage } from "@/lib/password-strength";
import { AUTH_INPUT_NAMES, clearAuthRememberEmail, useVirginFormKey } from "@/lib/auth/auth-virgin-form";
import { useAuth } from "@/components/providers/auth-provider";
import { useLocale } from "@/lib/hooks/use-locale";

// Development: Default signup access key (from DEFAULT_SIGNUP_KEY in .env.auth)
// Users can override this in the form field
const DEFAULT_SIGNUP_ACCESS_KEY = "7ioEjyYQxObKLmVhcoxmxw";

function SignupSuccessPanel({ onLogin }: { onLogin: () => void }) {
  const { ta } = useLocale();

  return (
    <div className="space-y-5 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 ring-4 ring-emerald-100">
        <svg viewBox="0 0 24 24" className="h-8 w-8 fill-emerald-600" aria-hidden>
          <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
        </svg>
      </div>
      <p className="text-sm leading-relaxed text-slate-600">{ta("auth_signup_pending_hint")}</p>
      <AuthPrimaryButton type="button" onClick={onLogin}>
        {ta("auth_go_login")}
      </AuthPrimaryButton>
    </div>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const { locale, isFr, ta } = useLocale();
  const { setSession } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobProfile, setJobProfile] = useState("");
  const [department, setDepartment] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signupAccessKey, setSignupAccessKey] = useState(DEFAULT_SIGNUP_ACCESS_KEY);
  const [emailCode, setEmailCode] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [profiles, setProfiles] = useState<JobProfile[]>([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"form" | "verify">("form");
  const [userId, setUserId] = useState<number | null>(null);
  const [devEmailCode, setDevEmailCode] = useState("");
  const [devSmsCode, setDevSmsCode] = useState("");
  const virginFormKey = useVirginFormKey();
  const signupOpen = isPublicSignupEnabled();

  const profileOptions = useMemo(
    () => profiles.map((profile) => ({ id: profile.id, label: isFr ? profile.fr : profile.en })),
    [profiles, isFr],
  );

  useEffect(() => {
    clearAuthRememberEmail();
  }, []);

  useEffect(() => {
    if (!signupOpen) return;
    getJobProfiles().then(setProfiles).catch(() => setProfiles([]));
  }, [signupOpen]);

  const applyVerificationMeta = (data: { verification?: { dev_email_code?: string; dev_phone_code?: string } }) => {
    setDevEmailCode(data.verification?.dev_email_code ?? "");
    setDevSmsCode(data.verification?.dev_phone_code ?? "");
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setInfo("");

    if (!fullName.trim()) {
      setError(ta("auth_err_full_name"));
      return;
    }
    if (!jobProfile.trim()) {
      setError(ta("auth_err_job_profile"));
      return;
    }
    if (!isPhoneValueValid(phone)) {
      setError(ta("auth_err_phone"));
      return;
    }
    if (!signupAccessKey.trim()) {
      setError(ta("auth_err_bootstrap_key"));
      return;
    }
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

    setLoading(true);
    try {
      const data = await signupUser({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        phone: phone.trim(),
        job_profile: jobProfile,
        signup_access_key: signupAccessKey.trim(),
      });

      setUserId(data.user_id);
      setStep("verify");
      applyVerificationMeta(data);
      setInfo(data.message || ta("auth_sub_verify"));
    } catch (err) {
      setError(err instanceof Error ? err.message : ta("auth_err_signup_denied"));
    } finally {
      setLoading(false);
    }
  };

  const onVerify = async (event: FormEvent) => {
    event.preventDefault();
    if (!userId) return;

    setError("");
    setInfo("");

    if (!/^[A-Z0-9]{6}$/.test(emailCode)) {
      setError(ta("auth_err_email_otp_format"));
      return;
    }
    if (!/^\d{6}$/.test(phoneCode)) {
      setError(ta("auth_err_sms_otp_format"));
      return;
    }

    setLoading(true);
    try {
      const session = await verifySignup({
        user_id: userId,
        email_code: emailCode.trim(),
        phone_code: phoneCode.trim(),
      });
      setSession(session);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : ta("auth_err_verify_failed"));
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    if (!userId) return;
    setError("");
    setLoading(true);
    try {
      const data = await resendSignupOtp(userId);
      applyVerificationMeta(data);
      setInfo(data.message || ta("auth_info_codes_sent"));
    } catch (err) {
      setError(err instanceof Error ? err.message : ta("auth_err_resend_failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      wide
      contentPanel={signupOpen}
      formEyebrow="RAN Intelligence · Ooredoo"
      formTitle={step === "verify" ? ta("auth_verify") : ta("auth_signup_user")}
      formSubtitle={step === "verify" ? ta("auth_sub_verify") : ta("auth_sub_signup_user")}
      footer={
        <p>
          {ta("auth_has_account")} <AuthLink href="/login">{ta("auth_login")}</AuthLink>
        </p>
      }
    >
      {!signupOpen ? (
        <div className="space-y-4">
          <AuthAlert tone="warning">{ta("auth_accounts_admin_managed")}</AuthAlert>
          <AuthPrimaryButton type="button" onClick={() => router.push("/login")}>
            {ta("auth_go_login")}
          </AuthPrimaryButton>
        </div>
      ) : (
        <>
          {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}
          {info ? <AuthAlert tone="success">{info}</AuthAlert> : null}

          {step === "verify" ? (
            <form onSubmit={onVerify} className="space-y-6">
              <AuthDevCodesPanel emailCode={devEmailCode} smsCode={devSmsCode} />
              <AuthField
                label={ta("auth_email_code")}
                value={emailCode}
                onChange={setEmailCode}
                placeholder={ta("auth_placeholder_email_otp_short")}
                icon="mail"
              />
              <AuthField
                label={ta("auth_sms_code")}
                value={phoneCode}
                onChange={setPhoneCode}
                placeholder={ta("auth_placeholder_sms_otp")}
                icon="phone"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <AuthPrimaryButton disabled={loading}>{loading ? "..." : ta("auth_verify")}</AuthPrimaryButton>
                <AuthPrimaryButton type="button" onClick={onResend} disabled={loading || !userId}>
                  {ta("auth_resend_codes")}
                </AuthPrimaryButton>
              </div>
            </form>
          ) : (
            <AuthVirginForm key={virginFormKey} onSubmit={onSubmit} className="space-y-6">
              <AuthFormSection title={ta("auth_signup_section_identity")}>
                <AuthField
                  label={ta("auth_full_name")}
                  name={AUTH_INPUT_NAMES.fullName}
                  value={fullName}
                  onChange={setFullName}
                  placeholder={ta("auth_placeholder_full_name")}
                  icon="user"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <AuthField
                    label={ta("auth_email")}
                    type="email"
                    name={AUTH_INPUT_NAMES.email}
                    value={email}
                    onChange={setEmail}
                    placeholder={ta("auth_placeholder_email")}
                    icon="mail"
                  />
                  <AuthPhoneField label={ta("auth_phone")} value={phone} onChange={setPhone} />
                </div>
              </AuthFormSection>

              <AuthFormSection title={ta("auth_signup_section_profile")}>
                <AuthSelect
                  label={ta("auth_job_profile")}
                  value={jobProfile}
                  onChange={setJobProfile}
                  options={profileOptions}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <AuthField
                    label={ta("auth_department")}
                    name="department"
                    value={department}
                    onChange={setDepartment}
                    placeholder={ta("auth_placeholder_department")}
                    icon="user"
                  />
                  <AuthField
                    label={ta("auth_employee_id")}
                    name="employee_id"
                    value={employeeId}
                    onChange={setEmployeeId}
                    placeholder={ta("auth_placeholder_employee_id")}
                    icon="key"
                  />
                </div>
              </AuthFormSection>

              <AuthFormSection title={ta("auth_signup_section_security")}>
                <AuthPasswordField
                  label={ta("auth_password")}
                  value={password}
                  onChange={setPassword}
                  placeholder={ta("auth_placeholder_password")}
                />
                <AuthPasswordField
                  label={ta("auth_confirm_password")}
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder={ta("auth_confirm_password")}
                  showStrength={false}
                  showRules={false}
                />
                <AuthField
                  label={ta("auth_bootstrap_key")}
                  type="password"
                  value={signupAccessKey}
                  onChange={setSignupAccessKey}
                  placeholder={ta("auth_placeholder_bootstrap")}
                  icon="key"
                />
              </AuthFormSection>

              <AuthPrimaryButton disabled={loading}>
                {loading ? "..." : ta("auth_signup_submit")}
              </AuthPrimaryButton>
            </AuthVirginForm>
          )}
        </>
      )}
    </AuthLayout>
  );
}
