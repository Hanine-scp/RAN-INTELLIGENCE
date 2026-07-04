import { Suspense } from "react";
import { VerifyEmailForm } from "./verify-form";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Chargement...</div>}>
      <VerifyEmailForm />
    </Suspense>
  );
}
