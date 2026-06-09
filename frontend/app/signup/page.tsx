"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthPhoneField, AuthPasswordField, isPhoneValueValid } from "@/components/auth-fields";
import {
  AuthAlert,
  AuthField,
  AuthLayout,
  AuthLink,
  AuthPrimaryButton,
  AuthSelect,
} from "@/components/auth-layout";
import { useAuth } from "@/components/auth-provider";
import { getJobProfiles, getNotificationsStatus, resendSignupOtp, signupUser, verifySignup } from "@/lib/api";
import type { AuthSession, JobProfile } from "@/lib/auth";
import { isPasswordValid, passwordValidationMessage } from "@/lib/password-strength";

type Step = "form" | "verify" | "key";

const DEFAULT_INVITE_KEY = process.env.NEXT_PUBLIC_SIGNUP_INVITE_KEY ?? "RAN-USER-INVITE-2026";

function formatDevHints(email?: string, sms?: string) {
  const parts = [
    email ? `Code email : ${email}` : "",
    sms ? `Code SMS : ${sms}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join("  ·  ") : "";
}

export default function SignupPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [step, setStep] = useState<Step>("form");
  const [jobProfiles, setJobProfiles] = useState<JobProfile[]>([]);
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
  const [devHint, setDevHint] = useState("");
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notificationsReady, setNotificationsReady] = useState<boolean | null>(null);

  useEffect(() => {
    getJobProfiles()
      .then(setJobProfiles)
      .catch(() => setJobProfiles([]));
    getNotificationsStatus()
      .then((s) => setNotificationsReady(s.email_ready && s.sms_ready))
      .catch(() => setNotificationsReady(false));
  }, []);

  const onSignup = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const pwdError = passwordValidationMessage(password);
    if (pwdError) {
      setError(pwdError);
      return;
    }
    if (!isPasswordValid(password)) {
      setError("Le mot de passe ne respecte pas les critères de sécurité.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    if (!jobProfile) {
      setError("Sélectionnez votre profil métier.");
      return;
    }
    if (!isPhoneValueValid(phone)) {
      setError("Saisissez un numéro de téléphone complet.");
      return;
    }

    setLoading(true);
    setInfo("");
    setDevHint("");
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
      if (emailSent && smsSent) {
        setInfo("Email et SMS envoyés. Saisissez les 6 chiffres reçus.");
      } else {
        setInfo(
          "Compte créé. Configurez SMTP/Twilio dans .env.auth pour recevoir email & SMS. Utilisez les codes ci-dessous en mode dev.",
        );
      }
      setDevHint(formatDevHints(data.verification.dev_email_code, data.verification.dev_phone_code));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inscription refusée");
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
      setInfo(data.message || "Nouveaux codes générés.");
      setDevHint(formatDevHints(data.verification.dev_email_code, data.verification.dev_phone_code));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Renvoi échoué");
    } finally {
      setLoading(false);
    }
  };

  const onVerify = async (event: FormEvent) => {
    event.preventDefault();
    if (!userId) return;
    if (!/^[A-Z0-9]{6}$/.test(emailCode)) {
      setError("Le code email doit contenir 6 caractères (lettres et chiffres).");
      return;
    }
    if (!/^\d{6}$/.test(phoneCode)) {
      setError("Le code SMS doit contenir exactement 6 chiffres.");
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
      setError(err instanceof Error ? err.message : "Vérification échouée");
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

  const titles: Record<Step, string> = {
    form: "Sign Up",
    verify: "Verify",
    key: "Session Key",
  };

  const subtitles: Record<Step, string> = {
    form: "Créez votre compte Ooredoo RAN Intelligence",
    verify: "Code email (lettres + chiffres) et code SMS (6 chiffres)",
    key: "Conservez cette clé — elle change à chaque nouvelle connexion",
  };

  return (
    <AuthLayout
      formTitle={titles[step]}
      formSubtitle={subtitles[step]}
      footer={
        <>
          Déjà un compte ? <AuthLink href="/login">Login</AuthLink>
        </>
      }
    >
      {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}
      {info ? <AuthAlert tone="success">{info}</AuthAlert> : null}
      {devHint ? (
        <div className="mb-3 rounded-md border border-amber-300/50 bg-amber-950/40 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-200/80">Codes de vérification</p>
          <p className="mt-1 font-mono text-sm font-bold tracking-wide text-amber-50">{devHint}</p>
        </div>
      ) : null}

      {step === "form" ? (
        <form onSubmit={onSignup} className="space-y-3">
          <AuthField label="Username" value={fullName} onChange={setFullName} placeholder="Nom complet" icon="user" />
          <AuthField label="Email Address" type="email" value={email} onChange={setEmail} placeholder="prenom.nom@ooredoo.tn" icon="mail" />
          <AuthPhoneField label="Numéro de téléphone" value={phone} onChange={setPhone} defaultRegion="TN" />
          <AuthPasswordField label="Password" value={password} onChange={setPassword} placeholder="Mot de passe sécurisé" />
          <AuthPasswordField
            label="Confirm Password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="Confirmer le mot de passe"
            showStrength={false}
            showRules={false}
          />
          <AuthSelect
            label="Profil métier"
            value={jobProfile}
            onChange={setJobProfile}
            options={jobProfiles.map((p) => ({ id: p.id, label: p.fr }))}
          />
          {notificationsReady === false ? (
            <p className="text-[10px] text-white/50">
              Email/SMS : configurez <code className="text-white/70">.env.auth</code> (voir docs/AUTH_NOTIFICATIONS_SETUP.md)
            </p>
          ) : null}
          <AuthPrimaryButton disabled={loading}>{loading ? "..." : "Sign Up"}</AuthPrimaryButton>
        </form>
      ) : null}

      {step === "verify" ? (
        <form onSubmit={onVerify} className="space-y-3">
          <AuthField
            label="Code email"
            value={emailCode}
            onChange={(v) => setEmailCode(v.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6))}
            icon="mail"
            placeholder="Ex: K7M2P9 — lettres et chiffres"
            maxLength={6}
            autoComplete="one-time-code"
          />
          <AuthField
            label="Code SMS"
            value={phoneCode}
            onChange={(v) => setPhoneCode(v.replace(/\D/g, "").slice(0, 6))}
            icon="phone"
            placeholder="6 chiffres"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
          />
          <AuthPrimaryButton disabled={loading}>{loading ? "..." : "Verify"}</AuthPrimaryButton>
          <button
            type="button"
            disabled={loading}
            onClick={onResend}
            className="w-full text-[10px] font-semibold uppercase tracking-wide text-white/55 hover:text-white"
          >
            Renvoyer les codes
          </button>
          <button
            type="button"
            onClick={() => setStep("form")}
            className="w-full text-[10px] font-semibold uppercase tracking-wide text-white/40 hover:text-white/70"
          >
            Back
          </button>
        </form>
      ) : null}

      {step === "key" ? (
        <div className="space-y-4">
          <AuthAlert tone="success">Compte activé avec succès.</AuthAlert>
          <div className="rounded-md border border-white/25 bg-white/10 px-4 py-4 text-center backdrop-blur-sm">
            {sessionAccessKey ? (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/55">Clé prochaine session</p>
                <p className="mt-2 break-all font-mono text-base font-bold text-white">{sessionAccessKey}</p>
              </>
            ) : (
              <p className="text-sm text-white/85">
                Votre clé d&apos;accès a été envoyée sur votre <strong>email</strong> et par <strong>SMS</strong>.
              </p>
            )}
          </div>
          <AuthPrimaryButton type="button" onClick={onFinish}>
            Continuer
          </AuthPrimaryButton>
        </div>
      ) : null}
    </AuthLayout>
  );
}
