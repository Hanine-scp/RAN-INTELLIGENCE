"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthAlert, AuthField, AuthLayout, AuthLink, AuthPrimaryButton } from "@/components/auth-layout";
import { forgotPassword } from "@/lib/api";
import { useLocale } from "@/lib/use-locale";

export default function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const isAdmin = searchParams.get("mode") === "admin";
  const { ta } = useLocale();
  const [email, setEmail] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [devHint, setDevHint] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setInfo("");
    setDevHint("");
    setLoading(true);
    try {
      const data = await forgotPassword({
        email,
        channel: isAdmin ? "email" : channel,
        recovery_email: isAdmin ? recoveryEmail : undefined,
      });
      setInfo(data.message);
      if (data.dev_reset_token) {
        setDevHint(`Dev — token: ${data.dev_reset_token}`);
      }
      if (data.dev_sms_code) {
        setDevHint(`Dev — SMS: ${data.dev_sms_code}`);
      }
      if (data.reset_url) {
        setDevHint((prev) => (prev ? `${prev} · ${data.reset_url}` : data.reset_url ?? ""));
      }
      if (channel === "sms" && !isAdmin) {
        setInfo(`${data.message} ${ta("auth_forgot_sms_hint")}`);
      }
      if (isAdmin) {
        setInfo(`${data.message} ${ta("auth_forgot_admin_hint")}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : ta("auth_err_forgot_failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      formTitle={isAdmin ? ta("auth_forgot_password_admin_title") : ta("auth_forgot_password_title")}
      formSubtitle={isAdmin ? ta("auth_sub_forgot_admin") : ta("auth_sub_forgot")}
      footer={
        <>
          <AuthLink href={isAdmin ? "/login?tab=admin" : "/login"}>{ta("auth_back_to_login")}</AuthLink>
          {channel === "sms" && !isAdmin && email ? (
            <>
              {" · "}
              <AuthLink href={`/reset-password?channel=sms&email=${encodeURIComponent(email)}`}>
                {ta("auth_reset_password_title")}
              </AuthLink>
            </>
          ) : null}
        </>
      }
    >
      {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}
      {info ? <AuthAlert tone="success">{info}</AuthAlert> : null}
      {devHint ? <AuthAlert tone="warning">{devHint}</AuthAlert> : null}
      <form onSubmit={onSubmit} className="space-y-3">
        <AuthField
          label={ta("auth_email")}
          type="email"
          value={email}
          onChange={setEmail}
          placeholder={ta("auth_placeholder_forgot_email")}
          icon="mail"
        />
        {isAdmin ? (
          <AuthField
            label={ta("auth_recovery_email")}
            type="email"
            value={recoveryEmail}
            onChange={setRecoveryEmail}
            placeholder={ta("auth_placeholder_recovery_email")}
            icon="mail"
          />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {(["email", "sms"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setChannel(value)}
                className={`rounded-md border px-2 py-2 text-[10px] font-bold uppercase tracking-wide transition ${
                  channel === value
                    ? "border-white/50 bg-white/20 text-white"
                    : "border-white/15 text-white/55 hover:border-white/30"
                }`}
              >
                {value === "email" ? ta("auth_forgot_channel_email") : ta("auth_forgot_channel_sms")}
              </button>
            ))}
          </div>
        )}
        <AuthPrimaryButton disabled={loading}>{loading ? "..." : ta("auth_send_link")}</AuthPrimaryButton>
      </form>
    </AuthLayout>
  );
}
