"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { SortableTableHeader } from "@/components/ui/sortable-table-header";
import { useAuth } from "@/components/providers/auth-provider";
import { useAppContext } from "@/components/providers/app-provider";
import { ADMIN, KPI_ACCENTS } from "@/lib/admin-theme";
import {
  accessTypeLabel,
  computeUserStats,
  exportUsersCsv,
  filterUsers,
  formatDateTime,
  profileLabel,
  regionFromDepartment,
  REGIONS,
  resolveUserStatus,
  roleLabel,
  statusBadgeClass,
  statusLabel,
  VENDORS,
  validateStep1Form,
  normalizeAdminEmail,
  type Step1FieldErrors,
  type Step1FieldKey,
  type AuthUserRow,
  type UserAccountStatus,
  type UserFilters,
} from "@/lib/admin-users-utils";
import {
  adminCreateUser,
  adminVerifyUser,
  approveUserAccess,
  getJobProfiles,
  getNotificationsStatus,
  listAuthUsers,
  rejectUserAccess,
  resendProvisionOtp,
  setUserActive,
} from "@/lib/api";
import { isAdmin, type JobProfile } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { sortTableRows } from "@/lib/sort-table-rows";

type CreateResult = {
  user_id: number;
  email: string;
  phone: string;
  temporary_password: string;
  personal_access_key: string;
  requires_sms?: boolean;
  verification: { dev_email_code?: string; dev_phone_code?: string; requires_sms?: boolean };
};

type DrawerMode = "create" | "detail" | null;
type CreateStep = 1 | 2 | 3 | "verify" | "done";

const EMPTY_FILTERS: UserFilters = {
  query: "",
  jobProfile: "",
  role: "",
  status: "",
  department: "",
};

function UserStatusBadge({ status, fr }: { status: UserAccountStatus; fr: boolean }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-wide ${statusBadgeClass(status)}`}>
      {statusLabel(status, fr)}
    </span>
  );
}

function AdminNavTabs({ lang }: { lang: "Français" | "English" }) {
  const tabs = [
    { href: "/admin/users", label: lang === "Français" ? "Responsables" : "Responsibles", active: true },
    { href: "/admin/security", label: t(lang, "admin_tab_security"), active: false },
  ];
  return (
    <nav
      className="flex flex-wrap gap-1 rounded-xl border p-1"
      style={{ borderColor: ADMIN.headerBorder, background: ADMIN.sectionHeaderBg }}
    >
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
            tab.active
              ? "bg-[#4ECDC4] text-[#292F36] shadow-sm"
              : "text-[#64748B] hover:bg-white hover:text-[#292F36]"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

function CreateStepIndicator({ step, fr }: { step: CreateStep; fr: boolean }) {
  const steps: { id: CreateStep; label: string }[] = [
    { id: 1, label: fr ? "Informations" : "Information" },
    { id: 2, label: fr ? "Profil & accès" : "Profile & access" },
    { id: 3, label: fr ? "Sécurité" : "Security" },
    { id: "verify", label: "OTP" },
  ];
  const order = [1, 2, 3, "verify"] as CreateStep[];
  const currentIdx = step === "done" ? 4 : order.indexOf(step);

  return (
    <div className="mb-6">
      <div className="flex items-start">
        {steps.map((s, i) => {
          const done = i < currentIdx;
          const active = s.id === step || (step === "done" && i === steps.length - 1);
          return (
            <div key={String(s.id)} className="flex min-w-0 flex-1 items-start">
              <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold shadow-sm transition ${
                    done
                      ? "bg-[#4ECDC4] text-[#292F36]"
                      : active
                        ? "bg-white text-[#2D9A94] ring-2 ring-[#4ECDC4] ring-offset-2"
                        : "border bg-[#F7FFF7] text-[#94A3B8]"
                  }`}
                  style={!done && !active ? { borderColor: ADMIN.borderStrong } : undefined}
                >
                  {done ? "✓" : i + 1}
                </div>
                <span
                  className={`max-w-[4.5rem] text-[9px] font-semibold uppercase leading-tight tracking-wide sm:max-w-none ${
                    active || done ? "text-[#292F36]" : "text-[#94A3B8]"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 ? (
                <div
                  className="mx-1 mt-[18px] h-0.5 min-w-[12px] flex-1 rounded-full"
                  style={{ background: i < currentIdx ? ADMIN.turquoise : ADMIN.borderStrong }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function parseAdminErrorMessage(message: string, fr: boolean): { title: string; detail: string } {
  const apiMatch = message.match(/^API request failed:[^(]+\(\d+\)\s*[—-]\s*(.+)$/);
  if (apiMatch?.[1]?.trim()) {
    return { title: fr ? "Erreur" : "Error", detail: apiMatch[1].trim() };
  }
  const parts = message.split(" — ");
  if (parts.length > 1 && parts[1]?.trim()) {
    return { title: fr ? "Erreur" : "Error", detail: parts.slice(1).join(" — ").trim() };
  }
  return { title: fr ? "Erreur" : "Error", detail: message };
}

function AdminAlert({
  tone,
  title,
  message,
  onDismiss,
}: {
  tone: "error" | "warning" | "success" | "info";
  title: string;
  message: string;
  onDismiss?: () => void;
}) {
  const toneStyles = {
    error: {
      border: ADMIN.red,
      bg: "#FFF0F0",
      iconBg: "#FF6B6B",
      iconColor: "#FFFFFF",
      title: "#B91C1C",
      text: "#7F1D1D",
      icon: "!",
    },
    warning: {
      border: ADMIN.yellow,
      bg: "#FFFBEB",
      iconBg: "#FFE66D",
      iconColor: "#292F36",
      title: "#92400E",
      text: "#78350F",
      icon: "!",
    },
    success: {
      border: ADMIN.turquoise,
      bg: "#E8FAF8",
      iconBg: "#4ECDC4",
      iconColor: "#292F36",
      title: "#0F766E",
      text: "#115E59",
      icon: "✓",
    },
    info: {
      border: "#94C5C1",
      bg: "#F0FCFB",
      iconBg: "#4ECDC4",
      iconColor: "#292F36",
      title: "#2D9A94",
      text: "#115E59",
      icon: "i",
    },
  } as const;
  const s = toneStyles[tone];

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-start gap-3 rounded-xl border px-4 py-3 shadow-sm"
      style={{ borderColor: `${s.border}55`, borderLeftWidth: 4, borderLeftColor: s.border, background: s.bg }}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
        style={{ background: s.iconBg, color: s.iconColor }}
      >
        {s.icon}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm font-semibold" style={{ color: s.title }}>
          {title}
        </p>
        <p className="mt-0.5 text-sm leading-relaxed" style={{ color: s.text }}>
          {message}
        </p>
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fermer"
          className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold transition hover:bg-white/60"
          style={{ color: s.title }}
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}

function AdminErrorAlert({ message, fr, onDismiss }: { message: string; fr: boolean; onDismiss?: () => void }) {
  const parsed = parseAdminErrorMessage(message, fr);
  return <AdminAlert tone="error" title={parsed.title} message={parsed.detail} onDismiss={onDismiss} />;
}

function PremiumKpiRow({ items }: { items: { label: string; value: string }[] }) {
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {items.map((item, i) => {
        const accent = KPI_ACCENTS[i % KPI_ACCENTS.length];
        return (
          <article
            key={item.label}
            className="relative overflow-hidden rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md"
            style={{ borderColor: ADMIN.borderStrong, borderLeftWidth: 4, borderLeftColor: accent.border }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: ADMIN.textMuted }}>
              {item.label}
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight" style={{ color: accent.text }}>
              {item.value}
            </p>
          </article>
        );
      })}
    </section>
  );
}

function AdminModal({
  open,
  title,
  subtitle,
  onClose,
  children,
  size = "md",
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const widthClass = size === "lg" ? "w-[min(680px,94vw)]" : "w-[min(560px,94vw)]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-[3px]"
      style={{ background: ADMIN.overlay }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`relative flex max-h-[min(90vh,860px)] ${widthClass} flex-col overflow-hidden rounded-2xl border bg-white shadow-[0_24px_64px_rgba(78,205,196,0.16),0_8px_24px_rgba(41,47,54,0.08)]`}
        style={{ borderColor: ADMIN.borderStrong }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${ADMIN.turquoise}, ${ADMIN.yellow})` }} />
        <header
          className="shrink-0 border-b px-6 py-5"
          style={{ background: ADMIN.headerGradient, borderColor: ADMIN.headerBorder }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "#2D9A94" }}>
                Administration
              </p>
              <h2 className="mt-1 text-lg font-bold tracking-tight sm:text-xl" style={{ color: ADMIN.text }}>
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-1 text-sm" style={{ color: ADMIN.textMuted }}>
                  {subtitle}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={title}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-white text-sm font-semibold transition hover:bg-[#F7FFF7]"
              style={{ borderColor: ADMIN.borderStrong, color: ADMIN.textMuted }}
            >
              ✕
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5" style={{ background: "#F7FFF7" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function PremiumFormCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm sm:p-6 ${className}`}
      style={{ borderColor: ADMIN.borderStrong, boxShadow: "0 4px 24px rgba(78,205,196,0.06)" }}
    >
      {children}
    </div>
  );
}

