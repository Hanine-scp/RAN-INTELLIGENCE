"use client";

import { useState, type ReactNode } from "react";
import { copyToClipboard, downloadResponsePdf, downloadTextFile } from "@/lib/ai-export";
import { t, type Locale } from "@/lib/i18n";

type AiMessageActionsProps = {
  language: Locale;
  messageId: string;
  content: string;
  speaking: boolean;
  loading?: boolean;
  feedback?: "up" | "down";
  showData?: boolean;
  onToggleSpeak: () => void;
  onRegenerate: () => void;
  onFeedback: (value: "up" | "down") => void;
  onToggleData?: () => void;
};

function ActionBtn({
  title,
  onClick,
  active,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg p-1.5 transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-teal-50 text-teal-700" : "text-slate-500 hover:bg-slate-50 hover:text-teal-700"
      }`}
    >
      {children}
    </button>
  );
}

function IconCopy() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function IconThumbUp() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 11v8a1 1 0 0 0 1 1h2v-9H8a1 1 0 0 0-1 1Zm3-8h7l-2 7h4l-6 9v-8h-3l2-8Z" strokeLinejoin="round" />
    </svg>
  );
}

function IconThumbDown() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M17 13V5a1 1 0 0 0-1-1h-2v9h2a1 1 0 0 0 1-1Zm-3 8H7l2-7H5l6-9v8h3l-2 8Z" strokeLinejoin="round" />
    </svg>
  );
}

function IconTxt() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v5h5M8 13h6M8 17h4" strokeLinecap="round" />
    </svg>
  );
}

function IconPdf() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v5h5M8 13h8M8 17h6" strokeLinecap="round" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" strokeLinecap="round" />
      <path d="M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSpeaker() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M11 5 6 9H3v6h3l5 4V5Z" strokeLinejoin="round" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8 8 0 0 1 0 12" strokeLinecap="round" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

export function AiMessageActions({
  language,
  messageId,
  content,
  speaking,
  loading = false,
  feedback,
  showData,
  onToggleSpeak,
  onRegenerate,
  onFeedback,
  onToggleData,
}: AiMessageActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(content);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <div className="mt-1.5 flex items-center gap-0.5">
      <ActionBtn
        title={copied ? t(language, "ai_copied") : t(language, "ai_copy")}
        active={copied}
        onClick={() => void handleCopy()}
      >
        <IconCopy />
      </ActionBtn>
      <ActionBtn
        title={t(language, "ai_thumb_up")}
        active={feedback === "up"}
        onClick={() => onFeedback("up")}
      >
        <IconThumbUp />
      </ActionBtn>
      <ActionBtn
        title={t(language, "ai_thumb_down")}
        active={feedback === "down"}
        onClick={() => onFeedback("down")}
      >
        <IconThumbDown />
      </ActionBtn>
      <ActionBtn
        title={t(language, "ai_download_pdf")}
        onClick={() => downloadResponsePdf("RAN Intelligence", content, `ran-intelligence-${messageId}.pdf`)}
      >
        <IconPdf />
      </ActionBtn>
      <ActionBtn
        title={t(language, "ai_download_txt")}
        onClick={() => downloadTextFile(content.replace(/\*\*/g, ""), `ran-intelligence-${messageId}.txt`)}
      >
        <IconTxt />
      </ActionBtn>
      <ActionBtn
        title={t(language, "ai_regenerate")}
        disabled={loading}
        onClick={onRegenerate}
      >
        <IconRefresh />
      </ActionBtn>
      <ActionBtn title={speaking ? t(language, "ai_stop_read") : t(language, "ai_listen")} active={speaking} onClick={onToggleSpeak}>
        <IconSpeaker />
      </ActionBtn>
      {onToggleData ? (
        <ActionBtn title={t(language, "ai_view_data")} active={showData} onClick={onToggleData}>
          <IconMore />
        </ActionBtn>
      ) : null}
    </div>
  );
}
