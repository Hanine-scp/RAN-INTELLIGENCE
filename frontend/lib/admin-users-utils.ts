export type AuthUserRow = Record<string, unknown>;

export type UserAccountStatus = "active" | "pending_otp" | "pending_access" | "inactive";

export type UserFilters = {
  query: string;
  jobProfile: string;
  role: string;
  status: string;
  department: string;
};

export const REGIONS = ["National", "Tunis", "Nord", "Centre", "Sud"] as const;

export const VENDORS = ["Tous", "Nokia", "Huawei"] as const;

export function resolveUserStatus(row: AuthUserRow): UserAccountStatus {
  const signupStatus = String(row.signup_status ?? "");
  if (signupStatus === "pending_admin") return "pending_access";
  if (signupStatus === "rejected") return "inactive";

  const role = String(row.role ?? "");
  const active = Boolean(row.is_active);
  const emailOk = Boolean(row.email_verified);
  const phoneOk = Boolean(row.phone_verified);

  if (role === "admin") {
    return active ? "active" : "inactive";
  }

  if (active && emailOk && phoneOk) return "active";
  if (!active || !emailOk || !phoneOk) return "pending_otp";
  return "inactive";
}

export function statusLabel(status: UserAccountStatus, fr: boolean): string {
  if (status === "active") return fr ? "Actif" : "Active";
  if (status === "pending_access") return fr ? "Demande d'accès" : "Access request";
  if (status === "pending_otp") return fr ? "En attente OTP" : "Pending OTP";
  return fr ? "Inactif" : "Inactive";
}

export function statusBadgeClass(status: UserAccountStatus): string {
  if (status === "active") return "border-[#4ECDC4]/40 bg-[#E8FAF8] text-[#2D9A94]";
  if (status === "pending_access") return "border-[#FF6B6B]/40 bg-[#FFE8E8] text-[#C44E4E]";
  if (status === "pending_otp") return "border-[#FFE66D]/50 bg-[#FFF9E0] text-[#8A7200]";
  return "border-[#FF6B6B]/30 bg-[#FFE8E8] text-[#C44E4E]";
}

export function roleLabel(role: string, fr: boolean): string {
  if (role === "admin") return fr ? "Administrateur" : "Administrator";
  return fr ? "Responsable" : "Responsible";
}

export function accessTypeLabel(role: string, fr: boolean): string {
  if (role === "admin") return fr ? "Administration complète" : "Full administration";
  return fr ? "Lecture seule" : "Read-only";
}

export function profileLabel(profileId: string, profiles: { id: string; fr: string; en: string }[], fr: boolean): string {
  const match = profiles.find((item) => item.id === profileId);
  if (!match) return profileId || "—";
  return fr ? match.fr : match.en;
}

export function formatDateTime(value: unknown, fr: boolean): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString(fr ? "fr-FR" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value: unknown, fr: boolean): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString(fr ? "fr-FR" : "en-GB");
}

export function regionFromDepartment(department: string): string {
  const normalized = department.toLowerCase();
  for (const region of REGIONS) {
    if (normalized.includes(region.toLowerCase())) return region;
  }
  return "National";
}

export type Step1FormValues = {
  fullName: string;
  email: string;
  phone: string;
  employeeId: string;
  department: string;
};

export type Step1FieldKey = keyof Step1FormValues;

export type Step1FieldErrors = Partial<Record<Step1FieldKey, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPLOYEE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9\-_.]{2,19}$/;

