"use client";

import { useMemo, useState } from "react";
import type { ChatConversationMeta } from "@/lib/ai-chat-history";
import { t, type Locale } from "@/lib/i18n";

type AiChatSidebarProps = {
  language: Locale;
  conversations: ChatConversationMeta[];
  activeId: string;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
};

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3-3" strokeLinecap="round" />
    </svg>
  );
}

function IconPin({ filled }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
      <path d="M12 2l2.2 6.8H21l-5.5 4 2.1 6.7L12 16.8 6.4 19.5l2.1-6.7L3 8.8h6.8L12 2z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h16M9 7V5h6v2M10 11v6M14 11v6M6 7l1 12h10l1-12" strokeLinecap="round" />
    </svg>
  );
}

export function AiChatSidebar({
  language,
  conversations,
  activeId,
  onNewChat,
  onSelect,
  onDelete,
  onTogglePin,
}: AiChatSidebarProps) {
  const [query, setQuery] = useState("");
  const [recentsOpen, setRecentsOpen] = useState(true);
  const fr = language === "Français";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q) || c.preview.toLowerCase().includes(q));
  }, [conversations, query]);

  return (
    <aside className="ai-chat-sidebar flex h-full w-[272px] shrink-0 flex-col overflow-hidden border-r border-slate-200/80 bg-slate-50/60">
      <div className="border-b border-slate-200/80 bg-white px-4 py-3.5">
        <p className="text-sm font-bold text-slate-900">RAN Intelligence</p>
        <p className="text-[10px] text-slate-400">{fr ? "Conversations enregistrées" : "Saved conversations"}</p>
      </div>

      <div className="space-y-1 border-b border-slate-200/80 bg-white p-2.5">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-teal-700 transition hover:bg-teal-50"
        >
          <IconPlus />
          {t(language, "ai_sidebar_new")}
        </button>
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <IconSearch />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(language, "ai_sidebar_search")}
            className="w-full bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
          />
        </label>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-2">
        <button
          type="button"
          onClick={() => setRecentsOpen((v) => !v)}
          className="mb-1 flex items-center justify-between rounded-lg px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50"
        >
          {t(language, "ai_sidebar_recents")}
          <span className={`transition ${recentsOpen ? "rotate-180" : ""}`}>▾</span>
        </button>

        {recentsOpen ? (
          <div className="ai-chat-sidebar-list min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
            {filtered.length ? (
              filtered.map((conversation) => {
                const active = conversation.id === activeId;
                return (
                  <div
                    key={conversation.id}
                    className={`group relative rounded-xl px-2.5 py-2 transition ${
                      active ? "bg-teal-50 text-teal-900 ring-1 ring-teal-100" : "text-slate-700 hover:bg-white"
                    }`}
                  >
                    <button type="button" onClick={() => onSelect(conversation.id)} className="w-full text-left">
                      <p className="truncate pr-14 text-sm font-medium">{conversation.title}</p>
                      {conversation.preview ? (
                        <p className="truncate text-[10px] text-slate-400">{conversation.preview}</p>
                      ) : null}
                    </button>
                    <div className="absolute right-1 top-1.5 flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                      <button
                        type="button"
                        title={fr ? "Épingler" : "Pin"}
                        onClick={() => onTogglePin(conversation.id)}
                        className={`rounded-md p-1 ${conversation.pinned ? "text-teal-600" : "text-slate-400 hover:text-teal-600"}`}
                      >
                        <IconPin filled={conversation.pinned} />
                      </button>
                      <button
                        type="button"
                        title={fr ? "Supprimer" : "Delete"}
                        onClick={() => onDelete(conversation.id)}
                        className="rounded-md p-1 text-slate-400 hover:text-slate-700"
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="px-2 py-4 text-center text-xs text-slate-400">{t(language, "ai_sidebar_empty")}</p>
            )}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
