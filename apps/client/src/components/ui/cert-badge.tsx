import { cn } from "@/lib/utils";

/**
 * A per-certification mark. Each is a shield carrying an emblem drawn from
 * that exam's actual subject — a chip for hardware, a node graph for
 * networking, a lock for security — so the switcher reads at a glance instead
 * of being four identical rows of text.
 *
 * Unknown codes fall back to the generic shield rather than rendering nothing.
 */
const EMBLEMS: Record<string, React.ReactNode> = {
  // A+ Core 1 — hardware: a chip with legs
  aplus: (
    <>
      <rect x="9" y="9" width="6" height="6" rx="1" />
      <path d="M12 6V9M12 15v3M6 12h3M15 12h3M9.5 6.5V9M14.5 6.5V9M9.5 15v2.5M14.5 15v2.5" />
    </>
  ),
  // A+ Core 2 — software: a window
  "aplus-core2": (
    <>
      <rect x="6.5" y="7.5" width="11" height="9" rx="1.2" />
      <path d="M6.5 10.5h11M8.8 9h.01M10.6 9h.01" />
    </>
  ),
  // Network+ — a node graph
  netplus: (
    <>
      <circle cx="12" cy="7.5" r="1.6" />
      <circle cx="7.5" cy="15.5" r="1.6" />
      <circle cx="16.5" cy="15.5" r="1.6" />
      <path d="M12 9.1v2.4M10.9 12.6 8.8 14.4M13.1 12.6l2.1 1.8" />
    </>
  ),
  // Security+ — a padlock
  secplus: (
    <>
      <rect x="8" y="11" width="8" height="6.5" rx="1.2" />
      <path d="M9.8 11V9.3a2.2 2.2 0 0 1 4.4 0V11" />
    </>
  ),
};

export function CertBadge({
  code,
  size = 28,
  className,
}: {
  code: string;
  size?: number;
  className?: string;
}) {
  const emblem = EMBLEMS[code];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <path
        d="M12 2.5 20 5.4v6.1c0 4.8-3.4 8.3-8 9.9-4.6-1.6-8-5.1-8-9.9V5.4z"
        fill="var(--accent)"
        stroke="var(--primary)"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <g
        fill="none"
        stroke="var(--primary)"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {emblem ?? <circle cx="12" cy="12" r="3" />}
      </g>
    </svg>
  );
}
