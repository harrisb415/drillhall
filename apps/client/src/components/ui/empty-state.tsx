import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Empty states were the barest surface in the app — a line of grey text where
 * someone's first-ever visit lands. The illustrations are deliberately loose
 * line art in the brass palette: enough to make the space feel designed, not
 * so much that they compete with the call to action underneath.
 */
export type EmptyArt = "quiz" | "exam" | "course" | "search";

function Art({ kind }: { kind: EmptyArt }) {
  const common = {
    fill: "none",
    stroke: "var(--primary)",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg viewBox="0 0 120 90" className="h-24 w-32" aria-hidden="true">
      {/* Shared ground line, so the set feels like one family. */}
      <path d="M18 76h84" stroke="var(--border)" strokeWidth="2" strokeLinecap="round" />
      {kind === "quiz" && (
        <g {...common}>
          <rect x="34" y="20" width="52" height="46" rx="4" fill="var(--accent)" />
          <path d="M46 36h28M46 45h28M46 54h16" />
          <circle cx="86" cy="26" r="11" fill="var(--card)" />
          <path d="M83 23.5a3 3 0 1 1 3 3.4v1.3" />
          <path d="M86 31.5h.01" strokeWidth={2.2} />
        </g>
      )}
      {kind === "exam" && (
        <g {...common}>
          <rect x="30" y="18" width="46" height="48" rx="4" fill="var(--accent)" />
          <path d="M40 32h26M40 42h26M40 52h14" />
          <circle cx="86" cy="52" r="14" fill="var(--card)" />
          <path d="M86 45v7l4.5 4.5" />
        </g>
      )}
      {kind === "course" && (
        <g {...common}>
          <path d="M26 26h26a6 6 0 0 1 6 6v34a6 6 0 0 0-6-6H26z" fill="var(--accent)" />
          <path d="M94 26H68a6 6 0 0 0-6 6v34a6 6 0 0 1 6-6h26z" fill="var(--card)" />
          <path d="M60 32v34" />
        </g>
      )}
      {kind === "search" && (
        <g {...common}>
          <circle cx="54" cy="40" r="20" fill="var(--accent)" />
          <path d="M68.5 54.5 84 70" strokeWidth={2.5} />
        </g>
      )}
    </svg>
  );
}

export function EmptyState({
  art,
  title,
  description,
  action,
  className,
}: {
  art: EmptyArt;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 py-10 text-center", className)}>
      <Art kind={art} />
      <p className="text-base font-medium">{title}</p>
      {description && (
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
