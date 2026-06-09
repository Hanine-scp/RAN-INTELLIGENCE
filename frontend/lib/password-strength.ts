export type PasswordStrength = "empty" | "weak" | "medium" | "strong";

export type PasswordRules = {
  minLength: boolean;
  uppercase: boolean;
  special: boolean;
  digit: boolean;
};

const SPECIAL_PATTERN = /[*\/!@#$%^&()_+\-=[\]{}|;:,.<>?]/;

export function getPasswordRules(password: string): PasswordRules {
  return {
    minLength: password.length >= 10,
    uppercase: /[A-Z]/.test(password),
    special: SPECIAL_PATTERN.test(password),
    digit: /\d/.test(password),
  };
}

export function evaluatePasswordStrength(password: string): PasswordStrength {
  if (!password) return "empty";
  const rules = getPasswordRules(password);
  const passed = Object.values(rules).filter(Boolean).length;

  if (!rules.minLength || passed <= 2) return "weak";
  if (passed === 3 || (passed === 4 && password.length < 12)) return "medium";
  return "strong";
}

export function isPasswordValid(password: string): boolean {
  const rules = getPasswordRules(password);
  return rules.minLength && rules.uppercase && rules.special && rules.digit;
}

export function passwordValidationMessage(password: string): string | null {
  const rules = getPasswordRules(password);
  if (!rules.minLength) return "Minimum 10 caractères requis.";
  if (!rules.uppercase) return "Ajoutez au moins une lettre majuscule (A-Z).";
  if (!rules.special) return "Ajoutez un caractère spécial (* / ! @ # …).";
  if (!rules.digit) return "Ajoutez au moins un chiffre.";
  return null;
}

export const STRENGTH_META: Record<Exclude<PasswordStrength, "empty">, { label: string; color: string; bar: string }> = {
  weak: { label: "Faible", color: "text-red-300", bar: "bg-red-400" },
  medium: { label: "Moyen", color: "text-amber-300", bar: "bg-amber-400" },
  strong: { label: "Fort", color: "text-emerald-300", bar: "bg-emerald-400" },
};
