"use client";

import { useEffect, useState, type ReactNode } from "react";
import { t, type Locale } from "@/lib/i18n";
import type { RecentFileRecord } from "@/lib/ai-recent-files";

type AiAttachMenuProps = {
  language: Locale;
  open: boolean;
  webSearch: boolean;
  recentFiles: RecentFileRecord[];
  recentOpen: boolean;
  onPickFiles: () => void;
  onScreenshot: () => void;
  onCamera: () => void;
  onToggleWebSearch: () => void;
  onToggleRecent: () => void;
  onSelectRecent: (id: string) => void;
  screenshotLoading?: boolean;
};

function MenuRow({
  icon,
  label,
  onClick,
  active,
  trailing,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  trailing?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`mx-1.5 flex w-[calc(100%-12px)] items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition disabled:cursor-wait disabled:opacity-60 ${
        active ? "bg-red-50 text-red-700" : "text-slate-700 hover:bg-red-50 hover:text-red-700"
      }`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-red-600">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </button>
  );
}

function IconGlobe() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
    </svg>
  );
}

function IconPaperclip() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" strokeLinecap="round" />
    </svg>
  );
}

function IconScreen() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7V4h3M20 7V4h-3M4 17v3h3M20 17v3h-3" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconCamera() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconChevron({ open }: { open?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 text-slate-400 transition ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-red-600" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AiAttachMenu({
  language,
  open,
  webSearch,
  recentFiles,
  recentOpen,
  onPickFiles,
  onScreenshot,
  onCamera,
  onToggleWebSearch,
  onToggleRecent,
  onSelectRecent,
  screenshotLoading,
}: AiAttachMenuProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setHovered(null);
  }, [open]);

  if (!open) return null;

  return (
    <div className="ai-attach-popover absolute bottom-full left-0 z-40 mb-3 w-[min(92vw,340px)] overflow-hidden rounded-2xl border border-slate-200 bg-white py-2 shadow-xl">
      <div className="ai-attach-popover-caret" aria-hidden />

      <MenuRow
        icon={<IconGlobe />}
        label={t(language, "ai_web_search")}
        onClick={onToggleWebSearch}
        active={webSearch}
        trailing={webSearch ? <IconCheck /> : null}
      />

      <div className="my-1.5 border-t border-slate-100" />

      <MenuRow icon={<IconPaperclip />} label={t(language, "ai_attach_files")} onClick={onPickFiles} active={hovered === "files"} />
      <div onMouseEnter={() => setHovered("screen")} onMouseLeave={() => setHovered(null)}>
        <MenuRow
          icon={<IconScreen />}
          label={screenshotLoading ? t(language, "ai_screenshot_loading") : t(language, "ai_screenshot")}
          onClick={onScreenshot}
          active={hovered === "screen" || screenshotLoading}
          disabled={screenshotLoading}
        />
      </div>
      <MenuRow icon={<IconCamera />} label={t(language, "ai_camera")} onClick={onCamera} active={hovered === "camera"} />

      <div className="my-1.5 border-t border-slate-100" />

      <MenuRow
        icon={<IconFolder />}
        label={t(language, "ai_recent_files")}
        onClick={onToggleRecent}
        trailing={<IconChevron open={recentOpen} />}
      />

      {recentOpen ? (
        <div className="mx-1.5 mb-1 max-h-36 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50">
          {recentFiles.length ? (
            recentFiles.map((file) => (
              <button
                key={file.id}
                type="button"
                onClick={() => onSelectRecent(file.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-600 transition hover:bg-red-50 hover:text-red-700"
              >
                <span className="truncate font-medium">{file.name}</span>
                <span className="shrink-0 text-slate-400">{(file.size / 1024).toFixed(0)} KB</span>
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-xs text-slate-400">{t(language, "ai_recent_empty")}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
