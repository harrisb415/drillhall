import { cn } from "@/lib/utils";

/**
 * A flame that visibly grows with the streak, so "12 days" reads as an
 * achievement at a glance instead of as a number you have to compare against
 * a number you no longer remember.
 */
export interface StreakFlameProps {
  days: number;
  size?: number;
  /** Dimmed when today hasn't counted yet — the streak is alive but at risk. */
  atRisk?: boolean;
  className?: string;
}

type Tier = { scale: number; color: string; core: boolean };

function tierFor(days: number): Tier {
  if (days === 0) return { scale: 0.82, color: "var(--muted-foreground)", core: false };
  if (days < 3) return { scale: 0.88, color: "var(--developing)", core: false };
  if (days < 7) return { scale: 0.96, color: "var(--developing)", core: false };
  if (days < 30) return { scale: 1.04, color: "var(--primary)", core: true };
  return { scale: 1.12, color: "var(--primary)", core: true };
}

// Lucide's flame outline, on a 24×24 canvas.
const FLAME =
  "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z";

export function StreakFlame({ days, size = 40, atRisk = false, className }: StreakFlameProps) {
  const tier = tierFor(days);
  const lit = days > 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cn(lit && "animate-flicker", atRisk && "opacity-55", className)}
      role="img"
      aria-label={
        days === 0
          ? "No active streak"
          : `${days} day streak${atRisk ? ", not yet extended today" : ""}`
      }
      style={{ transform: `scale(${tier.scale})` }}
    >
      <path
        d={FLAME}
        fill={lit ? tier.color : "none"}
        stroke={tier.color}
        strokeWidth={lit ? 0 : 1.6}
        strokeLinejoin="round"
        opacity={lit ? 0.92 : 0.65}
      />
      {/* A hot core appears once the streak is genuinely established. */}
      {tier.core && (
        <path
          d={FLAME}
          fill="var(--accent-foreground)"
          opacity={0.5}
          transform="translate(12 15) scale(0.42) translate(-12 -13.5)"
        />
      )}
    </svg>
  );
}
