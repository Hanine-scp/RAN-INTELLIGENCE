"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiAttachMenu } from "@/components/ai-attach-menu";
import { AiCameraModal } from "@/components/ai-camera-modal";
import { AiMessageActions } from "@/components/ai-message-actions";
import { copyToClipboard } from "@/lib/ai-export";
import { createSpeechSession, isSpeechRecognitionSupported } from "@/lib/speech-recognition";
import { captureScreenshot } from "@/lib/ai-media-capture";
import { listRecentFiles, loadRecentFile, saveRecentFile, type RecentFileRecord } from "@/lib/ai-recent-files";
import {
  askAssistantInsight,
  askAssistantInsightWithFiles,
  getAssistantEngineStatus,
  type AssistantEngineStatus,
  type AssistantInsightResponse,
} from "@/lib/api";
import { t, type Locale } from "@/lib/i18n";
import type { StoredChatMessage } from "@/lib/ai-chat-history";
import type { FilterPayload } from "@/lib/types";

type AssistantMode = "instant" | "thinking";

type AttachmentItem = {
  id: string;
  name: string;
  file: File;
  sizeLabel: string;
  source: "file" | "screenshot" | "camera" | "recent";
  previewUrl?: string;
};

type ChatMessage = StoredChatMessage;

type AiAssistantChatProps = {
  language: Locale;
  payload: FilterPayload;
  conversationId: string;
  messages: ChatMessage[];
  onMessagesChange: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  onNewChat: () => void;
  siteFocusId?: string;
  seedPrompt?: string;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderRichText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

function MessageBody({ content }: { content: string }) {
  const blocks = content.split("\n\n");
  return (
    <div className="space-y-2 text-[13px] leading-relaxed text-slate-700">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => l.startsWith("- ") || l.startsWith("· "))) {
          return (
            <ul key={i} className="list-inside list-disc space-y-1 text-slate-700">
              {lines.map((line, j) => (
                <li key={j}>{renderRichText(line.replace(/^[-·]\s*/, ""))}</li>
              ))}
            </ul>
          );
        }
        if (block.startsWith("```")) {
          return (
            <pre key={i} className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-3 font-mono text-xs text-slate-600">
              {block.replace(/```/g, "").trim()}
            </pre>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {renderRichText(block)}
          </p>
        );
      })}
    </div>
  );
}

function IconPlus({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function IconMic({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8" strokeLinecap="round" />
    </svg>
  );
}

function IconWave({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <rect x="4" y="9" width="2" height="6" rx="1" />
      <rect x="8" y="6" width="2" height="12" rx="1" />
      <rect x="12" y="4" width="2" height="16" rx="1" />
      <rect x="16" y="7" width="2" height="10" rx="1" />
      <rect x="20" y="10" width="2" height="4" rx="1" />
    </svg>
  );
}

function IconChevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSpark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 2l1.4 5.6L19 9l-5.6 1.4L12 16l-1.4-5.6L5 9l5.6-1.4L12 2z" />
    </svg>
  );
}

function IconPaperclip({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" strokeLinecap="round" />
    </svg>
  );
}

function ThinkingDots() {
  return (
    <span className="ai-thinking-dots inline-flex gap-1" aria-hidden>
      <span />
      <span />
      <span />
    </span>
  );
}

function DataPanel({
  language,
  rows,
  details,
  sources,
}: {
  language: Locale;
  rows: Record<string, unknown>[];
  details: Record<string, unknown>[];
  sources: Record<string, unknown>[];
}) {
  const total = rows.length + details.length + sources.length;
  if (!total) return null;

  return (
    <div className="mt-1.5">
      <div className="max-h-36 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-2 text-[10px] text-slate-600">
          {sources.length ? (
            <div className="mb-3">
              <p className="mb-1 font-semibold text-slate-500">{t(language, "ai_sources")}</p>
              <pre className="whitespace-pre-wrap font-mono text-[11px]">{JSON.stringify(sources.slice(0, 6), null, 2)}</pre>
            </div>
          ) : null}
          {rows.length ? (
            <div className="mb-3">
              <p className="mb-1 font-semibold text-slate-500">{t(language, "ai_rows")}</p>
              <pre className="whitespace-pre-wrap font-mono text-[11px]">{JSON.stringify(rows.slice(0, 10), null, 2)}</pre>
            </div>
          ) : null}
          {details.length ? (
            <div>
              <p className="mb-1 font-semibold text-slate-500">{t(language, "ai_details")}</p>
              <pre className="whitespace-pre-wrap font-mono text-[11px]">{JSON.stringify(details.slice(0, 10), null, 2)}</pre>
            </div>
          ) : null}
      </div>
    </div>
  );
}

export function AiAssistantChat({
  language,
  payload,
  conversationId,
  messages,
  onMessagesChange,
  onNewChat,
  siteFocusId,
  seedPrompt,
}: AiAssistantChatProps) {
  const fr = language === "Français";
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<AssistantMode>("thinking");
  const [modeOpen, setModeOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceLive, setVoiceLive] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [recentFiles, setRecentFiles] = useState<RecentFileRecord[]>([]);
  const [recentOpen, setRecentOpen] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [dataOpenIds, setDataOpenIds] = useState<Record<string, boolean>>({});
  const [engineStatus, setEngineStatus] = useState<AssistantEngineStatus | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const speechSessionRef = useRef<ReturnType<typeof createSpeechSession>>(null);
  const attachRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<HTMLDivElement>(null);
  const voiceLiveRef = useRef(voiceLive);
  const loadingRef = useRef(loading);
  const submitRef = useRef<(q: string, files?: AttachmentItem[]) => Promise<void>>(async () => {});
  const seedFiredRef = useRef(false);

  const scopedPayload = useMemo(() => {
    if (!siteFocusId) return payload;
    const sites = [...(payload.selected_sites ?? [])];
    if (!sites.includes(siteFocusId)) sites.push(siteFocusId);
    return { ...payload, selected_sites: sites };
  }, [payload, siteFocusId]);

  const resetLocalChat = useCallback(() => {
    setInput("");
    setAttachments([]);
    setErrorMessage("");
    setDataOpenIds({});
    setSpeakingId(null);
    setVoiceLive(false);
    setWebSearch(false);
    window.speechSynthesis?.cancel();
    speechSessionRef.current?.abort();
    setListening(false);
  }, []);

  useEffect(() => {
    resetLocalChat();
  }, [conversationId, resetLocalChat]);

  voiceLiveRef.current = voiceLive;
  loadingRef.current = loading;

  const hasConversation = messages.length > 0;

  const speak = useCallback(
    (text: string, onDone?: () => void) => {
      if (typeof window === "undefined" || !window.speechSynthesis) {
        onDone?.();
        return;
      }
      window.speechSynthesis.cancel();
      const clean = text.replace(/\*\*/g, "").replace(/```[\s\S]*?```/g, "").slice(0, 1200);
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = fr ? "fr-FR" : "en-US";
      utterance.rate = 1;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => {
        setSpeaking(false);
        setSpeakingId(null);
        onDone?.();
      };
      utterance.onerror = () => {
        setSpeaking(false);
        setSpeakingId(null);
        onDone?.();
      };
      window.speechSynthesis.speak(utterance);
    },
    [fr],
  );

  const stopListening = useCallback(() => {
    speechSessionRef.current?.stop();
    setListening(false);
  }, []);

  const startListening = useCallback(
    async (live = false) => {
      if (!isSpeechRecognitionSupported()) {
        setErrorMessage(t(language, "ai_voice_unsupported"));
        return;
      }

      if (!speechSessionRef.current) {
        speechSessionRef.current = createSpeechSession({
          lang: fr ? "fr-FR" : "en-US",
          onText: (text) => setInput(text),
          onError: (message) => {
            if (message) setErrorMessage(message);
          },
          onListeningChange: (active) => setListening(active),
          onUtteranceComplete: (text) => {
            if (!voiceLiveRef.current || loadingRef.current) return;
            const question = text.trim();
            if (!question) return;
            speechSessionRef.current?.stop();
            void submitRef.current(question);
          },
        });
      }

      const session = speechSessionRef.current;
      if (!session) {
        setErrorMessage(t(language, "ai_voice_unsupported"));
        return;
      }

      session.setLiveMode(live);
      setErrorMessage("");
      await session.start(input);
    },
    [fr, input, language],
  );

  const toggleMicrophone = useCallback(() => {
    if (listening) {
      stopListening();
      return;
    }
    void startListening(false);
  }, [listening, startListening, stopListening]);

  const addAttachments = useCallback((items: AttachmentItem[]) => {
    setAttachments((prev) => [...prev, ...items].slice(0, 5));
    void Promise.all(items.map((item) => saveRecentFile(item.file))).then(() =>
      listRecentFiles().then(setRecentFiles).catch(() => undefined),
    );
  }, []);

  const buildAttachment = useCallback((file: File, source: AttachmentItem["source"]): AttachmentItem => {
    const isImage = file.type.startsWith("image/");
    return {
      id: `${source}-${Date.now()}-${file.name}`,
      name: file.name,
      file,
      sizeLabel: formatSize(file.size),
      source,
      previewUrl: isImage ? URL.createObjectURL(file) : undefined,
    };
  }, []);

  const buildThinkingSteps = useCallback(
    (insight: AssistantInsightResponse, fileCount: number, withWeb: boolean) => {
      if (mode !== "thinking") return undefined;
      const steps = [
        insight.ai_engine === "openai"
          ? fr
            ? "Agent OpenAI — orchestration des outils RAN…"
            : "OpenAI agent — orchestrating RAN tools…"
          : fr
            ? "Moteur local — règles + synthèse…"
            : "Local engine — rules + synthesis…",
      ];
      if (withWeb) {
        steps.push(fr ? "Recherche sur le Web en cours…" : "Searching the web…");
      }
      if (fileCount > 0) {
        steps.push(fr ? `Parsing de ${fileCount} fichier(s) joint(s)…` : `Parsing ${fileCount} attached file(s)…`);
        steps.push(fr ? "Calcul qualité & signaux d'alerte…" : "Quality scoring & alert signals…");
      }
      if (insight.tools_used?.length) {
        steps.push(
          fr
            ? `Outils appelés : ${insight.tools_used.join(", ")}`
            : `Tools called: ${insight.tools_used.join(", ")}`,
        );
      }
      steps.push(
        fr ? `Intent : ${insight.intent ?? "-"}` : `Intent: ${insight.intent ?? "-"}`,
        fr
          ? `Données : ${Array.isArray(insight.rows) ? insight.rows.length : 0} lignes`
          : `Data: ${Array.isArray(insight.rows) ? insight.rows.length : 0} rows`,
        fr ? "Synthèse narrative générée" : "Narrative synthesis complete",
      );
      return steps;
    },
    [fr, mode],
  );

  const submitQuestion = useCallback(
    async (rawQuestion: string, fileItems?: AttachmentItem[]) => {
      const question = rawQuestion.trim();
      const files = fileItems ?? attachments;
      const useEnriched = files.length > 0 || webSearch;
      if ((!question && files.length === 0 && !webSearch) || loading) return;

      const displayQuestion =
        question ||
        (fr ? `Analyse détaillée de ${files.length} fichier(s)` : `Detailed analysis of ${files.length} file(s)`);

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: displayQuestion,
        createdAt: new Date().toISOString(),
        attachments: files.map((f) => f.name),
      };
      onMessagesChange((prev) => [...prev, userMsg]);
      setInput("");
      const filesToSend = files.map((f) => f.file);
      setAttachments([]);
      setLoading(true);
      setErrorMessage("");

      const thinkingDelay = mode === "thinking" ? 900 : 0;
      const history = [...messages, userMsg]
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content }));
      const assistantOptions = { conversationId, history };

      try {
        const request = useEnriched
          ? askAssistantInsightWithFiles(scopedPayload, question, filesToSend, webSearch, assistantOptions)
          : askAssistantInsight(scopedPayload, question, assistantOptions);

        const [insight] = await Promise.all([request, new Promise((r) => setTimeout(r, thinkingDelay))]);

        const answer = String(insight.message ?? "");
        const assistantMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: answer || (fr ? "Aucune réponse disponible." : "No answer available."),
          createdAt: new Date().toISOString(),
          intent: String(insight.intent ?? ""),
          rows: Array.isArray(insight.rows) ? insight.rows : [],
          details: Array.isArray(insight.details) ? insight.details : [],
          sources: Array.isArray(insight.sources) ? insight.sources : [],
          thinkingSteps: buildThinkingSteps(insight, filesToSend.length, webSearch),
          userQuestion: displayQuestion,
        };
        onMessagesChange((prev) => [...prev, assistantMsg]);

        if (voiceLiveRef.current && answer) {
          speak(answer, () => {
            if (voiceLiveRef.current) startListening(true);
          });
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : t(language, "ai_error"));
        onMessagesChange((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: "assistant",
            content: fr ? "Désolé, une erreur s'est produite. Réessayez." : "Sorry, something went wrong. Please try again.",
            createdAt: new Date().toISOString(),
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [
      attachments,
      buildThinkingSteps,
      conversationId,
      fr,
      language,
      loading,
      messages,
      mode,
      onMessagesChange,
      scopedPayload,
      speak,
      startListening,
      webSearch,
    ],
  );

  submitRef.current = submitQuestion;

  useEffect(() => {
    if (!seedPrompt || seedFiredRef.current || messages.length > 0) return;
    seedFiredRef.current = true;
    const timer = window.setTimeout(() => {
      void submitQuestion(seedPrompt);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [messages.length, seedPrompt, submitQuestion]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submitQuestion(input);
  };

  const toggleSpeakMessage = useCallback(
    (messageId: string, content: string) => {
      if (speakingId === messageId) {
        window.speechSynthesis?.cancel();
        setSpeakingId(null);
        setSpeaking(false);
        return;
      }
      setSpeakingId(messageId);
      speak(content);
    },
    [speak, speakingId],
  );

  const setMessageFeedback = useCallback(
    (messageId: string, feedback: "up" | "down") => {
      onMessagesChange((prev) => prev.map((m) => (m.id === messageId ? { ...m, feedback } : m)));
    },
    [onMessagesChange],
  );

  const regenerateMessage = useCallback(
    (msg: ChatMessage) => {
      const question = msg.userQuestion?.trim();
      if (!question || loading) return;
      onMessagesChange((prev) => prev.filter((m) => m.id !== msg.id));
      void submitQuestion(question);
    },
    [loading, submitQuestion],
  );

  const handleFilePick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files;
    if (!picked?.length) return;
    addAttachments(Array.from(picked).map((file) => buildAttachment(file, "file")));
    setAttachOpen(false);
    event.target.value = "";
  };

  const handleScreenshot = async () => {
    setScreenshotLoading(true);
    setAttachOpen(false);
    try {
      const file = await captureScreenshot();
      addAttachments([buildAttachment(file, "screenshot")]);
    } catch {
      setErrorMessage(t(language, "ai_screenshot_error"));
    } finally {
      setScreenshotLoading(false);
    }
  };

  const handleRecentSelect = async (id: string) => {
    const file = await loadRecentFile(id);
    if (!file) {
      setErrorMessage(t(language, "ai_recent_empty"));
      return;
    }
    addAttachments([buildAttachment(file, "recent")]);
    setRecentOpen(false);
    setAttachOpen(false);
  };

  const refreshRecent = useCallback(() => {
    void listRecentFiles().then(setRecentFiles).catch(() => undefined);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => {
    refreshRecent();
  }, [refreshRecent]);

  useEffect(() => {
    getAssistantEngineStatus()
      .then(setEngineStatus)
      .catch(() => setEngineStatus(null));
  }, []);

  useEffect(() => {
    speechSessionRef.current?.abort();
    speechSessionRef.current = null;
  }, [fr]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (attachRef.current && !attachRef.current.contains(event.target as Node)) setAttachOpen(false);
      if (modeRef.current && !modeRef.current.contains(event.target as Node)) setModeOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(
    () => () => {
      speechSessionRef.current?.abort();
      window.speechSynthesis?.cancel();
    },
    [],
  );

  return (
    <div className="ai-copilot-widget relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <IconSpark className="ai-copilot-icon h-4 w-4 text-red-600" />
          <div>
            <p className="text-sm font-semibold tracking-wide text-slate-800">RAN Intelligence</p>
            {engineStatus ? (
              <p className="text-[10px] text-slate-400">
                {engineStatus.claude?.enabled
                  ? `Claude · ${engineStatus.claude.model ?? "docs"}`
                  : engineStatus.engine === "openai"
                    ? `${t(language, "ai_engine_openai")} · ${engineStatus.model ?? "OpenAI"}`
                    : t(language, "ai_engine_local")}
              </p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            resetLocalChat();
            onNewChat();
          }}
          className="ai-copilot-icon rounded-lg p-1.5 text-red-600 transition hover:bg-red-50"
          title={t(language, "ai_new_chat")}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div ref={scrollRef} className="ai-chat-scroll flex-1 overflow-y-auto px-6 py-5">
        {!hasConversation && !loading ? (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center px-6 text-center">
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{t(language, "ai_greeting")}</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-500">{t(language, "ai_greeting_hint")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <article key={msg.id} className={msg.role === "user" ? "flex justify-end" : ""}>
                <div className={`max-w-[92%] ${msg.role === "user" ? "text-right" : "text-left"}`}>
                  <div
                    className={`group relative rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                      msg.role === "user" ? "ai-msg-user text-slate-800" : "ai-msg-assistant text-slate-700"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <button
                        type="button"
                        onClick={() => void copyToClipboard(msg.content)}
                        className="absolute right-2 top-2 rounded-md p-1 text-red-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
                        title={t(language, "ai_copy")}
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <rect x="9" y="9" width="11" height="11" rx="2" />
                          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                        </svg>
                      </button>
                    ) : null}
                    {msg.role === "assistant" ? <MessageBody content={msg.content} /> : <p>{msg.content}</p>}
                    {msg.attachments?.length ? (
                      <p className="mt-1.5 text-[10px] text-slate-400">📎 {msg.attachments.join(", ")}</p>
                    ) : null}
                  </div>
                  {msg.role === "assistant" ? (
                    <>
                      <AiMessageActions
                        language={language}
                        messageId={msg.id}
                        content={msg.content}
                        speaking={speakingId === msg.id}
                        feedback={msg.feedback}
                        showData={Boolean(dataOpenIds[msg.id])}
                        onToggleSpeak={() => toggleSpeakMessage(msg.id, msg.content)}
                        onRegenerate={() => regenerateMessage(msg)}
                        onFeedback={(value) => setMessageFeedback(msg.id, value)}
                        onToggleData={
                          (msg.rows?.length ?? 0) + (msg.details?.length ?? 0) + (msg.sources?.length ?? 0) > 0
                            ? () => setDataOpenIds((prev) => ({ ...prev, [msg.id]: !prev[msg.id] }))
                            : undefined
                        }
                      />
                      {dataOpenIds[msg.id] ? (
                        <DataPanel language={language} rows={msg.rows ?? []} details={msg.details ?? []} sources={msg.sources ?? []} />
                      ) : null}
                    </>
                  ) : null}
                </div>
              </article>
            ))}
            {loading ? (
              <div className="flex items-center gap-2 px-1 py-2 text-xs text-slate-500">
                {mode === "thinking" ? t(language, "ai_thinking") : t(language, "ai_processing")}
                <ThinkingDots />
              </div>
            ) : null}
          </div>
        )}
      </div>

      {errorMessage ? (
        <p className="mx-5 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {errorMessage}
        </p>
      ) : null}

      {(listening || speaking) ? (
        <p className="mb-1.5 text-center text-xs font-medium text-red-600">
          {speaking ? t(language, "ai_speaking") : t(language, "ai_listening")}
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="shrink-0 border-t border-slate-100 px-5 pb-4 pt-3">
        <div className="ai-copilot-input flex items-end gap-1 rounded-2xl px-2 py-2">
          <div ref={attachRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setAttachOpen((v) => !v)}
              className={`ai-copilot-icon flex h-10 w-10 items-center justify-center rounded-full transition ${
                attachOpen || webSearch ? "bg-red-50 text-red-600" : "text-red-600"
              }`}
              aria-label={t(language, "ai_attach")}
            >
              <IconPlus className="h-5 w-5" />
            </button>
            <AiAttachMenu
              language={language}
              open={attachOpen}
              webSearch={webSearch}
              recentFiles={recentFiles}
              recentOpen={recentOpen}
              screenshotLoading={screenshotLoading}
              onPickFiles={() => fileInputRef.current?.click()}
              onScreenshot={() => void handleScreenshot()}
              onCamera={() => {
                setAttachOpen(false);
                setCameraOpen(true);
              }}
              onToggleWebSearch={() => {
                setWebSearch((v) => !v);
                setAttachOpen(false);
              }}
              onToggleRecent={() => setRecentOpen((v) => !v)}
              onSelectRecent={(id) => void handleRecentSelect(id)}
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".xml,.csv,.json,.txt,.log,.md,.png,.jpg,.jpeg,.webp,.gif,image/*"
              className="hidden"
              onChange={handleFilePick}
            />
          </div>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submitQuestion(input);
              }
            }}
            rows={1}
            placeholder={t(language, "ai_input_placeholder")}
            className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
          />

          <div ref={modeRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setModeOpen((v) => !v)}
              className="ai-copilot-icon flex items-center gap-1 rounded-full px-2.5 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              {mode === "thinking" ? t(language, "ai_mode_thinking") : t(language, "ai_mode_instant")}
              <IconChevron className="h-3.5 w-3.5" />
            </button>
            {modeOpen ? (
              <div className="absolute bottom-full right-0 z-30 mb-2 w-36 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                {(["instant", "thinking"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setMode(item);
                      setModeOpen(false);
                    }}
                    className={`block w-full px-4 py-2.5 text-left text-sm transition hover:bg-red-50 ${
                      mode === item ? "font-semibold text-red-600" : "text-slate-600"
                    }`}
                  >
                    {t(language, item === "instant" ? "ai_mode_instant" : "ai_mode_thinking")}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={toggleMicrophone}
            className={`ai-copilot-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
              listening ? "ai-voice-pulse bg-red-600 text-white" : "text-red-600"
            }`}
            title={t(language, "ai_voice_input")}
          >
            <IconMic className="h-5 w-5" />
          </button>

          <button
            type={input.trim() || attachments.length || (webSearch && input.trim()) ? "submit" : "button"}
            disabled={loading}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40 ${
              voiceLive || input.trim() || attachments.length
                ? "bg-red-600 text-white shadow-md hover:bg-red-700"
                : "ai-copilot-icon text-red-600"
            }`}
            onClick={(e) => {
              if (!input.trim() && attachments.length === 0) {
                e.preventDefault();
                const next = !voiceLive;
                setVoiceLive(next);
                if (next) void startListening(true);
                else stopListening();
              }
            }}
            title={
              input.trim() || attachments.length
                ? t(language, "ask")
                : voiceLive
                  ? t(language, "ai_voice_live_on")
                  : t(language, "ai_voice_live")
            }
          >
            <IconWave className="h-4 w-4" />
          </button>
        </div>

        {(attachments.length > 0 || webSearch) ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {webSearch ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                🌐 {t(language, "ai_web_search_on")}
                <button type="button" onClick={() => setWebSearch(false)} className="text-emerald-500 hover:text-emerald-800">
                  ×
                </button>
              </span>
            ) : null}
            {attachments.map((file) => (
              <span
                key={file.id}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
              >
                {file.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={file.previewUrl} alt="" className="h-6 w-6 rounded-md object-cover" />
                ) : (
                  <IconPaperclip className="h-3 w-3 opacity-60" />
                )}
                {file.name}
                <span className="text-slate-400">({file.sizeLabel})</span>
                <button
                  type="button"
                  onClick={() => {
                    if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
                    setAttachments((prev) => prev.filter((a) => a.id !== file.id));
                  }}
                  className="text-red-400 hover:text-red-600"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}

      </form>

      <AiCameraModal
        language={language}
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => addAttachments([buildAttachment(file, "camera")])}
      />
    </div>
  );
}
