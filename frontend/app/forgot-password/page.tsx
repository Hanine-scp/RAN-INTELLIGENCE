import { Suspense } from "react";
import ForgotPasswordForm from "./forgot-form";

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Chargement...</div>}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
