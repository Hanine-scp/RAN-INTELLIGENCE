"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthPasswordField, AuthPhoneField, isPhoneValueValid } from "@/components/auth/auth-fields";
import {
  AuthAlert,
  AuthField,
  AuthFormSection,
  AuthLayout,
  AuthLink,
  AuthPrimaryButton,
  AuthSelect,
  AuthVirginForm,
} from "@/components/layout/auth-layout";
import { getJobProfiles, registerAccount } from "@/lib/api";
import { isPublicSignupEnabled } from "@/lib/auth/auth-signup-policy";
import { type JobProfile } from "@/lib/auth";
import { isPasswordValid, passwordValidationMessage } from "@/lib/password-strength";
import { AUTH_INPUT_NAMES, clearAuthRememberEmail, useVirginFormKey } from "@/lib/auth/auth-virgin-form";
import { useLocale } from "@/lib/hooks/use-locale";

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
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobProfile, setJobProfile] = useState("");
  const [department, setDepartment] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profiles, setProfiles] = useState<JobProfile[]>([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
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
    getJobProfiles()
      .then(setProfiles)
      .catch(() => setProfiles([]));
  }, [signupOpen]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
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
      const data = await registerAccount({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        phone: phone.trim(),
        job_profile: jobProfile,
        department: department.trim(),
        employee_id: employeeId.trim(),
      });
      setDone(true);
      setInfo(data.message || ta("auth_sub_signup_user_done"));
    } catch (err) {
      setError(err instanceof Error ? err.message : ta("auth_err_signup_denied"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      wide
      contentPanel={signupOpen || done}
      formEyebrow={done ? undefined : "RAN Intelligence · Ooredoo"}
      formTitle={done ? ta("auth_sub_signup_pending_title") : ta("auth_signup_user")}
      formSubtitle={done ? ta("auth_sub_signup_user_done") : signupOpen ? ta("auth_sub_signup_user") : undefined}
      footer={
        <p>
          {ta("auth_has_account")} <AuthLink href="/login">{ta("auth_login")}</AuthLink>
        </p>
      }
    >
      {!signupOpen && !done ? (
        <div className="space-y-4">
          <AuthAlert tone="warning">{ta("auth_accounts_admin_managed")}</AuthAlert>
          <AuthPrimaryButton type="button" onClick={() => router.push("/login")}>
            {ta("auth_go_login")}
          </AuthPrimaryButton>
        </div>
      ) : done ? (
        <SignupSuccessPanel onLogin={() => router.push("/login")} />
      ) : (
        <>
          {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}
          {info ? <AuthAlert tone="success">{info}</AuthAlert> : null}

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
            </AuthFormSection>

            <AuthPrimaryButton disabled={loading}>
              {loading ? "..." : ta("auth_signup_submit")}
            </AuthPrimaryButton>
          </AuthVirginForm>
        </>
      )}
    </AuthLayout>
  );
}
