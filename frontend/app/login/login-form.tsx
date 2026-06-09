"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AuthAlert,
  AuthField,
  AuthLayout,
  AuthLink,
  AuthModeTabs,
  AuthPrimaryButton,
} from "@/components/auth-layout";
import { useAuth } from "@/components/auth-provider";
import { loginAdminStep1, loginAdminStep2, loginUserStep1, loginUserStep2 } from "@/lib/api";

type Mode = "user" | "admin";
type Step = "credentials" | "mfa" | "session_key";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setSession } = useAuth();
  const [mode, setMode] = useState<Mode>("user");
  const [step, setStep] = useState<Step>("credentials");
  const [userId, setUserId] = useState<number | null>(null);
  const [mfaChannel, setMfaChannel] = useState<"email" | "phone" | "access_key">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adminAccessKey, setAdminAccessKey] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [personalAccessKey, setPersonalAccessKey] = useState("");
  const [remember, setRemember] = useState(false);
  const [devHint, setDevHint] = useState("");
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionAccessKey, setSessionAccessKey] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("ran_remember_email");
    if (saved) {
      setEmail(saved);
      setRemember(true);
    }
  }, []);

  const resetMfa = () => {
    setStep("credentials");
    setUserId(null);
    setMfaCode("");
    setPersonalAccessKey("");
    setDevHint("");
  };

  const onCredentials = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");
    if (remember) localStorage.setItem("ran_remember_email", email);
    else localStorage.removeItem("ran_remember_email");

    try {
      if (mode === "user") {
        const data = await loginUserStep1({ email, password });
        setUserId(data.user_id);
        setStep("mfa");
        const hints = [data.verification.dev_email_code, data.verification.dev_phone_code].filter(Boolean).join(" · ");
        setInfo(data.message || "");
        setDevHint(hints ? `Mode dev — OTP : ${hints}` : "");
      } else {
        const data = await loginAdminStep1({ email, password, admin_access_key: adminAccessKey });
        setUserId(data.user_id);
        setMfaChannel("email");
        setStep("mfa");
        setInfo(data.message || "");
        setDevHint(data.verification.dev_email_code ? `Mode dev — OTP : ${data.verification.dev_email_code}` : "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentification refusée");
    } finally {
      setLoading(false);
    }
  };

  const onMfa = async (event: FormEvent) => {
    event.preventDefault();
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const session =
        mode === "admin"
          ? await loginAdminStep2({ user_id: userId, email_code: mfaCode })
          : await loginUserStep2({
              user_id: userId,
              channel: mfaChannel,
              code: mfaChannel === "access_key" ? undefined : mfaCode,
              access_key: mfaChannel === "access_key" ? personalAccessKey : undefined,
            });
      setSession(session);
      if (mode === "user" && (session.session_access_key || session.message)) {
        setSessionAccessKey(session.session_access_key || "");
        setInfo(session.message || "");
        setStep("session_key");
        return;
      }
      router.replace(searchParams.get("next") || "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation MFA échouée");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      formTitle={step === "session_key" ? "Session Key" : step === "credentials" ? "Login" : "MFA"}
      formSubtitle={
        step === "session_key"
          ? "Nouvelle clé générée — conservez-la pour votre prochaine connexion"
          : step === "credentials"
            ? mode === "admin"
              ? "Console administrateur — accès restreint"
              : "Espace utilisateur — session sécurisée"
            : "Confirmez votre identité pour ouvrir la session"
      }
      footer={
        <>
          Pas de compte ? <AuthLink href="/signup">Sign Up</AuthLink>
          {" · "}
          <AuthLink href="/activate">Activer</AuthLink>
        </>
      }
    >
      {step === "session_key" ? (
        <div className="space-y-4">
          <AuthAlert tone="success">Connexion réussie.</AuthAlert>
          <div className="rounded-md border border-white/25 bg-white/10 px-4 py-4 text-center backdrop-blur-sm">
            {sessionAccessKey ? (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/55">Clé prochaine session</p>
                <p className="mt-2 break-all font-mono text-base font-bold text-white">{sessionAccessKey}</p>
              </>
            ) : (
              <p className="text-sm text-white/85">
                Votre nouvelle clé a été envoyée par <strong>email</strong> et <strong>SMS</strong>.
              </p>
            )}
          </div>
          <AuthPrimaryButton type="button" onClick={() => router.replace(searchParams.get("next") || "/")}>
            Continuer
          </AuthPrimaryButton>
        </div>
      ) : null}

      {step === "credentials" ? <AuthModeTabs mode={mode} onChange={(m) => { setMode(m); resetMfa(); }} /> : null}

      {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}
      {info ? <AuthAlert tone="success">{info}</AuthAlert> : null}
      {devHint ? <AuthAlert tone="warning">{devHint}</AuthAlert> : null}

      {step === "credentials" ? (
        <form onSubmit={onCredentials} className="space-y-3">
          <AuthField label="Username" type="email" value={email} onChange={setEmail} placeholder="prenom.nom@ooredoo.tn" icon="user" />
          <AuthField label="Password" type="password" value={password} onChange={setPassword} icon="lock" />
          {mode === "admin" ? (
            <AuthField label="Master Key" type="password" value={adminAccessKey} onChange={setAdminAccessKey} icon="key" />
          ) : null}

          <div className="flex items-center justify-between pt-1 text-[11px] text-white/75">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-3.5 w-3.5 rounded border-white/40 accent-white" />
              Remember me
            </label>
            <span className="flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current opacity-80">
                <path d="M4 6h16v12H4Zm2 2 6 4 6-4V8l-6 4-6-4Z" />
              </svg>
              <AuthLink href="/activate">Forget Password</AuthLink>
            </span>
          </div>

          <AuthPrimaryButton disabled={loading}>{loading ? "..." : "Login"}</AuthPrimaryButton>
        </form>
      ) : step !== "session_key" ? (
        <form onSubmit={onMfa} className="space-y-3">
          {mode === "user" ? (
            <div className="grid grid-cols-3 gap-2">
              {(["email", "phone", "access_key"] as const).map((channel) => (
                <button
                  key={channel}
                  type="button"
                  onClick={() => setMfaChannel(channel)}
                  className={`rounded-md border px-1.5 py-1.5 text-[9px] font-bold uppercase tracking-wide ${
                    mfaChannel === channel ? "border-white/50 bg-white/20 text-white" : "border-white/15 text-white/55"
                  }`}
                >
                  {channel === "email" ? "Email" : channel === "phone" ? "SMS" : "Key"}
                </button>
              ))}
            </div>
          ) : null}

          {mfaChannel === "access_key" && mode === "user" ? (
            <AuthField label="Access Key" type="password" value={personalAccessKey} onChange={setPersonalAccessKey} icon="key" />
          ) : (
            <AuthField label="OTP Code" value={mfaCode} onChange={setMfaCode} icon="lock" inputMode="numeric" placeholder="Code reçu par email ou SMS" />
          )}

          <AuthPrimaryButton disabled={loading}>{loading ? "..." : "Login"}</AuthPrimaryButton>
          <button type="button" onClick={resetMfa} className="w-full text-[10px] font-semibold uppercase tracking-wide text-white/55 hover:text-white">
            Back
          </button>
        </form>
      ) : null}
    </AuthLayout>
  );
}