export function normalizeAdminEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeAdminPhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function validateStep1Form(
  values: Step1FormValues,
  options: { fr: boolean; existingEmails: string[] },
): Step1FieldErrors {
  const errors: Step1FieldErrors = {};
  const { fr, existingEmails } = options;

  const fullName = values.fullName.trim();
  if (!fullName) {
    errors.fullName = fr ? "Le nom complet est obligatoire." : "Full name is required.";
  } else if (fullName.length < 3) {
    errors.fullName = fr ? "Saisissez au moins 3 caractères." : "Enter at least 3 characters.";
  } else if (!/\s/.test(fullName)) {
    errors.fullName = fr ? "Indiquez le prénom et le nom." : "Enter first and last name.";
  }

  const email = normalizeAdminEmail(values.email);
  if (!email) {
    errors.email = fr ? "L'email professionnel est obligatoire." : "Work email is required.";
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = fr ? "Format d'email invalide (ex. prenom.nom@ooredoo.ran)." : "Invalid email format (e.g. name@company.com).";
  } else if (existingEmails.includes(email)) {
    errors.email = fr ? "Cette adresse email est déjà utilisée par un autre compte." : "This email is already used by another account.";
  }

  const phoneDigits = normalizeAdminPhoneDigits(values.phone);
  if (!phoneDigits) {
    errors.phone = fr ? "Le numéro de téléphone est obligatoire." : "Phone number is required.";
  } else if (phoneDigits.length < 8) {
    errors.phone = fr ? "Numéro invalide — minimum 8 chiffres (ex. +216...)." : "Invalid number — at least 8 digits (e.g. +216...).";
  } else if (phoneDigits.length > 15) {
    errors.phone = fr ? "Numéro trop long." : "Phone number is too long.";
  }

  const employeeId = values.employeeId.trim();
  if (employeeId && !EMPLOYEE_ID_PATTERN.test(employeeId)) {
    errors.employeeId = fr
      ? "Format matricule invalide (3 à 20 caractères : lettres, chiffres, - _ .)."
      : "Invalid employee ID (3–20 chars: letters, digits, - _ .).";
  }

  const department = values.department.trim();
  if (!department) {
    errors.department = fr ? "Le département / équipe est obligatoire." : "Department / team is required.";
  } else if (department.length < 2) {
    errors.department = fr ? "Indiquez une équipe valide (ex. RAN, BI, NOC)." : "Enter a valid team (e.g. RAN, BI, NOC).";
  }

  return errors;
}

export function filterUsers(rows: AuthUserRow[], filters: UserFilters): AuthUserRow[] {
  const query = filters.query.trim().toLowerCase();
  return rows.filter((row) => {
    const status = resolveUserStatus(row);
    const name = String(row.full_name ?? "").toLowerCase();
    const email = String(row.email ?? "").toLowerCase();
    const department = String(row.department ?? "");
    const jobProfile = String(row.job_profile ?? "");
    const role = String(row.role ?? "");

    if (query && !name.includes(query) && !email.includes(query)) return false;
    if (filters.jobProfile && jobProfile !== filters.jobProfile) return false;
    if (filters.role && role !== filters.role) return false;
    if (filters.status && status !== filters.status) return false;
    if (filters.department && !department.toLowerCase().includes(filters.department.toLowerCase())) return false;
    return true;
  });
}

export function computeUserStats(rows: AuthUserRow[], fr: boolean) {
  const statuses = rows.map(resolveUserStatus);
  const latestCreated = rows
    .map((row) => String(row.created_at ?? ""))
    .filter(Boolean)
    .sort()
    .slice(-1)[0];

  return {
    total: rows.length,
    active: statuses.filter((item) => item === "active").length,
    pendingOtp: statuses.filter((item) => item === "pending_otp").length,
    pendingAccess: statuses.filter((item) => item === "pending_access").length,
    inactive: statuses.filter((item) => item === "inactive").length,
    lastCreated: latestCreated ? formatDate(latestCreated, fr) : "—",
  };
}

export function exportUsersCsv(rows: AuthUserRow[], profiles: { id: string; fr: string; en: string }[], fr: boolean) {
  const header = [
    fr ? "Nom" : "Name",
    "Email",
    fr ? "Profil métier" : "Job profile",
    fr ? "Rôle" : "Role",
    fr ? "Département" : "Department",
    fr ? "Région" : "Region",
    fr ? "Statut" : "Status",
    fr ? "Dernière connexion" : "Last login",
  ];
  const lines = rows.map((row) => {
    const status = resolveUserStatus(row);
    return [
      String(row.full_name ?? ""),
      String(row.email ?? ""),
      profileLabel(String(row.job_profile ?? ""), profiles, fr),
      roleLabel(String(row.role ?? ""), fr),
      String(row.department ?? ""),
      regionFromDepartment(String(row.department ?? "")),
      statusLabel(status, fr),
      formatDateTime(row.last_login_at, fr),
    ]
      .map((cell) => `"${cell.replace(/"/g, '""')}"`)
      .join(",");
  });
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `users_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