function PremiumFormFooter({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mt-6 flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end"
      style={{ borderColor: ADMIN.border }}
    >
      {children}
    </div>
  );
}

function PremiumToggle({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  description?: string;
}) {
  return (
    <label
      className="flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition hover:bg-[#F7FFF7]"
      style={{
        borderColor: checked ? ADMIN.turquoise : ADMIN.borderStrong,
        background: checked ? "#E8FAF8" : "#FFFFFF",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[#4ECDC4]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold" style={{ color: ADMIN.text }}>
          {title}
        </span>
        {description ? (
          <span className="mt-0.5 block text-xs leading-relaxed" style={{ color: ADMIN.textMuted }}>
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <span className="mb-1.5 flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold tracking-wide" style={{ color: ADMIN.text }}>
        {children}
      </span>
      {hint ? (
        <span className="text-[10px] font-normal" style={{ color: ADMIN.textMuted }}>
          {hint}
        </span>
      ) : null}
    </span>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed" style={{ color: "#C44E4E" }} role="alert">
      <span aria-hidden className="mt-0.5 shrink-0 font-bold">!</span>
      <span>{message}</span>
    </p>
  );
}

function FieldInput({
  error,
  className,
  disabled,
  readOnly,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  return (
    <input
      {...props}
      disabled={disabled}
      readOnly={readOnly}
      aria-invalid={Boolean(error)}
      className={`h-11 w-full rounded-xl border px-3.5 text-sm outline-none transition placeholder:text-[#94A3B8] focus:ring-2 disabled:cursor-not-allowed disabled:opacity-70 ${className ?? ""}`}
      style={{
        borderColor: error ? `${ADMIN.red}88` : ADMIN.borderStrong,
        color: ADMIN.text,
        background: disabled || readOnly ? "#F7FFF7" : error ? "#FFF8F8" : "#FFFFFF",
      }}
      onFocus={(e) => {
        if (disabled || readOnly) return;
        e.currentTarget.style.borderColor = error ? ADMIN.red : ADMIN.turquoise;
        e.currentTarget.style.boxShadow = error ? `0 0 0 3px ${ADMIN.red}33` : `0 0 0 3px ${ADMIN.turquoise}33`;
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = error ? `${ADMIN.red}88` : ADMIN.borderStrong;
        e.currentTarget.style.boxShadow = "none";
        props.onBlur?.(e);
      }}
    />
  );
}

function FieldSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-11 w-full rounded-xl border bg-white px-3.5 text-sm outline-none transition focus:ring-2 ${props.className ?? ""}`}
      style={{ borderColor: ADMIN.borderStrong, color: ADMIN.text }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = ADMIN.turquoise;
        e.currentTarget.style.boxShadow = `0 0 0 3px ${ADMIN.turquoise}33`;
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = ADMIN.borderStrong;
        e.currentTarget.style.boxShadow = "none";
        props.onBlur?.(e);
      }}
    />
  );
}

function FormField({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <label className={`block ${className}`}>{children}</label>;
}

function BtnPrimary({ children, className = "", type = "button", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      {...props}
      className={`inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-[#292F36] shadow-sm transition hover:brightness-105 disabled:opacity-50 ${className}`}
      style={{ background: ADMIN.turquoise }}
    >
      {children}
    </button>
  );
}

function BtnSecondary({ children, className = "", type = "button", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      {...props}
      className={`inline-flex h-11 items-center justify-center rounded-xl border bg-white px-5 text-sm font-semibold transition hover:bg-[#F7FFF7] disabled:opacity-50 ${className}`}
      style={{ borderColor: ADMIN.borderStrong, color: ADMIN.text }}
    >
      {children}
    </button>
  );
}

export function AdminUsersPageContent() {
  const { user } = useAuth();
  const { filters } = useAppContext();
  const fr = filters.language === "Français";

  const [rows, setRows] = useState<AuthUserRow[]>([]);
  const [profiles, setProfiles] = useState<JobProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [devHint, setDevHint] = useState("");
  const [otpDeliveryMessage, setOtpDeliveryMessage] = useState("");
  const [accessActionMessage, setAccessActionMessage] = useState("");
  const [emailNotificationsReady, setEmailNotificationsReady] = useState<boolean | null>(null);
  const [userFilters, setUserFilters] = useState<UserFilters>(EMPTY_FILTERS);
  const [sortColumn, setSortColumn] = useState<string | null>("full_name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [selectedUser, setSelectedUser] = useState<AuthUserRow | null>(null);
  const [createStep, setCreateStep] = useState<CreateStep>(1);
  const [createResult, setCreateResult] = useState<CreateResult | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [jobProfile, setJobProfile] = useState("");
  const [region, setRegion] = useState<string>("National");
  const [vendor, setVendor] = useState<string>("Tous");
  const [password, setPassword] = useState("");
  const [sendEmailOtp, setSendEmailOtp] = useState(true);
  const [sendSmsOtp, setSendSmsOtp] = useState(true);
  const [forcePasswordChange, setForcePasswordChange] = useState(true);
  const [confirmData, setConfirmData] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [step1Errors, setStep1Errors] = useState<Step1FieldErrors>({});

  const filteredRows = useMemo(() => filterUsers(rows, userFilters), [rows, userFilters]);
  const sortedRows = useMemo(() => sortTableRows(filteredRows, sortColumn, sortDirection), [filteredRows, sortColumn, sortDirection]);
  const stats = useMemo(() => computeUserStats(rows, fr), [rows, fr]);

  const kpiItems = useMemo(
    () => [
      { label: fr ? "Total responsables" : "Total responsibles", value: String(stats.total) },
      { label: fr ? "Responsables actifs" : "Active responsibles", value: String(stats.active) },
      { label: fr ? "En attente OTP" : "Pending OTP", value: String(stats.pendingOtp) },
      { label: fr ? "Demandes d'accès" : "Access requests", value: String(stats.pendingAccess) },
      { label: fr ? "Comptes inactifs" : "Inactive accounts", value: String(stats.inactive) },
      { label: fr ? "Dernière création" : "Last created", value: stats.lastCreated },
    ],
    [fr, stats],
  );

  const load = async () => {
    setLoading(true);
    try {
      const [users, jobProfiles] = await Promise.all([listAuthUsers(), getJobProfiles()]);
      setRows(users);
      setProfiles(jobProfiles);
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

  useEffect(() => {
    if (!isAdmin(user)) return;
    getNotificationsStatus()
      .then((status) => setEmailNotificationsReady(status.email_otp_ready ?? status.email_ready))
      .catch(() => setEmailNotificationsReady(null));
  }, [user]);

  const resetCreateFlow = () => {
    setCreateStep(1);
    setCreateResult(null);
    setEmailCode("");
    setPhoneCode("");
    setFullName("");
    setEmail("");
    setPhone("");
    setDepartment("");
    setEmployeeId("");
    setJobProfile("");
    setRegion("National");
    setVendor("Tous");
    setPassword("");
    setConfirmData(false);
    setDevHint("");
    setOtpDeliveryMessage("");
    setStep1Errors({});
  };

  const clearStep1Error = (field: Step1FieldKey) => {
    setStep1Errors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleStep1Next = () => {
    const existingEmails = rows.map((row) => normalizeAdminEmail(String(row.email ?? "")));
    const errors = validateStep1Form(
      { fullName, email, phone, employeeId, department },
      { fr, existingEmails },
    );
    setStep1Errors(errors);
    if (Object.keys(errors).length > 0) return;
    setError("");
    setCreateStep(2);
  };

  const openCreateDrawer = () => {
    resetCreateFlow();
    setError("");
    setDrawerMode("create");
  };

  const openDetailDrawer = (row: AuthUserRow) => {
    setError("");
    setSelectedUser(row);
    setDrawerMode("detail");
  };

  const closeDrawer = () => {
    setDrawerMode(null);
    setSelectedUser(null);
  };

  const onCreateUser = async () => {
    if (!confirmData) {
      setError(fr ? "Confirmez l'exactitude des données avant de créer le compte." : "Confirm data accuracy before creating the account.");
      return;
    }
    if (password.trim().length > 0 && password.trim().length < 10) {
      setError(fr ? "Le mot de passe doit contenir au moins 10 caractères." : "Password must be at least 10 characters.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const departmentWithMeta = [department.trim(), region !== "National" ? region : "", vendor !== "Tous" ? vendor : ""]
        .filter(Boolean)
        .join(" · ");
      const allowedVendors = vendor === "Tous" ? "nokia,huawei" : vendor.toLowerCase();
      const data = await adminCreateUser({
        full_name: fullName,
        email,
        phone,
        job_profile: jobProfile,
        department: departmentWithMeta || department,
        employee_id: employeeId,
        password: password || undefined,
        send_email_otp: sendEmailOtp,
        send_sms_otp: sendSmsOtp,
        force_password_change: forcePasswordChange,
        allowed_regions: region,
        allowed_vendors: allowedVendors,
      });
      setCreateResult({
        ...data,
        requires_sms: data.verification.requires_sms ?? sendSmsOtp,
      });
      setCreateStep("verify");
      setOtpDeliveryMessage(data.message || "");
      const hints = [data.verification.dev_email_code, data.verification.dev_phone_code].filter(Boolean).join(" / ");
      setDevHint(hints ? `${fr ? "Codes dev (secours)" : "Fallback dev codes"}: ${hints}` : "");
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : fr ? "Création échouée" : "Create failed");
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
      setCreateStep("done");
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : fr ? "Vérification échouée" : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const onResendOtp = async (userId: number) => {
    try {
      const data = await resendProvisionOtp(userId);
      setOtpDeliveryMessage(data.message || (fr ? "OTP renvoyé." : "OTP resent."));
      const hints = [data.verification.dev_email_code, data.verification.dev_phone_code].filter(Boolean).join(" / ");
      setDevHint(hints ? `${fr ? "Codes dev (secours)" : "Fallback dev codes"}: ${hints}` : "");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : fr ? "Renvoi OTP échoué" : "Resend OTP failed");
    }
  };

  const onToggleActive = async (userId: number, active: boolean) => {
    try {
      await setUserActive(userId, active);
      await load();
      if (selectedUser && Number(selectedUser.id) === userId) {
        setSelectedUser((prev) => (prev ? { ...prev, is_active: active } : prev));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : fr ? "Mise à jour échouée" : "Update failed");
    }
  };

  const onApproveAccess = async (userId: number) => {
    setLoading(true);
    setError("");
    setAccessActionMessage("");
    try {
      const data = await approveUserAccess(userId);
      await load();
      setAccessActionMessage(
        data.message ||
          (fr
            ? "Demande acceptée — email de confirmation envoyé à l'utilisateur."
            : "Request approved — confirmation email sent to the user."),
      );
      if (selectedUser && Number(selectedUser.id) === userId) {
        closeDrawer();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : fr ? "Approbation échouée" : "Approval failed");
    } finally {
      setLoading(false);
    }
  };

  const onRejectAccess = async (userId: number) => {
    if (!window.confirm(fr ? "Refuser cette demande d'accès ?" : "Reject this access request?")) return;
    setLoading(true);
    setError("");
    setAccessActionMessage("");
    try {
      const data = await rejectUserAccess(userId);
      await load();
      setAccessActionMessage(data.message || (fr ? "Demande refusée." : "Request rejected."));
      if (selectedUser && Number(selectedUser.id) === userId) {
        closeDrawer();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : fr ? "Refus échoué" : "Rejection failed");
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin(user)) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: `${ADMIN.red}44`, background: "#FFE8E8", color: "#C44E4E" }}>
        {fr ? "Accès réservé aux administrateurs." : "Administrators only."}
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8" style={{ color: ADMIN.text, background: ADMIN.pageBg }}>
      {/* Hero header */}
      <header
        className="relative overflow-hidden rounded-2xl border p-6 shadow-sm lg:p-8"
        style={{ background: ADMIN.headerGradient, borderColor: ADMIN.headerBorder }}
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-30 blur-3xl" style={{ background: ADMIN.turquoise }} />
        <div className="pointer-events-none absolute -bottom-8 left-1/3 h-32 w-32 rounded-full opacity-20 blur-2xl" style={{ background: ADMIN.yellow }} />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <AdminNavTabs lang={filters.language} />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "#2D9A94" }}>
                Administration plateforme
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight lg:text-3xl" style={{ color: ADMIN.text }}>
                {fr ? "Gestion des utilisateurs" : "User management"}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed" style={{ color: ADMIN.textMuted }}>
                {fr
                  ? "Provisionnement sécurisé · accès lecture seule · périmètre vendor & région · OTP & audit."
                  : "Secure provisioning · read-only access · vendor & region scope · OTP & audit."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <BtnSecondary type="button" onClick={() => exportUsersCsv(sortedRows, profiles, fr)}>
              {fr ? "Exporter CSV" : "Export CSV"}
            </BtnSecondary>
            <BtnPrimary onClick={openCreateDrawer}>+ {fr ? "Nouvel utilisateur" : "New user"}</BtnPrimary>
          </div>
        </div>
      </header>

      {error && !drawerMode ? (
        <AdminErrorAlert message={error} fr={fr} onDismiss={() => setError("")} />
      ) : null}
      {accessActionMessage && !drawerMode ? (
        <AdminAlert
          tone="success"
          title={fr ? "Demande traitée" : "Request processed"}
          message={accessActionMessage}
          onDismiss={() => setAccessActionMessage("")}
        />
      ) : null}
      {devHint && !drawerMode ? (
        <AdminAlert
          tone="info"
          title={fr ? "Mode développement" : "Development mode"}
          message={devHint}
          onDismiss={() => setDevHint("")}
        />
      ) : null}

      <PremiumKpiRow items={kpiItems} />

      {/* Filtres */}
      <section className="rounded-xl border bg-white p-4 shadow-sm" style={{ borderColor: ADMIN.borderStrong }}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: ADMIN.textMuted }}>
            {fr ? "Filtres & recherche" : "Filters & search"}
          </h2>
          <button
            type="button"
            onClick={() => setUserFilters(EMPTY_FILTERS)}
            className="text-[11px] font-semibold hover:underline"
            style={{ color: ADMIN.turquoise }}
          >
            {fr ? "Réinitialiser" : "Reset"}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="sm:col-span-2">
            <FieldLabel>{fr ? "Rechercher nom / email" : "Search name / email"}</FieldLabel>
            <FieldInput
              value={userFilters.query}
              onChange={(e) => setUserFilters((prev) => ({ ...prev, query: e.target.value }))}
              placeholder={fr ? "Rechercher un utilisateur..." : "Search a user..."}
            />
          </label>
          <label>
            <FieldLabel>{fr ? "Profil métier" : "Job profile"}</FieldLabel>
            <FieldSelect value={userFilters.jobProfile} onChange={(e) => setUserFilters((prev) => ({ ...prev, jobProfile: e.target.value }))}>
              <option value="">{fr ? "Tous" : "All"}</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{fr ? profile.fr : profile.en}</option>
              ))}
            </FieldSelect>
          </label>
          <label>
            <FieldLabel>{fr ? "Rôle" : "Role"}</FieldLabel>
            <FieldSelect value={userFilters.role} onChange={(e) => setUserFilters((prev) => ({ ...prev, role: e.target.value }))}>
              <option value="">{fr ? "Tous" : "All"}</option>
              <option value="admin">{fr ? "Administrateur" : "Administrator"}</option>
              <option value="responsable">{fr ? "Responsable" : "Responsible"}</option>
            </FieldSelect>
          </label>
          <label>
            <FieldLabel>{fr ? "Statut" : "Status"}</FieldLabel>
            <FieldSelect value={userFilters.status} onChange={(e) => setUserFilters((prev) => ({ ...prev, status: e.target.value }))}>
              <option value="">{fr ? "Tous" : "All"}</option>
              <option value="active">{fr ? "Actif" : "Active"}</option>
              <option value="pending_otp">{fr ? "En attente OTP" : "Pending OTP"}</option>
              <option value="pending_access">{fr ? "Demande d'accès" : "Access request"}</option>
              <option value="inactive">{fr ? "Inactif" : "Inactive"}</option>
            </FieldSelect>
          </label>
        </div>
      </section>

      {/* Tableau */}
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm" style={{ borderColor: ADMIN.borderStrong }}>
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background: ADMIN.sectionHeaderBg, borderBottom: `2px solid ${ADMIN.turquoise}` }}
        >
          <h2 className="text-sm font-semibold" style={{ color: ADMIN.text }}>
            {fr ? "Responsables" : "Responsibles"}
            <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: ADMIN.turquoise, color: "#FFFFFF" }}>
              {sortedRows.length}
            </span>
          </h2>
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs font-semibold hover:underline"
            style={{ color: "#2D9A94" }}
          >
            {loading ? "..." : fr ? "Actualiser" : "Refresh"}
          </button>
        </div>
        {loading ? (
          <p className="px-4 py-8 text-center text-sm" style={{ color: ADMIN.textMuted }}>
            {fr ? "Chargement..." : "Loading..."}
          </p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead>
              <tr className="border-b text-[10px] uppercase tracking-wider" style={{ borderColor: ADMIN.borderStrong, background: "#F7FFF7", color: ADMIN.textMuted }}>
                <SortableTableHeader label={fr ? "Responsable" : "Responsible"} column="full_name" sortColumn={sortColumn} sortDirection={sortDirection} onSort={(c, d) => { setSortColumn(c); setSortDirection(d); }} />
                <SortableTableHeader label={fr ? "Profil métier" : "Job profile"} column="job_profile" sortColumn={sortColumn} sortDirection={sortDirection} onSort={(c, d) => { setSortColumn(c); setSortDirection(d); }} />
                <SortableTableHeader label={fr ? "Rôle" : "Role"} column="role" sortColumn={sortColumn} sortDirection={sortDirection} onSort={(c, d) => { setSortColumn(c); setSortDirection(d); }} />
                <SortableTableHeader label={fr ? "Département" : "Department"} column="department" sortColumn={sortColumn} sortDirection={sortDirection} onSort={(c, d) => { setSortColumn(c); setSortDirection(d); }} />
                <th className="px-3 py-2">{fr ? "Région" : "Region"}</th>
                <th className="px-3 py-2">{fr ? "Accès" : "Access"}</th>
                <SortableTableHeader label={fr ? "Statut" : "Status"} column="is_active" sortColumn={sortColumn} sortDirection={sortDirection} onSort={(c, d) => { setSortColumn(c); setSortDirection(d); }} />
                <SortableTableHeader label={fr ? "Dernière connexion" : "Last login"} column="last_login_at" sortColumn={sortColumn} sortDirection={sortDirection} onSort={(c, d) => { setSortColumn(c); setSortDirection(d); }} />
                <th className="px-3 py-2">{fr ? "Actions" : "Actions"}</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const id = Number(row.id);
                const status = resolveUserStatus(row);
                const role = String(row.role ?? "");
                const isUserRole = role === "responsable";
                const active = Boolean(row.is_active);
                return (
                  <tr key={id} className="border-b transition hover:bg-[#F7FFF7]/80" style={{ borderColor: ADMIN.border }}>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                          style={{
                            background: role === "admin" ? "#FFF9E0" : "#E8FAF8",
                            color: role === "admin" ? "#8A7200" : "#2D9A94",
                          }}
                        >
                          {String(row.full_name ?? "?").charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <p className="font-semibold" style={{ color: ADMIN.text }}>{String(row.full_name ?? "—")}</p>
                          <p className="text-[11px]" style={{ color: ADMIN.textMuted }}>{String(row.email ?? "—")}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3" style={{ color: ADMIN.text }}>{profileLabel(String(row.job_profile ?? ""), profiles, fr)}</td>
                    <td className="px-3 py-3">
                      <span
                        className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                        style={
                          role === "admin"
                            ? { background: "#FFF9E0", color: "#8A7200" }
                            : { background: "#E8FAF8", color: "#2D9A94" }
                        }
                      >
                        {roleLabel(role, fr)}
                      </span>
                    </td>
                    <td className="px-3 py-3" style={{ color: ADMIN.textMuted }}>{String(row.department ?? "—")}</td>
                    <td className="px-3 py-3" style={{ color: ADMIN.textMuted }}>{regionFromDepartment(String(row.department ?? ""))}</td>
                    <td className="px-3 py-3">
                      <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium" style={{ borderColor: ADMIN.borderStrong, color: ADMIN.textMuted }}>
                        {accessTypeLabel(role, fr)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <UserStatusBadge status={status} fr={fr} />
                    </td>
                    <td className="px-3 py-3" style={{ color: ADMIN.textMuted }}>{formatDateTime(row.last_login_at, fr)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        <button type="button" onClick={() => openDetailDrawer(row)} className="rounded-md border px-2 py-1 text-[10px] font-semibold transition hover:bg-[#E8FAF8]" style={{ borderColor: ADMIN.turquoise, color: "#2D9A94" }}>
                          {fr ? "Voir" : "View"}
                        </button>
                        {isUserRole && status === "pending_access" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void onApproveAccess(id)}
                              className="rounded-md border px-2 py-1 text-[10px] font-semibold transition hover:bg-[#E8FAF8]"
                              style={{ borderColor: ADMIN.turquoise, color: "#2D9A94" }}
                            >
                              {fr ? "Accepter" : "Approve"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void onRejectAccess(id)}
                              className="rounded-md border px-2 py-1 text-[10px] font-semibold transition hover:bg-[#FFE8E8]"
                              style={{ borderColor: `${ADMIN.red}44`, color: "#C44E4E" }}
                            >
                              {fr ? "Refuser" : "Reject"}
                            </button>
                          </>
                        ) : null}
                        {isUserRole && status === "pending_otp" ? (
                          <button type="button" onClick={() => void onResendOtp(id)} className="rounded-md border px-2 py-1 text-[10px] font-semibold" style={{ borderColor: `${ADMIN.yellow}88`, background: "#FFF9E0", color: "#8A7200" }}>
                            OTP
                          </button>
                        ) : null}
                        {isUserRole && status !== "pending_access" ? (
                          <button
                            type="button"
                            onClick={() => void onToggleActive(id, !active)}
                            className="rounded-md border px-2 py-1 text-[10px] font-semibold transition hover:bg-[#FFE8E8]"
                            style={{ borderColor: `${ADMIN.red}44`, color: "#C44E4E" }}
                          >
                            {active ? (fr ? "Désactiver" : "Disable") : fr ? "Activer" : "Enable"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Politique active */}
      <section
        className="rounded-xl border p-4"
        style={{ borderColor: ADMIN.borderStrong, background: "linear-gradient(135deg, #F7FFF7 0%, #E8FAF8 100%)" }}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: ADMIN.turquoise }}>
          {fr ? "Politique de sécurité active" : "Active security policy"}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            fr ? "Read-only API (403 mutations)" : "Read-only API (403 mutations)",
            fr ? "RBAC par profil métier" : "Job-profile RBAC",
            fr ? "Scope vendor serveur" : "Server vendor scope",
            fr ? "OTP · verrouillage login · audit" : "OTP · login lock · audit",
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 text-xs" style={{ color: ADMIN.text }}>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: ADMIN.turquoise, color: ADMIN.gunmetal }}>
                ✓
              </span>
              {item}
            </div>
          ))}
        </div>
      </section>

      <AdminModal
        open={drawerMode === "create"}
        onClose={closeDrawer}
        size="lg"
        title={fr ? "Ajouter un utilisateur" : "Add user"}
        subtitle={
          createStep === 1
            ? fr ? "Étape 1 · Informations générales" : "Step 1 · General information"
            : createStep === 2
              ? fr ? "Étape 2 · Profil et accès" : "Step 2 · Profile & access"
              : createStep === 3
                ? fr ? "Étape 3 · Sécurité" : "Step 3 · Security"
                : createStep === "verify"
                  ? fr ? "Vérification email & SMS" : "Email & SMS verification"
                  : fr ? "Compte créé" : "Account created"
        }
      >
        {error ? (
          <div className="mb-4">
            <AdminErrorAlert message={error} fr={fr} onDismiss={() => setError("")} />
          </div>
        ) : null}
        {devHint && drawerMode === "create" ? (
          <div className="mb-4">
            <AdminAlert tone="info" title={fr ? "Mode développement" : "Development mode"} message={devHint} onDismiss={() => setDevHint("")} />
          </div>
        ) : null}
        {createStep !== "done" && createStep !== "verify" && typeof createStep === "number" ? (
          <CreateStepIndicator step={createStep} fr={fr} />
        ) : createStep === "verify" ? (
          <CreateStepIndicator step="verify" fr={fr} />
        ) : null}
        {createStep === 1 ? (
          <PremiumFormCard>
            <p
              className="mb-5 rounded-xl border px-4 py-3 text-sm leading-relaxed"
              style={{ borderColor: ADMIN.borderStrong, background: "#F0FCFB", color: ADMIN.textMuted }}
            >
              {fr
                ? "Renseignez les informations principales de l'utilisateur. Ces données seront utilisées pour créer son identité sur la plateforme et envoyer les codes de validation OTP par email et SMS."
                : "Enter the user's core details. This information creates their platform identity and enables OTP validation codes via email and SMS."}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField className="sm:col-span-2">
                <FieldLabel>{fr ? "Nom complet" : "Full name"}</FieldLabel>
                <FieldInput
                  required
                  autoFocus
                  value={fullName}
                  error={step1Errors.fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    clearStep1Error("fullName");
                  }}
                  placeholder={fr ? "Prénom et nom" : "First and last name"}
                />
                <FieldError message={step1Errors.fullName} />
              </FormField>
              <FormField>
                <FieldLabel>{fr ? "Email professionnel" : "Work email"}</FieldLabel>
                <FieldInput
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  error={step1Errors.email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearStep1Error("email");
                  }}
                  placeholder="prenom.nom@ooredoo.ran"
                />
                <FieldError message={step1Errors.email} />
              </FormField>
              <FormField>
                <FieldLabel hint={fr ? "Format international recommandé (+216…)" : "International format recommended (+216…)"}>
                  {fr ? "Numéro de téléphone" : "Phone number"}
                </FieldLabel>
                <FieldInput
                  required
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  error={step1Errors.phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    clearStep1Error("phone");
                  }}
                  placeholder="+216..."
                />
                <FieldError message={step1Errors.phone} />
              </FormField>
              <FormField>
                <FieldLabel hint={fr ? "Optionnel — identifiant RH interne" : "Optional — internal HR identifier"}>
                  {fr ? "Matricule interne" : "Employee ID"}
                </FieldLabel>
                <FieldInput
                  value={employeeId}
                  error={step1Errors.employeeId}
                  onChange={(e) => {
                    setEmployeeId(e.target.value);
                    clearStep1Error("employeeId");
                  }}
                  placeholder={fr ? "Ex. EMP-1024" : "E.g. EMP-1024"}
                />
                <FieldError message={step1Errors.employeeId} />
              </FormField>
              <FormField>
                <FieldLabel>{fr ? "Département / Équipe" : "Department / Team"}</FieldLabel>
                <FieldInput
                  required
                  value={department}
                  error={step1Errors.department}
                  onChange={(e) => {
                    setDepartment(e.target.value);
                    clearStep1Error("department");
                  }}
                  placeholder="RAN, BI, Performance, NOC..."
                />
                <FieldError message={step1Errors.department} />
              </FormField>
            </div>
            <div
              className="mt-6 flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:items-center sm:justify-between"
              style={{ borderColor: ADMIN.border }}
            >
              <BtnSecondary type="button" onClick={closeDrawer} className="w-full sm:w-auto">
                {fr ? "Annuler" : "Cancel"}
              </BtnSecondary>
              <BtnPrimary type="button" onClick={handleStep1Next} className="w-full sm:w-auto sm:min-w-[160px]">
                {fr ? "Suivant" : "Next"}
              </BtnPrimary>
            </div>
          </PremiumFormCard>
        ) : null}

        {createStep === 2 ? (
          <PremiumFormCard>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField className="sm:col-span-2">
                <FieldLabel>{fr ? "Rôle plateforme" : "Platform role"}</FieldLabel>
                <FieldInput value={fr ? "Responsable (lecture seule)" : "Responsible (read-only)"} readOnly disabled />
              </FormField>
              <FormField>
                <FieldLabel>{fr ? "Profil métier" : "Job profile"}</FieldLabel>
                <FieldSelect required value={jobProfile} onChange={(e) => setJobProfile(e.target.value)}>
                  <option value="">{fr ? "Sélectionner..." : "Select..."}</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>{fr ? profile.fr : profile.en}</option>
                  ))}
                </FieldSelect>
              </FormField>
              <FormField>
                <FieldLabel>{fr ? "Région d'accès" : "Access region"}</FieldLabel>
                <FieldSelect value={region} onChange={(e) => setRegion(e.target.value)}>
                  {REGIONS.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </FieldSelect>
              </FormField>
              <FormField>
                <FieldLabel>Vendor</FieldLabel>
                <FieldSelect value={vendor} onChange={(e) => setVendor(e.target.value)}>
                  {VENDORS.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </FieldSelect>
              </FormField>
              <FormField>
                <FieldLabel>{fr ? "Type d'accès" : "Access type"}</FieldLabel>
                <FieldInput value={fr ? "Lecture seule" : "Read-only"} readOnly disabled />
              </FormField>
            </div>
            <PremiumFormFooter>
              <BtnSecondary type="button" onClick={() => setCreateStep(1)} className="w-full sm:w-auto">
                {fr ? "Retour" : "Back"}
              </BtnSecondary>
              <BtnPrimary type="button" onClick={() => setCreateStep(3)} className="w-full sm:w-auto sm:min-w-[160px]">
                {fr ? "Continuer" : "Continue"}
              </BtnPrimary>
            </PremiumFormFooter>
          </PremiumFormCard>
        ) : null}

        {createStep === 3 ? (
          <PremiumFormCard>
            <div className="space-y-4">
              {sendEmailOtp && emailNotificationsReady === false ? (
                <AdminAlert
                  tone="warning"
                  title={fr ? "OTP email non configuré" : "Email OTP not configured"}
                  message={
                    fr
                      ? "Remplissez MAILTRAP_API_TOKEN / SMTP_PASS dans .env.auth (Mailtrap Live) — voir docs/AUTH_NOTIFICATIONS_SETUP.md."
                      : "Set MAILTRAP_API_TOKEN / SMTP_PASS in .env.auth (Mailtrap Live) — see docs/AUTH_NOTIFICATIONS_SETUP.md."
                  }
                />
              ) : null}
              <FormField>
                <FieldLabel hint={fr ? "Généré automatiquement si laissé vide" : "Auto-generated if left empty"}>
                  {fr ? "Mot de passe initial" : "Initial password"}
                </FieldLabel>
                <FieldInput type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} placeholder="••••••••••" />
              </FormField>
              <div className="grid gap-2 sm:grid-cols-2">
                <PremiumToggle
                  checked={sendEmailOtp}
                  onChange={setSendEmailOtp}
                  title={fr ? "OTP par email" : "Email OTP"}
                  description={fr ? "Code de vérification envoyé à l'adresse professionnelle" : "Verification code sent to work email"}
                />
                <PremiumToggle
                  checked={sendSmsOtp}
                  onChange={setSendSmsOtp}
                  title={fr ? "OTP par SMS" : "SMS OTP"}
                  description={fr ? "Code de vérification envoyé au mobile" : "Verification code sent to mobile"}
                />
                <PremiumToggle
                  checked={forcePasswordChange}
                  onChange={setForcePasswordChange}
                  title={fr ? "Changement obligatoire" : "Mandatory change"}
                  description={fr ? "Forcer le changement à la première connexion" : "Force change on first login"}
                />
              </div>
              <PremiumToggle
                checked={confirmData}
                onChange={setConfirmData}
                title={fr ? "Confirmation administrateur" : "Administrator confirmation"}
                description={
                  fr
                    ? "Je confirme l'exactitude des données et l'autorisation d'accès à la plateforme interne."
                    : "I confirm data accuracy and authorization to access the internal platform."
                }
              />
            </div>
            <PremiumFormFooter>
              <BtnSecondary type="button" onClick={() => setCreateStep(2)} className="w-full sm:w-auto">
                {fr ? "Retour" : "Back"}
              </BtnSecondary>
              <BtnPrimary type="button" disabled={loading || !confirmData} onClick={() => void onCreateUser()} className="w-full sm:w-auto sm:min-w-[180px]">
                {loading ? (fr ? "Création..." : "Creating...") : fr ? "Créer & envoyer OTP" : "Create & send OTP"}
              </BtnPrimary>
            </PremiumFormFooter>
          </PremiumFormCard>
        ) : null}

        {createStep === "verify" && createResult ? (
          <form onSubmit={onVerifyUser}>
            <PremiumFormCard>
              {otpDeliveryMessage ? (
                <div className="mb-4">
                  <AdminAlert tone="success" title={fr ? "OTP envoyé" : "OTP sent"} message={otpDeliveryMessage} />
                </div>
              ) : null}
              <div
                className="rounded-xl border px-4 py-3 text-xs leading-relaxed"
                style={{ borderColor: ADMIN.borderStrong, background: "#F7FFF7", color: ADMIN.text }}
              >
                <p className="grid gap-2 sm:grid-cols-2">
                  <span><span className="font-semibold">Email:</span> {createResult.email}</span>
                  <span><span className="font-semibold">{fr ? "Téléphone" : "Phone"}:</span> {createResult.phone}</span>
                </p>
                <p className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2" style={{ borderColor: ADMIN.border }}>
                  <span><span className="font-semibold">{fr ? "Mot de passe temporaire" : "Temporary password"}:</span> <span className="font-mono">{createResult.temporary_password}</span></span>
                  <span><span className="font-semibold">{fr ? "Clé d'accès personnelle" : "Personal access key"}:</span> <span className="font-mono">{createResult.personal_access_key}</span></span>
                </p>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <FormField>
                  <FieldLabel hint={fr ? `Consultez la boîte mail ${createResult.email}` : `Check inbox ${createResult.email}`}>
                    {fr ? "Code vérification email" : "Email verification code"}
                  </FieldLabel>
                  <FieldInput
                    required={sendEmailOtp}
                    inputMode="text"
                    autoComplete="one-time-code"
                    value={emailCode}
                    onChange={(e) => setEmailCode(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6))}
                    placeholder="ABC123"
                    maxLength={6}
                    className="text-center font-mono tracking-[0.35em]"
                  />
                </FormField>
                {createResult.requires_sms !== false ? (
                  <FormField>
                    <FieldLabel>{fr ? "Code vérification téléphone" : "Phone verification code"}</FieldLabel>
                    <FieldInput required value={phoneCode} onChange={(e) => setPhoneCode(e.target.value)} placeholder="000000" className="text-center font-mono tracking-[0.2em]" />
                  </FormField>
                ) : null}
              </div>
              <PremiumFormFooter>
                <BtnSecondary type="button" onClick={() => void onResendOtp(createResult.user_id)} className="w-full sm:w-auto">
                  {fr ? "Renvoyer OTP" : "Resend OTP"}
                </BtnSecondary>
                <BtnPrimary type="submit" disabled={loading} className="w-full sm:w-auto sm:min-w-[180px]">
                  {fr ? "Valider & activer" : "Validate & activate"}
                </BtnPrimary>
              </PremiumFormFooter>
            </PremiumFormCard>
          </form>
        ) : null}

        {createStep === "done" ? (
          <PremiumFormCard>
            <div className="flex flex-col items-center py-4 text-center">
              <div
                className="mb-4 flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold shadow-sm"
                style={{ background: "#E8FAF8", color: "#2D9A94" }}
              >
                ✓
              </div>
              <p className="text-sm font-semibold" style={{ color: ADMIN.text }}>
                {fr ? "Compte activé avec succès" : "Account activated successfully"}
              </p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed" style={{ color: ADMIN.textMuted }}>
                {fr ? "L'utilisateur peut se connecter sur /login avec ses identifiants." : "The user can sign in at /login with their credentials."}
              </p>
            </div>
            <PremiumFormFooter>
              <BtnPrimary
                type="button"
                onClick={() => {
                  resetCreateFlow();
                  closeDrawer();
                }}
                className="w-full sm:w-auto sm:min-w-[140px]"
              >
                {fr ? "Fermer" : "Close"}
              </BtnPrimary>
            </PremiumFormFooter>
          </PremiumFormCard>
        ) : null}
      </AdminModal>

      <AdminModal
        open={drawerMode === "detail" && Boolean(selectedUser)}
        onClose={closeDrawer}
        size="lg"
        title={fr ? "Profil utilisateur" : "User profile"}
        subtitle={selectedUser ? String(selectedUser.email ?? "") : ""}
      >
        {error ? (
          <div className="mb-4">
            <AdminErrorAlert message={error} fr={fr} onDismiss={() => setError("")} />
          </div>
        ) : null}
        {selectedUser ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <p><span className="font-semibold">{fr ? "Nom" : "Name"}:</span> {String(selectedUser.full_name ?? "—")}</p>
              <p><span className="font-semibold">Email:</span> {String(selectedUser.email ?? "—")}</p>
              <p><span className="font-semibold">{fr ? "Téléphone" : "Phone"}:</span> {String(selectedUser.phone ?? "—")}</p>
              <p><span className="font-semibold">{fr ? "Profil métier" : "Job profile"}:</span> {profileLabel(String(selectedUser.job_profile ?? ""), profiles, fr)}</p>
              <p><span className="font-semibold">{fr ? "Rôle" : "Role"}:</span> {roleLabel(String(selectedUser.role ?? ""), fr)}</p>
              <p><span className="font-semibold">{fr ? "Accès" : "Access"}:</span> {accessTypeLabel(String(selectedUser.role ?? ""), fr)}</p>
              <p><span className="font-semibold">{fr ? "Département" : "Department"}:</span> {String(selectedUser.department ?? "—")}</p>
              <p><span className="font-semibold">{fr ? "Région" : "Region"}:</span> {regionFromDepartment(String(selectedUser.department ?? ""))}</p>
              <p><span className="font-semibold">{fr ? "Statut" : "Status"}:</span> <UserStatusBadge status={resolveUserStatus(selectedUser)} fr={fr} /></p>
              <p><span className="font-semibold">{fr ? "Dernière connexion" : "Last login"}:</span> {formatDateTime(selectedUser.last_login_at, fr)}</p>
              <p><span className="font-semibold">{fr ? "Vendors autorisés" : "Allowed vendors"}:</span> {String(selectedUser.allowed_vendors ?? "—")}</p>
              <p><span className="font-semibold">{fr ? "Régions autorisées" : "Allowed regions"}:</span> {String(selectedUser.allowed_regions ?? regionFromDepartment(String(selectedUser.department ?? "")))}</p>
              {Number(selectedUser.failed_login_attempts ?? 0) > 0 ? (
                <p><span className="font-semibold">{fr ? "Échecs connexion" : "Login failures"}:</span> {String(selectedUser.failed_login_attempts)}</p>
              ) : null}
              {Boolean(selectedUser.login_security_required) ? (
                <p className="font-semibold text-amber-700">{fr ? "Vérification de sécurité requise" : "Security verification required"}</p>
              ) : null}
              {Boolean(selectedUser.must_change_password) ? (
                <p className="font-semibold text-slate-700">{fr ? "Changement mot de passe obligatoire" : "Password change required"}</p>
              ) : null}
              {selectedUser.last_login_ip ? (
                <p><span className="font-semibold">IP:</span> {String(selectedUser.last_login_ip)}</p>
              ) : null}
            </div>

            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">{fr ? "Permissions par profil" : "Profile permissions"}</p>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-2 py-2 text-left">{fr ? "Fonctionnalité" : "Feature"}</th>
                      <th className="px-2 py-2 text-left">Admin</th>
                      <th className="px-2 py-2 text-left">{fr ? "Ingénieur RAN" : "RAN Engineer"}</th>
                      <th className="px-2 py-2 text-left">{fr ? "Business Analyst" : "Business Analyst"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      [fr ? "Voir sites RAN" : "View RAN sites", "Oui", "Oui", "Oui"],
                      [fr ? "Modifier sites" : "Edit sites", "Oui", "Non", "Non"],
                      [fr ? "Voir KPIs radio" : "View radio KPIs", "Oui", "Oui", fr ? "Limité" : "Limited"],
                      [fr ? "Dashboards business" : "Business dashboards", "Oui", fr ? "Limité" : "Limited", "Oui"],
                      [fr ? "Exporter rapports" : "Export reports", "Oui", fr ? "Optionnel" : "Optional", "Oui"],
                      [fr ? "Gestion users" : "User management", "Oui", "Non", "Non"],
                    ].map(([feature, admin, ran, bi]) => (
                      <tr key={String(feature)} className="border-t border-slate-100">
                        <td className="px-2 py-2 text-slate-700">{feature}</td>
                        <td className="px-2 py-2">{admin}</td>
                        <td className="px-2 py-2">{ran}</td>
                        <td className="px-2 py-2">{bi}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {String(selectedUser.role) === "responsable" ? (
              <div className="flex flex-wrap gap-2">
                {resolveUserStatus(selectedUser) === "pending_access" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void onApproveAccess(Number(selectedUser.id))}
                      className="h-9 rounded-lg border px-3 text-xs font-semibold text-white hover:opacity-90"
                      style={{ background: "#2D9A94", borderColor: "#2D9A94" }}
                    >
                      {fr ? "Accepter la demande d'accès" : "Approve access request"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onRejectAccess(Number(selectedUser.id))}
                      className="h-9 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      {fr ? "Refuser la demande" : "Reject request"}
                    </button>
                  </>
                ) : null}
                {resolveUserStatus(selectedUser) === "pending_otp" ? (
                  <button type="button" onClick={() => void onResendOtp(Number(selectedUser.id))} className="h-9 rounded-lg border border-amber-200 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-50">
                    {fr ? "Renvoyer OTP" : "Resend OTP"}
                  </button>
                ) : null}
                {resolveUserStatus(selectedUser) !== "pending_access" ? (
                  <button
                    type="button"
                    onClick={() => void onToggleActive(Number(selectedUser.id), !Boolean(selectedUser.is_active))}
                    className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {Boolean(selectedUser.is_active) ? (fr ? "Désactiver compte" : "Disable account") : fr ? "Activer compte" : "Enable account"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </AdminModal>
    </div>
  );
}
