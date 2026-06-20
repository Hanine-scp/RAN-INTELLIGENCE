"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthAlert, AuthLayout, AuthLink, AuthPrimaryButton } from "@/components/auth-layout";
import { authT } from "@/lib/auth-i18n";
import { verifyEmailToken } from "@/lib/api";
import { useLocale } from "@/lib/use-locale";

export function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ta, locale } = useLocale();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setMessage(authT(locale, "auth_err_invalid_token"));
      return;
    }
    verifyEmailToken(token)
      .then((data) => {
        setStatus("success");
        setMessage(data.message);
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : authT(locale, "auth_err_verify_email_failed"));
      });
  }, [searchParams, locale]);

  return (
    <AuthLayout
      formTitle={ta("auth_email_verification")}
      formSubtitle={ta("auth_sub_email_verify")}
      footer={
        status === "success" ? (
          <>
            <AuthLink href="/login">{ta("auth_login")}</AuthLink>
          </>
        ) : null
      }
    >
      {status === "loading" ? <AuthAlert tone="warning">{ta("auth_verify_in_progress")}</AuthAlert> : null}
      {status === "success" ? <AuthAlert tone="success">{message}</AuthAlert> : null}
      {status === "error" ? <AuthAlert tone="error">{message}</AuthAlert> : null}
      {status === "success" ? (
        <AuthPrimaryButton type="button" onClick={() => router.push("/login")}>
          {ta("auth_go_login")}
        </AuthPrimaryButton>
      ) : null}
    </AuthLayout>
  );
}
