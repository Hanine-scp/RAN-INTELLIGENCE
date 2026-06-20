"use client";

import { useState } from "react";

export const AUTH_FORM_AUTOCOMPLETE = "off" as const;

export const AUTH_INPUT_NAMES = {
  email: "ran_field_contact",
  password: "ran_field_secret",
  passwordNew: "ran_field_secret_confirm",
  fullName: "ran_field_identity",
  phone: "ran_field_mobile",
  emailOtp: "ran_field_otp_mail",
  phoneOtp: "ran_field_otp_sms",
  bootstrapKey: "ran_field_bootstrap",
  masterKey: "ran_field_master_key",
} as const;

export function clearAuthRememberEmail() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("ran_remember_email");
  }
}

export function useVirginFormKey() {
  const [key] = useState(() => `vf-${Date.now()}`);
  return key;
}

export function useVirginInput() {
  const [armed, setArmed] = useState(false);
  return {
    armed,
    virginProps: {
      readOnly: !armed,
      onFocus: () => setArmed(true),
    } as const,
  };
}
