import {
  createAssistantConversation,
  deleteAssistantConversation,
  getAssistantConversation,
  listAssistantConversations,
  syncAssistantConversation,
  toggleAssistantConversationPin,
  type ServerConversation,
} from "@/lib/api";
import {
  getConversation,
  saveConversation,
  type ChatConversation,
  type ChatConversationMeta,
  type StoredChatMessage,
} from "@/lib/ai-chat-history";

function toStoredMessages(messages: Record<string, unknown>[]): StoredChatMessage[] {
  return messages.map((msg) => ({
    id: String(msg.id ?? `m-${Date.now()}`),
    role: (msg.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
    content: String(msg.content ?? ""),
    createdAt: String(msg.createdAt ?? new Date().toISOString()),
    ...(typeof msg.intent === "string" ? { intent: msg.intent } : {}),
    ...(Array.isArray(msg.rows) ? { rows: msg.rows as Record<string, unknown>[] } : {}),
    ...(Array.isArray(msg.details) ? { details: msg.details as Record<string, unknown>[] } : {}),
    ...(Array.isArray(msg.sources) ? { sources: msg.sources as Record<string, unknown>[] } : {}),
    ...(Array.isArray(msg.thinkingSteps) ? { thinkingSteps: msg.thinkingSteps as string[] } : {}),
    ...(Array.isArray(msg.attachments) ? { attachments: msg.attachments as string[] } : {}),
    ...(typeof msg.userQuestion === "string" ? { userQuestion: msg.userQuestion } : {}),
    ...(msg.feedback === "up" || msg.feedback === "down" ? { feedback: msg.feedback } : {}),
  }));
}

function toServerMessages(messages: StoredChatMessage[]): Record<string, unknown>[] {
  return messages.map((msg) => ({ ...msg }));
}

async function mirrorServerConversation(userId: number, conversation: ServerConversation) {
  const now = new Date().toISOString();
  const payload: ChatConversation = {
    id: conversation.id,
    userId,
    title: conversation.title,
    pinned: conversation.pinned,
    createdAt: conversation.createdAt ?? now,
    updatedAt: conversation.updatedAt ?? now,
    messages: toStoredMessages(conversation.messages ?? []),
  };
  await saveConversation(payload);
}

export async function loadConversationsFromServer(): Promise<ChatConversationMeta[]> {
  const rows = await listAssistantConversations();
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    pinned: row.pinned,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    preview: row.preview,
  }));
}

export async function bootstrapConversationsFromServer(
  userId: number,
  defaultTitle: string,
): Promise<{ activeId: string; messages: StoredChatMessage[]; metas: ChatConversationMeta[] }> {
  let metas = await loadConversationsFromServer();
  if (!metas.length) {
    const created = await createAssistantConversation(defaultTitle);
    await mirrorServerConversation(userId, created);
    metas = await loadConversationsFromServer();
    return { activeId: created.id, messages: [], metas };
  }

  const latest = metas[0];
  const local = await getConversation(latest.id);
  if (local?.messages?.length) {
    return { activeId: latest.id, messages: local.messages, metas };
  }

  const full = await getAssistantConversation(latest.id);
  await mirrorServerConversation(userId, full);
  return { activeId: full.id, messages: toStoredMessages(full.messages ?? []), metas };
}

export async function syncConversationToServer(conversation: ChatConversation): Promise<void> {
  await syncAssistantConversation(conversation.id, {
    title: conversation.title,
    pinned: conversation.pinned,
    messages: toServerMessages(conversation.messages),
  });
}

export async function createConversationOnServer(userId: number, title: string): Promise<ChatConversation> {
  const created = await createAssistantConversation(title);
  const conversation: ChatConversation = {
    id: created.id,
    userId,
    title: created.title,
    pinned: created.pinned,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
    messages: [],
  };
  await saveConversation(conversation);
  return conversation;
}

export async function deleteConversationOnServer(id: string): Promise<void> {
  await deleteAssistantConversation(id);
}

export async function togglePinOnServer(id: string): Promise<void> {
  await toggleAssistantConversationPin(id);
}

export function isServerSyncEnabled(userId: number): boolean {
  return userId > 0;
}
