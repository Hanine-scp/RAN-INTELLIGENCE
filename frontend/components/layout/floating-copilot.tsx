"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AiAssistantChat } from "@/components/ai/ai-assistant-chat";
import { useAppContext } from "@/components/providers/app-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { isPublicRoute } from "@/lib/permissions";
import { t } from "@/lib/i18n";
import type { StoredChatMessage } from "@/lib/ai-chat-history";

const FLOATING_CONVERSATION_ID = "floating-copilot";

export function FloatingCopilot() {
  const pathname = usePathname();
  const router = useRouter();
  const { filters, payload } = useAppContext();
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<StoredChatMessage[]>([]);

  const language = filters.language;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (loading || !user || isPublicRoute(pathname) || pathname === "/ai-assistant") {
    return null;
  }

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[2px] sm:bg-transparent sm:backdrop-blur-0"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      ) : null}

      <div
        className={`fixed bottom-24 right-5 z-50 flex w-[calc(100vw-2.5rem)] max-w-[420px] origin-bottom-right flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-teal-900/20 transition-all duration-200 sm:right-6 ${
          open ? "pointer-events-auto translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-3 scale-95 opacity-0"
        }`}
        style={{ height: "min(640px, calc(100vh - 8rem))" }}
        role="dialog"
        aria-label={t(language, "ai_copilot_suite")}
      >
        <div className="flex items-center justify-end gap-1 border-b border-slate-100 bg-slate-50/60 px-2 py-1.5">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push("/ai-assistant");
            }}
            title={t(language, "copilot_launcher_expand")}
            aria-label={t(language, "copilot_launcher_expand")}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white hover:text-teal-700"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M9 21H3v-6M15 3h6v6M21 3l-7 7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            title={t(language, "copilot_launcher_close")}
            aria-label={t(language, "copilot_launcher_close")}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white hover:text-teal-700"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1">
          {open ? (
            <AiAssistantChat
              language={language}
              payload={payload}
              conversationId={FLOATING_CONVERSATION_ID}
              messages={messages}
              onMessagesChange={setMessages}
              onNewChat={() => setMessages([])}
            />
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={open ? t(language, "copilot_launcher_close") : t(language, "copilot_launcher_open")}
        aria-label={open ? t(language, "copilot_launcher_close") : t(language, "copilot_launcher_open")}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#1E293B] to-[#0F172A] text-white shadow-lg shadow-slate-900/30 transition hover:scale-105 hover:shadow-xl active:scale-95 sm:right-6"
      >
        {open ? (
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path
              d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z"
              strokeLinejoin="round"
            />
            <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" strokeLinecap="round" />
          </svg>
        )}
        {!open ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-sky-400 ring-2 ring-white" />
          </span>
        ) : null}
      </button>
    </>
  );
}
