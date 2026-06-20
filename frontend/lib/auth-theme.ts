"use client";

import { createContext, useContext } from "react";

export type AuthFormTheme = "overlay" | "card";

export const AuthFormThemeContext = createContext<AuthFormTheme>("overlay");

export function useAuthFormTheme(): AuthFormTheme {
  return useContext(AuthFormThemeContext);
}
