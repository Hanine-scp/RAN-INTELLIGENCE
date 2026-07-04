"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { useAppContext } from "@/components/providers/app-provider";
import { t } from "@/lib/i18n";
import { formatDateTime } from "@/lib/admin-users-utils";
import { ADMIN, KPI_ACCENTS } from "@/lib/admin-theme";
import { getSecurityAudit, getSecurityCenterSummary } from "@/lib/api";
import { isAdmin } from "@/lib/auth";

type SecuritySummary = {
  failed_logins_today: number;
  security_locked_accounts: number;
  pending_otp_accounts: number;
  active_users: number;
  active_admins: number;
  total_accounts: number;
  recent_security_events: Array<{
    action: string;
    detail: string;
    created_at: string;
    user_id: number | null;
  }>;
};

type AuditRow = {
  id: number;
  user_id: number | null;
  action: string;
  detail: string;
  created_at: string;
  email?: string;
  full_name?: string;
  role?: string;
};

function actionLabel(action: string, fr: boolean): string {
  const map: Record<string, [string, string]> = {
    login_success: ["Connexion réussie", "Login success"],
    login_failed: ["Échec connexion", "Login failed"],
    login_security_required: ["Vérification sécurité", "Security verification"],
    login_security_verified: ["Identité vérifiée", "Identity verified"],
    access_denied: ["Accès refusé", "Access denied"],
    admin_user_created: ["Compte créé", "User created"],
    user_status_changed: ["Statut modifié", "Status changed"],
  };
  const item = map[action];
  return item ? (fr ? item[0] : item[1]) : action;
}

