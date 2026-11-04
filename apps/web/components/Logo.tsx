import Link from "next/link";
import { useId } from "react";

/** The NetAffil mark: an "N" drawn as a path between two nodes, on a blue-to-navy tile. */
export function LogoMark({ className = "mark" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2463EB" />
          <stop offset="1" stopColor="#29294E" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#g${id})`} />
      <path d="M12 28V12l16 16V12" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="28" cy="12" r="4" fill="#F28A00" stroke="#fff" strokeWidth="1.6" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="brand" aria-label="NetAffil home">
      <LogoMark />
      <span>Net<b>Affil</b></span>
    </Link>
  );
}
