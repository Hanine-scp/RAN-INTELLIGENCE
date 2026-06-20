type NavIconProps = {
  name: string;
  className?: string;
  style?: React.CSSProperties;
};

const PATHS: Record<string, React.ReactNode> = {
  home: <path d="M3 11.5 12 4l9 7.5M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />,
  pin: (
    <>
      <path d="M12 21s7-5.8 7-11a7 7 0 1 0-14 0c0 5.2 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  box: (
    <>
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5Z" />
      <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5M3 16.5 12 21l9-4.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6l-7-3Z" />
      <path d="m9.5 12 1.8 1.8 3.4-3.6" />
    </>
  ),
  pulse: <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />,
  compare: (
    <>
      <path d="M7 4v12a2 2 0 0 0 2 2h4" />
      <path d="m5 6 2-2 2 2" />
      <path d="M17 20V8a2 2 0 0 0-2-2h-4" />
      <path d="m19 18-2 2-2-2" />
    </>
  ),
  bars: (
    <>
      <path d="M4 20V4" />
      <path d="M8 20v-6M13 20V9M18 20v-9" />
    </>
  ),
  trend: (
    <>
      <path d="m3 16 5-5 4 4 8-8" />
      <path d="M16 7h5v5" />
    </>
  ),
  package: (
    <>
      <path d="M21 16V8l-9-5-9 5v8l9 5 9-5Z" />
      <path d="m3.5 7.5 8.5 5 8.5-5M12 12.5V21" />
    </>
  ),
  pie: (
    <>
      <path d="M12 3v9h9" />
      <path d="M21 12a9 9 0 1 1-9-9" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  hash: <path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16" />,
  alert: (
    <>
      <path d="M12 4 2.5 20h19L12 4Z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  scatter: (
    <>
      <circle cx="6" cy="16" r="1.6" />
      <circle cx="10" cy="9" r="1.6" />
      <circle cx="15" cy="14" r="1.6" />
      <circle cx="18" cy="6" r="1.6" />
    </>
  ),
  report: (
    <>
      <path d="M6 3h8l4 4v14H6Z" />
      <path d="M14 3v4h4M9 13h6M9 17h6" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3.5 13.6 9 19 10.5 13.6 12 12 17.5 10.4 12 5 10.5 10.4 9 12 3.5Z" />
      <path d="M18.5 16.5 19 18l1.5.5L19 19l-.5 1.5L18 19l-1.5-.5L18 18Z" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4m0 0L8 8m4-4 4 4" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </>
  ),
};

export function NavIcon({ name, className = "h-5 w-5", style }: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name] ?? PATHS.box}
    </svg>
  );
}
