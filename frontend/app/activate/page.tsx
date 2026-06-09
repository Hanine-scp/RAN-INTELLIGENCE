"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AuthAlert,
  AuthField,
  AuthLayout,
  AuthLink,
  AuthPrimaryButton,
} from "@/components/auth-layout";
import { activateUserAccount } from "@/lib/api";

export default function ActivatePage() {
  const router = useRouter();
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
      setError(err instanceof Error ? err.message : "Activation refusée");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      formTitle="Activate"
      formSubtitle="Finalisez votre accès — codes email & SMS requis"
      footer={
        <>
          Déjà activé ? <AuthLink href="/login">Login</AuthLink>
        </>
      }
    >
      {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}
      {success ? <AuthAlert tone="success">{success}</AuthAlert> : null}

      <form onSubmit={onSubmit} className="space-y-3">
        <AuthField label="Username" type="email" value={email} onChange={setEmail} placeholder="prenom.nom@ooredoo.tn" icon="user" />
        <AuthField label="Email Code" value={emailCode} onChange={setEmailCode} icon="mail" placeholder="OTP email" />
        <AuthField label="SMS Code" value={phoneCode} onChange={setPhoneCode} icon="phone" placeholder="OTP SMS" />

        <AuthPrimaryButton disabled={loading}>{loading ? "..." : "Activate"}</AuthPrimaryButton>
      </form>
    </AuthLayout>
  );
}