export function AdminSecurityPageContent() {
  const { user } = useAuth();
  const { filters } = useAppContext();
  const fr = filters.language === "Français";
  const [summary, setSummary] = useState<SecuritySummary | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [summaryData, auditData] = await Promise.all([getSecurityCenterSummary(), getSecurityAudit(80)]);
      setSummary(summaryData);
      setAudit(auditData);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : fr ? "Chargement impossible" : "Load failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin(user)) void load();
  }, [user]);

  const kpiItems = useMemo(
    () => [
      { label: fr ? "Échecs login (jour)" : "Failed logins (today)", value: String(summary?.failed_logins_today ?? "—") },
      { label: fr ? "Comptes verrouillés" : "Locked accounts", value: String(summary?.security_locked_accounts ?? "—") },
      { label: fr ? "En attente OTP" : "Pending OTP", value: String(summary?.pending_otp_accounts ?? "—") },
      { label: fr ? "Users actifs" : "Active users", value: String(summary?.active_users ?? "—") },
      { label: fr ? "Admins actifs" : "Active admins", value: String(summary?.active_admins ?? "—") },
    ],
    [fr, summary],
  );

  if (!isAdmin(user)) {
    return (
      <div className="rounded-xl border p-8 text-center text-sm" style={{ borderColor: `${ADMIN.red}44`, background: "#FFE8E8", color: "#C44E4E" }}>
        {fr ? "Accès réservé aux administrateurs." : "Administrator access only."}
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8" style={{ color: ADMIN.text, background: ADMIN.pageBg }}>
      <header
        className="relative overflow-hidden rounded-2xl border p-6 shadow-sm lg:p-8"
        style={{ background: ADMIN.headerGradient, borderColor: ADMIN.headerBorder }}
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-30 blur-3xl" style={{ background: ADMIN.turquoise }} />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <nav
              className="mb-3 flex gap-1 rounded-xl border p-1"
              style={{ borderColor: ADMIN.headerBorder, background: ADMIN.sectionHeaderBg }}
            >
              <Link
                href="/admin/users"
                className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-[#64748B] transition hover:bg-white hover:text-[#292F36]"
              >
                {fr ? "Responsables" : "Responsibles"}
              </Link>
              <span className="rounded-lg bg-[#4ECDC4] px-3 py-1.5 text-[11px] font-semibold text-[#292F36] shadow-sm">
                {t(filters.language, "admin_tab_security")}
              </span>
            </nav>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "#2D9A94" }}>
              {fr ? "Sécurité" : "Security"}
            </p>
            <h1 className="mt-1 text-2xl font-bold" style={{ color: ADMIN.text }}>
              {t(filters.language, "admin_tab_security")}
            </h1>
            <p className="mt-2 max-w-xl text-sm" style={{ color: ADMIN.textMuted }}>
              {fr
                ? "Surveillance connexions · verrouillages · audit · conformité read-only."
                : "Sign-in monitoring · lockouts · audit · read-only compliance."}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/admin/users"
              className="inline-flex h-9 items-center rounded-lg border bg-white px-3 text-xs font-semibold transition hover:bg-[#F7FFF7]"
              style={{ borderColor: ADMIN.borderStrong, color: ADMIN.text }}
            >
              {fr ? "Gestion users" : "Users"}
            </Link>
            <button
              type="button"
              disabled={loading}
              onClick={() => void load()}
              className="inline-flex h-9 items-center rounded-lg px-4 text-xs font-semibold text-[#292F36] hover:brightness-105 disabled:opacity-50"
              style={{ background: ADMIN.turquoise }}
            >
              {loading ? "..." : fr ? "Actualiser" : "Refresh"}
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <p className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: `${ADMIN.red}44`, background: "#FFE8E8", color: "#C44E4E" }}>
          {error}
        </p>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {kpiItems.map((item, i) => {
          const accent = KPI_ACCENTS[i % KPI_ACCENTS.length];
          return (
            <article
              key={item.label}
              className="rounded-xl border bg-white p-4 shadow-sm"
              style={{ borderColor: ADMIN.borderStrong, borderLeftWidth: 4, borderLeftColor: accent.border }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: ADMIN.textMuted }}>{item.label}</p>
              <p className="mt-2 text-2xl font-bold tabular-nums" style={{ color: accent.text }}>{item.value}</p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-4 shadow-sm" style={{ borderColor: ADMIN.borderStrong }}>
          <h2 className="text-sm font-semibold" style={{ color: ADMIN.text }}>{fr ? "Événements récents" : "Recent events"}</h2>
          <div className="mt-3 max-h-96 space-y-2 overflow-y-auto">
            {(summary?.recent_security_events ?? []).map((event, index) => (
              <div key={`${event.created_at}-${index}`} className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: ADMIN.border, background: "#F7FFF7" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold" style={{ color: ADMIN.text }}>{actionLabel(event.action, fr)}</span>
                  <span style={{ color: ADMIN.textMuted }}>{formatDateTime(event.created_at, fr)}</span>
                </div>
                {event.detail ? <p className="mt-1 break-all" style={{ color: ADMIN.textMuted }}>{event.detail}</p> : null}
              </div>
            ))}
            {!summary?.recent_security_events?.length ? (
              <p className="text-xs" style={{ color: ADMIN.textMuted }}>{fr ? "Aucun événement." : "No events."}</p>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm" style={{ borderColor: ADMIN.borderStrong }}>
          <h2 className="text-sm font-semibold" style={{ color: ADMIN.text }}>{fr ? "Journal d'audit" : "Audit trail"}</h2>
          <div className="mt-3 max-h-96 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead style={{ color: ADMIN.textMuted }}>
                <tr>
                  <th className="px-2 py-2">{fr ? "Date" : "Date"}</th>
                  <th className="px-2 py-2">{fr ? "Action" : "Action"}</th>
                  <th className="px-2 py-2">{fr ? "Compte" : "Account"}</th>
                  <th className="px-2 py-2">{fr ? "Détail" : "Detail"}</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((row) => (
                  <tr key={row.id} className="border-t" style={{ borderColor: ADMIN.border }}>
                    <td className="px-2 py-2" style={{ color: ADMIN.textMuted }}>{formatDateTime(row.created_at, fr)}</td>
                    <td className="px-2 py-2 font-medium" style={{ color: ADMIN.text }}>{actionLabel(row.action, fr)}</td>
                    <td className="px-2 py-2" style={{ color: ADMIN.text }}>{row.email || row.full_name || "—"}</td>
                    <td className="max-w-[220px] truncate px-2 py-2" style={{ color: ADMIN.textMuted }} title={row.detail}>
                      {row.detail || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="rounded-xl border p-4" style={{ borderColor: ADMIN.borderStrong, background: "#F7FFF7" }}>
        <p className="font-semibold text-xs" style={{ color: ADMIN.text }}>{fr ? "Politique active" : "Active policy"}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs" style={{ color: ADMIN.textMuted }}>
          <li>{fr ? "Users : lecture seule API (403 sur mutations)" : "Users: read-only API (403 on mutations)"}</li>
          <li>{fr ? "Permissions par profil métier (RBAC)" : "Job-profile RBAC permissions"}</li>
          <li>{fr ? "Vendor scoping côté serveur" : "Server-side vendor scoping"}</li>
          <li>{fr ? "Verrouillage après échecs login + OTP sécurité" : "Failed-login lockout + security OTP"}</li>
          <li>{fr ? "MFA admin obligatoire · OTP création compte" : "Mandatory admin MFA · account OTP provisioning"}</li>
        </ul>
      </section>
    </div>
  );
}
