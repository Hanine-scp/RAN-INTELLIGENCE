"use client";

import { useEffect, useRef, useState } from "react";
import { captureVideoFrame } from "@/lib/ai-media-capture";
import { t, type Locale } from "@/lib/i18n";

type AiCameraModalProps = {
  language: Locale;
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
};

export function AiCameraModal({ language, open, onClose, onCapture }: AiCameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    let active = true;
    setError("");

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setError(t(language, "ai_camera_error"));
      }
    };

    void start();

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [language, open]);

  if (!open) return null;

  const takePhoto = async () => {
    const video = videoRef.current;
    if (!video) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = await captureVideoFrame(video, `photo-${stamp}.jpg`);
    onCapture(file);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="ai-chat-glass w-full max-w-lg overflow-hidden rounded-2xl border border-white/25 text-white shadow-2xl">
        <div className="border-b border-white/15 px-4 py-3">
          <p className="text-sm font-bold">{t(language, "ai_camera_title")}</p>
          <p className="text-xs text-white/60">{t(language, "ai_camera_hint")}</p>
        </div>
        <div className="relative aspect-[4/3] bg-black/40">
          <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
          {error ? <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-amber-100">{error}</p> : null}
        </div>
        <div className="flex gap-2 border-t border-white/15 p-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/20 bg-white/8 px-3 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/14"
          >
            {t(language, "ai_camera_cancel")}
          </button>
          <button
            type="button"
            onClick={() => void takePhoto()}
            disabled={Boolean(error)}
            className="flex-1 rounded-xl border border-white/25 bg-white px-3 py-2.5 text-sm font-extrabold uppercase tracking-wide text-[#b51218] hover:bg-red-50 disabled:opacity-50"
          >
            {t(language, "ai_camera_capture")}
          </button>
        </div>
      </div>
    </div>
  );
}
