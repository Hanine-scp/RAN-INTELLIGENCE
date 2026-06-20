"use client";

/** Fond polygonal rouge Ooredoo — plein écran (login / signup). */
export function OoredooPolyBackground({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-[#8b0f14] ${className}`}>
      <svg className="h-full w-full" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <rect width="1440" height="900" fill="#9f1218" />
        <polygon points="0,0 520,0 280,420 0,320" fill="#c41e24" />
        <polygon points="520,0 1440,0 1440,260 720,180" fill="#b51218" />
        <polygon points="0,320 280,420 420,900 0,900" fill="#7a0e12" />
        <polygon points="280,420 720,180 1100,520 420,900" fill="#d91f28" />
        <polygon points="720,180 1440,260 1440,620 1100,520" fill="#a61015" />
        <polygon points="1100,520 1440,620 1440,900 620,900" fill="#e8272f" />
        <polygon points="420,900 620,900 1100,520 780,700" fill="#c1181f" />
        <polygon points="0,0 280,420 0,320 120,120" fill="#ed1c24" opacity="0.85" />
        <polygon points="900,0 1440,0 1440,120 1050,80" fill="#ff4d55" opacity="0.35" />
        <polygon points="200,500 500,350 650,700 300,800" fill="#ff6b72" opacity="0.25" />
      </svg>
      <div className="absolute inset-0 bg-gradient-to-br from-black/20 via-transparent to-black/30" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_30%,rgba(255,255,255,0.08),transparent_55%)]" />
    </div>
  );
}

/** Accent discret premium — fond clair teal / sky (pages applicatives). */
export function PlatformPolyAccent() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,#ffffff_0%,#fafbfc_50%,#f8fafc_100%)]" />
      <svg
        className="absolute -right-[12%] -top-[8%] h-[min(72vh,680px)] w-[min(90vw,920px)] opacity-[0.05]"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <polygon points="520,0 1440,0 1440,260 720,180" fill="#7ECEC1" />
        <polygon points="720,180 1440,260 1440,620 1100,520" fill="#16A085" />
        <polygon points="1100,520 1440,620 1440,900 620,900" fill="#74B9FF" />
        <polygon points="280,420 720,180 1100,520 420,900" fill="#B8D4C8" />
      </svg>
      <div className="absolute bottom-0 left-0 h-32 w-full bg-gradient-to-t from-teal-50/20 to-transparent" />
    </div>
  );
}
