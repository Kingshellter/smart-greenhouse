// Ikon garis sederhana (24×24, stroke), dipakai di samping label sensor & aktuator.

const PATHS = {
  soil: (
    <>
      <path d="M12 20v-7" />
      <path d="M12 13c0-3.3-2.4-5.5-6.5-5.5 0 3.3 2.4 5.5 6.5 5.5z" />
      <path d="M12 11c0-3.3 2.4-5.5 6.5-5.5 0 3.3-2.4 5.5-6.5 5.5z" />
      <path d="M4 20h16" />
    </>
  ),
  temp: (
    <>
      <path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z" />
      <path d="M12 9v7" />
    </>
  ),
  humidity: (
    <>
      <path d="M12 3.5s-5.5 6-5.5 10.2a5.5 5.5 0 0 0 11 0C17.5 9.5 12 3.5 12 3.5z" />
      <path d="M9.5 14.5a2.6 2.6 0 0 0 2.5 2.5" />
    </>
  ),
  pump: (
    <>
      <path d="M3 9.5c1.5-1.4 3-1.4 4.5 0s3 1.4 4.5 0 3-1.4 4.5 0 3 1.4 4.5 0" />
      <path d="M3 14.5c1.5-1.4 3-1.4 4.5 0s3 1.4 4.5 0 3-1.4 4.5 0 3 1.4 4.5 0" />
    </>
  ),
  lid: (
    <>
      <rect x="3.5" y="10" width="17" height="10" rx="1.5" />
      <path d="M3.5 6.5 19 3.5" />
    </>
  ),
  mode: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" />
    </>
  ),
  tank: (
    <>
      <path d="M9 3h6M10 3v3.5L7.5 9v10a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2V9L14 6.5V3" />
      <path d="M7.5 13.5h9" />
    </>
  ),
  wifi: (
    <>
      <path d="M4 9.5a12 12 0 0 1 16 0" />
      <path d="M7 13a7.5 7.5 0 0 1 10 0" />
      <path d="M10 16.5a3 3 0 0 1 4 0" />
      <circle cx="12" cy="19.5" r="0.6" fill="currentColor" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  chevron: <path d="m9 6 6 6-6 6" />,
  edit: (
    <>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  wrench: <path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 0-5-5l2.5 2.5-1 2-2 1z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5" />
      <path d="M12 7.8v.01" />
    </>
  ),
  lock: (
    <>
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}
