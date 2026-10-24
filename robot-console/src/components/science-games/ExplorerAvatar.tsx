import type { ExplorerProfile } from "@/lib/science-games/progress";

export function ExplorerAvatar({ kind, className }: { kind: ExplorerProfile["avatar"]; className?: string }) {
  return <svg viewBox="0 0 80 80" fill="none" aria-hidden="true" className={className}>
    {kind === "seed" ? <>
      <rect width="80" height="80" rx="24" fill="#e8eadc" />
      <ellipse cx="41" cy="66" rx="18" ry="3" fill="#b8c2a4" fillOpacity=".35" />
      <path d="M40 61V39" stroke="#6c8256" strokeWidth="3" strokeLinecap="round" />
      <path d="M40 46c-18 0-23-10-23-22 14 0 24 4 23 22Z" fill="#91a777" />
      <path d="M40 38c0-15 9-22 23-22 0 15-8 23-23 22Z" fill="#6f8b5c" />
      <path d="m27 34 13 12m12-20L41 37" stroke="#e7edd9" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M33 57h15l-3 10h-9l-3-10Z" fill="#cf9a6e" /><path d="M32 56h17v4H32z" fill="#e2b189" />
    </> : kind === "cloud" ? <>
      <rect width="80" height="80" rx="24" fill="#e2ecee" />
      <path d="M24 53c-14-1-14-21-1-24 2-16 25-18 31-3 15-2 22 20 7 26-6 3-30 2-37 1Z" fill="#fbfcf4" />
      <path d="M30 41v2m18-2v2m-14 6c3 2 6 2 8 0" stroke="#78919b" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m27 63-2 4m16-5-2 5m17-5-2 4" stroke="#88aebd" strokeWidth="3" strokeLinecap="round" />
      <path d="M61 13h7m-3.5-3.5v7" stroke="#90b0b7" strokeWidth="1.5" strokeLinecap="round" />
    </> : <>
      <rect width="80" height="80" rx="24" fill="#eae3d3" />
      <circle cx="40" cy="40" r="20" fill="#d4ab61" />
      <path d="M29 29c4-4 8-6 13-6" stroke="#edcb89" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="40" cy="41" rx="34" ry="10" transform="rotate(-27 40 41)" stroke="#fff9e9" strokeWidth="3" />
      <path d="M34 36v1m13-1v1m-10 8c2 1.5 5 1.5 7 0" stroke="#735f44" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="64" cy="16" r="2" fill="#c9b68b" /><path d="M16 58h6m-3-3v6" stroke="#b9a67c" strokeWidth="1.5" strokeLinecap="round" />
    </>}
  </svg>;
}
