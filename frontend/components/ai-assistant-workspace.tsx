"use client";



import { useCallback, useEffect, useRef, useState } from "react";

import { AiAssistantChat } from "@/components/ai-assistant-chat";

import { AiChatSidebar } from "@/components/ai-chat-sidebar";

import { useAuth } from "@/components/auth-provider";

import {

  buildConversationTitle,

  createConversation,

  deleteConversation,

  getConversation,

  listConversations,

  saveConversation,

  togglePinConversation,

  type ChatConversationMeta,

  type StoredChatMessage,

} from "@/lib/ai-chat-history";

import {

  bootstrapConversationsFromServer,

  createConversationOnServer,

  deleteConversationOnServer,

  isServerSyncEnabled,

  loadConversationsFromServer,

  syncConversationToServer,

  togglePinOnServer,

} from "@/lib/ai-chat-sync";

import type { FilterPayload } from "@/lib/types";

import type { Locale } from "@/lib/i18n";



type AiAssistantWorkspaceProps = {

  language: Locale;

  payload: FilterPayload;

  seedSiteId?: string;

  seedPrompt?: string;

};



const GUEST_USER_ID = -1;



export function AiAssistantWorkspace({ language, payload, seedSiteId, seedPrompt }: AiAssistantWorkspaceProps) {

  const { user, loading: authLoading } = useAuth();

  const userId = user?.id ?? GUEST_USER_ID;

  const serverSync = isServerSyncEnabled(userId);



  const [activeId, setActiveId] = useState("");

  const [conversations, setConversations] = useState<ChatConversationMeta[]>([]);

  const [messages, setMessages] = useState<StoredChatMessage[]>([]);

  const [ready, setReady] = useState(false);

  const saveTimerRef = useRef<number | null>(null);

  const messagesRef = useRef<StoredChatMessage[]>([]);

  const activeIdRef = useRef("");



  const refreshList = useCallback(async () => {

    if (serverSync) {

      try {

        setConversations(await loadConversationsFromServer());

        return;

      } catch {

        // fallback IndexedDB

      }

    }

    setConversations(await listConversations(userId));

  }, [serverSync, userId]);



  const persistConversation = useCallback(

    async (id: string, nextMessages: StoredChatMessage[]) => {

      if (!id) return;

      const existing = await getConversation(id);

      if (!existing) return;



      const firstUser = nextMessages.find((m) => m.role === "user")?.content ?? "";

      const title =

        existing.title === "Nouvelle conversation" || existing.title === "New chat"

          ? buildConversationTitle(firstUser, existing.title)

          : existing.title;



      const updated = {

        ...existing,

        title,

        messages: nextMessages,

      };

      await saveConversation(updated);



      if (serverSync) {

        try {

          await syncConversationToServer(updated);

        } catch {

          // local cache remains authoritative offline

        }

      }

      await refreshList();

    },

    [refreshList, serverSync],

  );



  const flushSave = useCallback(

    async (id = activeIdRef.current, nextMessages = messagesRef.current) => {

      if (saveTimerRef.current) {

        window.clearTimeout(saveTimerRef.current);

        saveTimerRef.current = null;

      }

      if (!id) return;

      await persistConversation(id, nextMessages);

    },

    [persistConversation],

  );



  const scheduleSave = useCallback(

    (id: string, nextMessages: StoredChatMessage[]) => {

      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);

      saveTimerRef.current = window.setTimeout(() => {

        void persistConversation(id, nextMessages);

      }, 350);

    },

    [persistConversation],

  );



  const handleMessagesChange = useCallback(

    (updater: StoredChatMessage[] | ((prev: StoredChatMessage[]) => StoredChatMessage[])) => {

      setMessages((prev) => {

        const next = typeof updater === "function" ? updater(prev) : updater;

        messagesRef.current = next;

        if (activeIdRef.current) scheduleSave(activeIdRef.current, next);

        return next;

      });

    },

    [scheduleSave],

  );



  const openConversation = useCallback(

    async (id: string) => {

      if (id === activeIdRef.current) return;

      await flushSave();

      const conversation = await getConversation(id);

      if (!conversation) return;

      activeIdRef.current = conversation.id;

      messagesRef.current = conversation.messages;

      setActiveId(conversation.id);

      setMessages(conversation.messages);

    },

    [flushSave],

  );



  const handleNewChat = useCallback(async () => {

    await flushSave();

    const fr = language === "Français";

    const title = fr ? "Nouvelle conversation" : "New chat";

    const created = serverSync

      ? await createConversationOnServer(userId, title)

      : await createConversation(userId, title);

    activeIdRef.current = created.id;

    messagesRef.current = [];

    setActiveId(created.id);

    setMessages([]);

    await refreshList();

  }, [flushSave, language, refreshList, serverSync, userId]);



  const handleDelete = useCallback(

    async (id: string) => {

      if (serverSync) {

        try {

          await deleteConversationOnServer(id);

        } catch {

          // continue local delete

        }

      }

      await deleteConversation(id);

      await refreshList();

      if (id === activeId) {

        const remaining = serverSync

          ? (await loadConversationsFromServer()).filter((c) => c.id !== id)

          : (await listConversations(userId)).filter((c) => c.id !== id);

        if (remaining.length) await openConversation(remaining[0].id);

        else await handleNewChat();

      }

    },

    [activeId, handleNewChat, openConversation, serverSync, userId],

  );



  const handleTogglePin = useCallback(

    async (id: string) => {

      if (serverSync) {

        try {

          await togglePinOnServer(id);

        } catch {

          // fallback local

        }

      }

      await togglePinConversation(id);

      await refreshList();

    },

    [refreshList, serverSync],

  );



  useEffect(() => {

    if (authLoading) return;

    const boot = async () => {

      const fr = language === "Français";

      const defaultTitle = fr ? "Nouvelle conversation" : "New chat";



      if (serverSync) {

        try {

          const remote = await bootstrapConversationsFromServer(userId, defaultTitle);

          activeIdRef.current = remote.activeId;

          messagesRef.current = remote.messages;

          setActiveId(remote.activeId);

          setMessages(remote.messages);

          setConversations(remote.metas);

          setReady(true);

          return;

        } catch {

          // fallback IndexedDB below

        }

      }



      const rows = await listConversations(userId);

      if (rows.length) {

        const latest = rows[0];

        const conversation = await getConversation(latest.id);

        activeIdRef.current = latest.id;

        messagesRef.current = conversation?.messages ?? [];

        setActiveId(latest.id);

        setMessages(conversation?.messages ?? []);

      } else {

        const created = await createConversation(userId, defaultTitle);

        activeIdRef.current = created.id;

        messagesRef.current = [];

        setActiveId(created.id);

        setMessages([]);

      }

      await refreshList();

      setReady(true);

    };

    void boot();

  }, [authLoading, language, refreshList, serverSync, userId]);



  useEffect(() => {

    activeIdRef.current = activeId;

  }, [activeId]);



  useEffect(() => {

    messagesRef.current = messages;

  }, [messages]);



  useEffect(

    () => () => {

      void flushSave();

    },

    [flushSave],

  );



  if (!ready || !activeId) {
    return (
      <div className="premium-card flex h-[min(640px,calc(100vh-12rem))] w-full items-center justify-center rounded-2xl text-sm text-slate-500">
        {language === "Français" ? "Chargement de RAN Intelligence…" : "Loading RAN Intelligence…"}
      </div>
    );
  }

  return (
    <div className="premium-card flex h-[min(680px,calc(100vh-12rem))] w-full gap-0 overflow-hidden rounded-2xl">

      <AiChatSidebar

        language={language}

        conversations={conversations}

        activeId={activeId}

        onNewChat={() => void handleNewChat()}

        onSelect={(id) => void openConversation(id)}

        onDelete={(id) => void handleDelete(id)}

        onTogglePin={(id) => void handleTogglePin(id)}

      />

      <AiAssistantChat

        language={language}

        payload={payload}

        conversationId={activeId}

        messages={messages}

        onMessagesChange={handleMessagesChange}

        onNewChat={() => void handleNewChat()}

        siteFocusId={seedSiteId}

        seedPrompt={seedPrompt}

      />

    </div>

  );

}


