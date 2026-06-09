"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { useAuth } from "@/components/auth-provider";
import { useAppContext } from "@/components/app-provider";
import {
  adminCreateUser,
  adminVerifyUser,
  createAccessKey,
  getJobProfiles,
  listAuthUsers,
  resendProvisionOtp,
  setUserActive,
} from "@/lib/api";
import { isAdmin, type JobProfile } from "@/lib/auth";

type CreateResult = {
  user_id: number;
  email: string;
  phone: string;
  temporary_password: string;
  personal_access_key: string;
  verification: {
    dev_email_code?: string;
    dev_phone_code?: string;
  };
};

export default function AdminUsersPage() {
  const { user } = useAuth();
  const { filters } = useAppContext();
  const fr = filters.language === "Français";

  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [profiles, setProfiles] = useState<JobProfile[]>([]);
  const [step, setStep] = useState<"form" | "verify" | "done">("form");
  const [createResult, setCreateResult] = useState<CreateResult | null>(null);
  const [emailCode, setEmailCode] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [devHint, setDevHint] = useState("");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [jobProfile, setJobProfile] = useState("");
  const [password, setPassword] = useState("");
  const [confirmData, setConfirmData] = useState(false);

  const [keyLabel, setKeyLabel] = useState("");
  const [keyType, setKeyType] = useState("admin_login");
  const [maxUses, setMaxUses] = useState(10);
  const [generatedKey, setGeneratedKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const pendingUsers = useMemo(
    () => rows.filter((row) => String(row.role) === "user" && !Boolean(row.is_active)),
    [rows],
  );

  const load = async () => {
    setLoading(true);
    try {
      const [users, jobProfiles] = await Promise.all([listAuthUsers(), getJobProfiles()]);
      setRows(users);
      setProfiles(jobProfiles);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin(user)) void load();
  }, [user]);

  const resetCreateFlow = () => {
    setStep("form");
    setCreateResult(null);
    setEmailCode("");
    setPhoneCode("");
    setDevHint("");
    setFullName("");
    setEmail("");
    setPhone("");
    setDepartment("");
    setEmployeeId("");
    setJobProfile("");
    setPassword("");
    setConfirmData(false);
  };

  const onCreateUser = async (event: FormEvent) => {
    event.preventDefault();
    if (!confirmData) {
      setError(fr ? "Confirmez l'exactitude des données." : "Confirm data accuracy.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await adminCreateUser({
        full_name: fullName,
        email,
        phone,
        job_profile: jobProfile,
        department,
        employee_id: employeeId,
        password: password || undefined,
      });
      setCreateResult(data);
      setStep("verify");
      const hints = [data.verification.dev_email_code, data.verification.dev_phone_code].filter(Boolean).join(" / ");
      setDevHint(hints ? `${fr ? "Codes dev" : "Dev codes"}: ${hints}` : "");
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création échouée");
    } finally {
      setLoading(false);
    }
  };

  const onVerifyUser = async (event: FormEvent) => {
    event.preventDefault();
    if (!createResult) return;
    setLoading(true);
    setError("");
    try {
      await adminVerifyUser(createResult.user_id, { email_code: emailCode, phone_code: phoneCode });
      setStep("done");
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vérification échouée");
    } finally {
      setLoading(false);
    }
  };

  const onResendOtp = async (userId: number) => {
    try {
      const data = await resendProvisionOtp(userId);
      const hints = [data.verification.dev_email_code, data.verification.dev_phone_code].filter(Boolean).join(" / ");
      setDevHint(hints ? `${fr ? "Nouveaux codes dev" : "New dev codes"}: ${hints}` : "");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Renvoi OTP échoué");
    }
  };

  const onCreateKey = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const data = await createAccessKey({ key_label: keyLabel, key_type: keyType, max_uses: maxUses });
      setGeneratedKey(data.access_key);
      setKeyLabel("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création clé échouée");
    }
  };

  if (!isAdmin(user)) {
    return (
      <PageShell title="Accès refusé">
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Réservé aux administrateurs.</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={fr ? "Gestion des utilisateurs" : "User management"}
      subtitle={fr ? "Création sécurisée des comptes — vérification email & téléphone" : "Secure account provisioning — email & phone verification"}
    >
      {error ? <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</p> : null}
      {devHint ? <p className="mb-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">{devHint}</p> : null}

      <section className="mb-4 rounded-2xl border border-red-100 bg-gradient-to-br from-white to-red-50/30 p-5 shadow-[0_12px_32px_rgba(220,38,38,0.08)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-red-700">
              {fr ? "Création de compte utilisateur" : "Create user account"}
            </p>
            <p className="text-xs text-slate-500">
              {fr ? "Étape 1 : données · Étape 2 : vérification email & SMS" : "Step 1: data · Step 2: email & SMS verification"}
            </p>
          </div>
          <div className="flex gap-2">
            {(["form", "verify", "done"] as const).map((item, idx) => (
              <span
                key={item}
                className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${
                  step === item ? "bg-red-600 text-white" : "bg-red-100 text-red-700"
                }`}
              >
                {idx + 1}
              </span>
            ))}
          </div>
        </div>

        {step === "form" ? (
          <form onSubmit={onCreateUser} className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {fr ? "Nom complet" : "Full name"}
              <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-red-100 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100" />
            </label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {fr ? "Profil métier" : "Job profile"}
              <select required value={jobProfile} onChange={(e) => setJobProfile(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-red-100 bg-white px-3 text-sm outline-none focus:border-red-300">
                <option value="">{fr ? "Sélectionner..." : "Select..."}</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {fr ? profile.fr : profile.en}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Email
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-red-100 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100" />
            </label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {fr ? "Téléphone" : "Phone"}
              <input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+216..." className="mt-1 h-10 w-full rounded-xl border border-red-100 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100" />
            </label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {fr ? "Département / équipe" : "Department / team"}
              <input required value={department} onChange={(e) => setDepartment(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-red-100 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100" />
            </label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {fr ? "Matricule (optionnel)" : "Employee ID (optional)"}
              <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-red-100 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100" />
            </label>
            <label className="md:col-span-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {fr ? "Mot de passe initial (auto si vide)" : "Initial password (auto if empty)"}
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} className="mt-1 h-10 w-full rounded-xl border border-red-100 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100" />
            </label>
            <label className="md:col-span-2 flex cursor-pointer items-center gap-3 rounded-xl border border-red-100 bg-white px-3 py-3 text-xs text-slate-700">
              <input type="checkbox" checked={confirmData} onChange={(e) => setConfirmData(e.target.checked)} className="h-4 w-4 accent-red-600" />
              {fr
                ? "Je confirme l'exactitude des données saisies et l'autorisation d'accès à la plateforme interne."
                : "I confirm data accuracy and authorization to access the internal platform."}
            </label>
            <button type="submit" disabled={loading} className="md:col-span-2 h-11 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
              {loading ? (fr ? "Création..." : "Creating...") : fr ? "Créer le compte & envoyer OTP" : "Create account & send OTP"}
            </button>
          </form>
        ) : null}

        {step === "verify" && createResult ? (
          <form onSubmit={onVerifyUser} className="space-y-4">
            <div className="grid grid-cols-1 gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 md:grid-cols-2">
              <p>
                <span className="font-semibold">Email:</span> {createResult.email}
              </p>
              <p>
                <span className="font-semibold">{fr ? "Téléphone" : "Phone"}:</span> {createResult.phone}
              </p>
              <p className="md:col-span-2">
                <span className="font-semibold">{fr ? "Mot de passe temporaire" : "Temporary password"}:</span>{" "}
                <span className="font-mono">{createResult.temporary_password}</span>
              </p>
              <p className="md:col-span-2">
                <span className="font-semibold">{fr ? "Clé d'accès personnelle" : "Personal access key"}:</span>{" "}
                <span className="font-mono">{createResult.personal_access_key}</span>
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {fr ? "Code vérification email" : "Email verification code"}
                <input required value={emailCode} onChange={(e) => setEmailCode(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-red-100 bg-white px-3 text-sm outline-none focus:border-red-300" />
              </label>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {fr ? "Code vérification téléphone" : "Phone verification code"}
                <input required value={phoneCode} onChange={(e) => setPhoneCode(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-red-100 bg-white px-3 text-sm outline-none focus:border-red-300" />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={loading} className="h-10 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                {fr ? "Valider & activer le compte" : "Validate & activate account"}
              </button>
              <button type="button" onClick={() => void onResendOtp(createResult.user_id)} className="h-10 rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50">
                {fr ? "Renvoyer OTP" : "Resend OTP"}
              </button>
              <button type="button" onClick={resetCreateFlow} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                {fr ? "Nouveau compte" : "New account"}
              </button>
            </div>
          </form>
        ) : null}

        {step === "done" ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {fr ? "Compte activé avec succès. L'utilisateur peut se connecter sur /login ou activer via /activate." : "Account activated. User can login at /login."}
            <button type="button" onClick={resetCreateFlow} className="mt-3 block text-xs font-semibold text-red-700 hover:underline">
              {fr ? "Créer un autre compte" : "Create another account"}
            </button>
          </div>
        ) : null}
      </section>

      {pendingUsers.length ? (
        <section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            {fr ? `${pendingUsers.length} compte(s) en attente de vérification` : `${pendingUsers.length} account(s) pending verification`}
          </p>
        </section>
      ) : null}

      <section className="mb-4 rounded-2xl border border-red-100 bg-white p-4 shadow-[0_8px_24px_rgba(220,38,38,0.08)]">
        <h3 className="text-sm font-semibold text-slate-900">{fr ? "Clé d'accès admin" : "Admin access key"}</h3>
        <form onSubmit={onCreateKey} className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-4">
          <input required value={keyLabel} onChange={(e) => setKeyLabel(e.target.value)} placeholder={fr ? "Libellé" : "Label"} className="h-10 rounded-xl border border-red-100 px-3 text-sm outline-none focus:border-red-300" />
          <select value={keyType} onChange={(e) => setKeyType(e.target.value)} className="h-10 rounded-xl border border-red-100 bg-white px-3 text-sm">
            <option value="admin_login">{fr ? "Connexion admin" : "Admin login"}</option>
          </select>
          <input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} className="h-10 rounded-xl border border-red-100 px-3 text-sm" />
          <button type="submit" className="h-10 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-700">
            {fr ? "Générer" : "Generate"}
          </button>
        </form>
        {generatedKey ? (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            {fr ? "Nouvelle clé" : "New key"}: <span className="font-mono font-bold">{generatedKey}</span>
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-red-100 bg-white p-4 shadow-[0_8px_24px_rgba(220,38,38,0.08)]">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            {fr ? "Comptes" : "Accounts"} ({rows.length})
          </h3>
          <button type="button" onClick={() => void load()} className="text-xs font-semibold text-red-700 hover:underline">
            {fr ? "Actualiser" : "Refresh"}
          </button>
        </div>
        {loading ? <p className="text-sm text-slate-500">{fr ? "Chargement..." : "Loading..."}</p> : null}
        <div className="overflow-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead>
              <tr className="border-b border-red-100 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">{fr ? "Nom" : "Name"}</th>
                <th className="px-2 py-2">Email</th>
                <th className="px-2 py-2">{fr ? "Département" : "Department"}</th>
                <th className="px-2 py-2">{fr ? "Profil" : "Profile"}</th>
                <th className="px-2 py-2">Email ✓</th>
                <th className="px-2 py-2">Tel ✓</th>
                <th className="px-2 py-2">{fr ? "Statut" : "Status"}</th>
                <th className="px-2 py-2">{fr ? "Action" : "Action"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const id = Number(row.id);
                const active = Boolean(row.is_active);
                const isUserRole = String(row.role) === "user";
                return (
                  <tr key={id} className="border-b border-red-50">
                    <td className="px-2 py-2 font-medium text-slate-800">{String(row.full_name ?? "-")}</td>
                    <td className="px-2 py-2">{String(row.email ?? "-")}</td>
                    <td className="px-2 py-2">{String(row.department ?? "-")}</td>
                    <td className="px-2 py-2">{String(row.job_profile ?? "-")}</td>
                    <td className="px-2 py-2">{Boolean(row.email_verified) ? "✓" : "—"}</td>
                    <td className="px-2 py-2">{Boolean(row.phone_verified) ? "✓" : "—"}</td>
                    <td className="px-2 py-2">{active ? (fr ? "Actif" : "Active") : fr ? "En attente" : "Pending"}</td>
                    <td className="px-2 py-2">
                      {isUserRole ? (
                        <div className="flex gap-1">
                          {!active ? (
                            <button type="button" onClick={() => void onResendOtp(id)} className="rounded-lg border border-amber-200 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50">
                              OTP
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void setUserActive(id, !active).then(() => load())}
                            className="rounded-lg border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                          >
                            {active ? (fr ? "Désactiver" : "Disable") : fr ? "Activer" : "Enable"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </PageShell>
  );
}
