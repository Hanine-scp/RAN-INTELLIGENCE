export type SpeechSessionOptions = {
  lang: string;
  baseText?: string;
  liveMode?: boolean;
  onText: (text: string) => void;
  onError: (message: string) => void;
  onListeningChange: (listening: boolean) => void;
  onUtteranceComplete?: (text: string) => void;
};

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
}

async function ensureMicrophonePermission(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}

export function createSpeechSession(options: SpeechSessionOptions) {
  const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Ctor) return null;

  const recognition = new Ctor();
  let finalTranscript = "";
  let stopped = false;
  let liveMode = Boolean(options.liveMode);

  const composeText = (interim: string) => {
    const base = (options.baseText ?? "").trim();
    const spoken = `${finalTranscript}${interim}`.trim();
    if (!base) return spoken;
    if (!spoken) return base;
    return `${base} ${spoken}`.trim();
  };

  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = options.lang;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const piece = event.results[i][0]?.transcript ?? "";
      if (event.results[i].isFinal) finalTranscript += piece;
      else interim += piece;
    }
    options.onText(composeText(interim));

    if (liveMode && finalTranscript.trim()) {
      const completed = composeText("");
      options.onUtteranceComplete?.(completed);
      finalTranscript = "";
    }
  };

  recognition.onerror = (event) => {
    if (event.error === "aborted") return;
    const messages: Record<string, string> = {
      "not-allowed": "Microphone refusé — autorisez l'accès dans le navigateur.",
      "service-not-allowed": "Service vocal indisponible sur ce navigateur.",
      "no-speech": "Aucune voix détectée. Réessayez en parlant plus fort.",
      "audio-capture": "Micro introuvable — vérifiez votre périphérique audio.",
      "network": "Erreur réseau pour la reconnaissance vocale.",
    };
    options.onError(messages[event.error] ?? `Erreur micro : ${event.error}`);
    options.onListeningChange(false);
  };

  recognition.onend = () => {
    options.onListeningChange(false);
    if (!stopped && liveMode) {
      window.setTimeout(() => {
        if (!stopped) {
          try {
            recognition.start();
            options.onListeningChange(true);
          } catch {
            /* ignore restart race */
          }
        }
      }, 300);
    }
  };

  return {
    async start(baseText = "") {
      stopped = false;
      liveMode = Boolean(options.liveMode);
      options.baseText = baseText;
      finalTranscript = "";

      const allowed = await ensureMicrophonePermission();
      if (!allowed) {
        options.onError("Autorisez le microphone pour utiliser la saisie vocale.");
        return;
      }

      try {
        recognition.start();
        options.onListeningChange(true);
        options.onError("");
      } catch {
        try {
          recognition.abort();
          recognition.start();
          options.onListeningChange(true);
        } catch {
          options.onError("Impossible de démarrer la reconnaissance vocale.");
        }
      }
    },
    stop() {
      stopped = true;
      try {
        recognition.stop();
      } catch {
        recognition.abort();
      }
      options.onListeningChange(false);
      options.onText(composeText(""));
    },
    abort() {
      stopped = true;
      recognition.abort();
      options.onListeningChange(false);
    },
    setLiveMode(enabled: boolean) {
      liveMode = enabled;
      options.liveMode = enabled;
    },
  };
}
