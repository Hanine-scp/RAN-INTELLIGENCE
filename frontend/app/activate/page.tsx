"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthAlert, AuthField, AuthLayout, AuthLink, AuthPrimaryButton } from "@/components/auth-layout";
import { activateUserAccount } from "@/lib/api";
import { useLocale } from "@/lib/use-locale";

export default function ActivatePage() {
  const router = useRouter();
  const { ta } = useLocale();
  const [email, setEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const data = await activateUserAccount({ email, email_code: emailCode, phone_code: phoneCode });
      setSuccess(data.message);
      window.setTimeout(() => router.replace("/login"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : ta("auth_err_activate_failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      formTitle={ta("auth_activate")}
      formSubtitle={ta("auth_sub_activate")}
      footer={
        <>
          {ta("auth_already_active")} <AuthLink href="/login">{ta("auth_login")}</AuthLink>
        </>
      }
    >
      {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}
      {success ? <AuthAlert tone="success">{success}</AuthAlert> : null}

      <form onSubmit={onSubmit} className="space-y-3">
        <AuthField
          label={ta("auth_email")}
          type="email"
          value={email}
          onChange={setEmail}
          placeholder={ta("auth_placeholder_forgot_email")}
          icon="user"
        />
        <AuthField
          label={ta("auth_email_code")}
          value={emailCode}
          onChange={setEmailCode}
          icon="mail"
          placeholder={ta("auth_placeholder_email_otp_short")}
        />
        <AuthField
          label={ta("auth_sms_code")}
          value={phoneCode}
          onChange={setPhoneCode}
          icon="phone"
          placeholder={ta("auth_placeholder_sms_otp")}
        />

        <AuthPrimaryButton disabled={loading}>{loading ? "..." : ta("auth_activate")}</AuthPrimaryButton>
      </form>
    </AuthLayout>
  );
}
