"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthPasswordField } from "@/components/auth-fields";
import {
  AuthAlert,
  AuthField,
  AuthLayout,
  AuthLink,
  AuthPrimaryButton,
  AuthVirginForm,
} from "@/components/auth-layout";
import { registerAccount } from "@/lib/api";
import { isPasswordValid, passwordValidationMessage } from "@/lib/password-strength";
import { AUTH_INPUT_NAMES, clearAuthRememberEmail, useVirginFormKey } from "@/lib/auth-virgin-form";
import { useLocale } from "@/lib/use-locale";

export default function RegisterPage() {
  const router = useRouter();
  const { locale, ta } = useLocale();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [devHint, setDevHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const virginFormKey = useVirginFormKey();

  useEffect(() => {
    clearAuthRememberEmail();
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setDevHint("");
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
      });
      setDone(true);
      setInfo(data.message);
      if (data.dev_verify_token) {
        setDevHint(`${ta("auth_dev_verify_token")}: ${data.dev_verify_token}`);
      }
      if (data.verify_url) {
        setDevHint((prev) => (prev ? `${prev} · ${data.verify_url}` : data.verify_url ?? ""));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : ta("auth_err_signup_denied"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      formTitle={done ? ta("auth_email_verification") : ta("auth_register")}
      formSubtitle={done ? ta("auth_sub_register_done") : ta("auth_sub_register")}
      footer={
        <>
          {ta("auth_has_account")} <AuthLink href="/login">{ta("auth_login")}</AuthLink>
          {" · "}
          <AuthLink href="/signup">{ta("auth_signup_enterprise")}</AuthLink>
        </>
      }
    >
      {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}
      {info ? <AuthAlert tone="success">{info}</AuthAlert> : null}
      {devHint ? <AuthAlert tone="warning">{devHint}</AuthAlert> : null}

      {done ? (
        <div className="space-y-4">
          <AuthPrimaryButton type="button" onClick={() => router.push("/login")}>
            {ta("auth_go_login")}
          </AuthPrimaryButton>
        </div>
      ) : (
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
          <div className="space-y-2">
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
          </div>
          <AuthPrimaryButton disabled={loading}>{loading ? "..." : ta("auth_register")}</AuthPrimaryButton>
        </AuthVirginForm>
      )}
    </AuthLayout>
  );
}
