import type { WebSearchMeta } from "@/lib/api";

export type StoredChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  intent?: string;
  rows?: Record<string, unknown>[];
  details?: Record<string, unknown>[];
  sources?: Record<string, unknown>[];
  thinkingSteps?: string[];
  attachments?: string[];
  userQuestion?: string;
  webSearchUsed?: boolean;
  feedback?: "up" | "down";
  webSearchMeta?: WebSearchMeta | null;
  aiModel?: string;
};

export type ChatConversation = {
  id: string;
  userId: number;
  title: string;
  messages: StoredChatMessage[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ChatConversationMeta = Pick<ChatConversation, "id" | "title" | "pinned" | "createdAt" | "updatedAt"> & {
  preview: string;
};

const DB_NAME = "ran_intelligence_history";
const STORE = "conversations";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("userId", "userId", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function buildConversationTitle(firstUserMessage: string, fallback = "Nouvelle conversation"): string {
  const clean = firstUserMessage.replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  return clean.length > 48 ? `${clean.slice(0, 48)}…` : clean;
}

export async function createConversation(userId: number, title = "Nouvelle conversation"): Promise<ChatConversation> {
  const now = new Date().toISOString();
  const conversation: ChatConversation = {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    title,
    messages: [],
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };
  await saveConversation(conversation);
  return conversation;
}

export async function saveConversation(conversation: ChatConversation): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ ...conversation, updatedAt: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getConversation(id: string): Promise<ChatConversation | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(id);
    request.onsuccess = () => resolve((request.result as ChatConversation | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function listConversations(userId: number): Promise<ChatConversationMeta[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).index("userId").getAll(userId);
    request.onsuccess = () => {
      const rows = (request.result as ChatConversation[]) ?? [];
      const metas = rows
        .map((row) => ({
          id: row.id,
          title: row.title,
          pinned: row.pinned,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          preview: row.messages.find((m) => m.role === "user")?.content.slice(0, 80) ?? "",
        }))
        .sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return b.updatedAt.localeCompare(a.updatedAt);
        });
      resolve(metas);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function togglePinConversation(id: string): Promise<void> {
  const conversation = await getConversation(id);
  if (!conversation) return;
  await saveConversation({ ...conversation, pinned: !conversation.pinned });
}
