/** Public self-registration (register/signup pages). Disabled when admin provisions accounts. */
export function isPublicSignupEnabled(): boolean {
  return (process.env.NEXT_PUBLIC_AUTH_PUBLIC_SIGNUP || "false").toLowerCase() === "true";
}
