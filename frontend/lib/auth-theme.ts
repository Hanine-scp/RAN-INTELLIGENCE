"use client";

import { createContext, createElement, useContext, type ReactNode } from "react";

export type AuthFormTheme = "overlay" | "card" | "centered";

export const AuthFormThemeContext = createContext<AuthFormTheme>("overlay");

export function AuthFormThemeProvider({ theme, children }: { theme: AuthFormTheme; children: ReactNode }) {
  return createElement(AuthFormThemeContext.Provider, { value: theme }, children);
}

export function useAuthFormTheme(): AuthFormTheme {
  return useContext(AuthFormThemeContext);
}
