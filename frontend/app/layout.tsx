import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/components/providers/app-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
import { LayoutFrame } from "@/components/layout/layout-frame";
import { WebVitalsReporter } from "@/components/ui/web-vitals";
import { ClientErrorBoundary } from "@/components/ui/error-reporter";
import { ErrorReporterInit } from "@/components/ui/error-reporter-init";

export const metadata: Metadata = {
  title: "RAN Intelligence Platform",
  description: "Next.js full parity frontend for RAN Intelligence",
  icons: {
    icon: "/brand/ooredoo-logo.png",
    apple: "/brand/ooredoo-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col text-slate-900">
        <AuthProvider>
          <AppProvider>
            <WebVitalsReporter />
            <ErrorReporterInit />
            <ClientErrorBoundary>
              <LayoutFrame>{children}</LayoutFrame>
            </ClientErrorBoundary>
          </AppProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
