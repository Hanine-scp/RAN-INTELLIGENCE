export async function captureScreenshot(): Promise<File> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("SCREENSHOT_UNSUPPORTED");
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: "monitor" },
    audio: false,
  });

  try {
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    await video.play();

    await new Promise<void>((resolve) => {
      if (video.readyState >= 2) resolve();
      else video.onloadeddata = () => resolve();
    });

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("CANVAS_ERROR");
    ctx.drawImage(video, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("BLOB_ERROR"))), "image/png", 0.92);
    });

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return new File([blob], `capture-ecran-${stamp}.png`, { type: "image/png" });
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

export function captureVideoFrame(video: HTMLVideoElement, filename: string): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("CANVAS_ERROR"));
  ctx.drawImage(video, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("BLOB_ERROR"));
          return;
        }
        resolve(new File([blob], filename, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9,
    );
  });
}
