"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthPasswordField } from "@/components/auth/auth-fields";
import { AuthAlert, AuthField, AuthLayout, AuthLink, AuthPrimaryButton } from "@/components/layout/auth-layout";
import { resetPassword } from "@/lib/api";
import { useLocale } from "@/lib/hooks/use-locale";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ta } = useLocale();
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fromQuery = searchParams.get("token");
    const fromEmail = searchParams.get("email");
    const fromChannel = searchParams.get("channel");
    if (fromQuery) {
      setToken(fromQuery);
      setChannel("email");
    }
    if (fromEmail) setEmail(fromEmail);
    if (fromChannel === "sms") setChannel("sms");
  }, [searchParams]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setInfo("");
    if (channel === "email" && !token) {
      setError(ta("auth_err_invalid_token"));
      return;
    }
    if (channel === "sms" && (!email.trim() || !smsCode.trim())) {
      setError(ta("auth_err_sms_reset_required"));
      return;
    }
    if (password.length < 8) {
      setError(ta("auth_err_password_min8"));
      return;
    }
    if (password !== confirmPassword) {
      setError(ta("auth_err_password_mismatch"));
      return;
    }
    setLoading(true);
    try {
      const data = await resetPassword({
        token: channel === "email" ? token : undefined,
        email: channel === "sms" ? email.trim() : undefined,
        sms_code: channel === "sms" ? smsCode.trim() : undefined,
        new_password: password,
      });
      setInfo(data.message);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : ta("auth_err_reset_failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      formTitle={ta("auth_reset_password_title")}
      formSubtitle={channel === "sms" ? ta("auth_sub_reset_sms") : ta("auth_sub_reset")}
      footer={
        <>
          <AuthLink href="/login">{ta("auth_back_to_login")}</AuthLink>
        </>
      }
    >
      {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}
      {info ? <AuthAlert tone="success">{info}</AuthAlert> : null}
      <form onSubmit={onSubmit} className="space-y-3">
        {channel === "sms" ? (
          <>
            <AuthField
              label={ta("auth_email")}
              type="email"
              value={email}
              onChange={setEmail}
              placeholder={ta("auth_placeholder_email")}
              icon="mail"
            />
            <AuthField
              label={ta("auth_sms_code")}
              value={smsCode}
              onChange={(v) => setSmsCode(v.replace(/\D/g, "").slice(0, 6))}
              icon="phone"
              placeholder={ta("auth_placeholder_sms_otp")}
              inputMode="numeric"
              maxLength={6}
            />
          </>
        ) : null}
        <AuthPasswordField label={ta("auth_new_password")} value={password} onChange={setPassword} />
        <AuthPasswordField label={ta("auth_confirm_password")} value={confirmPassword} onChange={setConfirmPassword} />
        <AuthPrimaryButton disabled={loading}>{loading ? "..." : ta("auth_update_password")}</AuthPrimaryButton>
      </form>
    </AuthLayout>
  );
}
