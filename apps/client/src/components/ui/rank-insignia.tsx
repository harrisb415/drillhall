import { cn } from "@/lib/utils";

/**
 * A rank badge for the current level. The numeral is always shown exactly —
 * the insignia is reinforcement, not a puzzle the user has to decode. Chevrons
 * mark every fifth level, so long-term progress stays visible after the
 * numeral stops feeling novel.
 */
export interface RankInsigniaProps {
  level: number;
  size?: number;
  className?: string;
}

const HEX = "M24 2 L4.95 13 L4.95 35 L24 46 L43.05 35 L43.05 13 Z";

export function RankInsignia({ level, size = 56, className }: RankInsigniaProps) {
  const chevrons = Math.min(Math.floor((level - 1) / 5), 4);

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Level ${level}`}
    >
      <svg width={size} height={size} viewBox="0 0 48 48" className="block">
        <path d={HEX} fill="var(--accent)" stroke="var(--primary)" strokeWidth={2} />
        <path d={HEX} fill="none" stroke="var(--primary)" strokeWidth={1} opacity={0.35}
          transform="translate(24 24) scale(0.84) translate(-24 -24)" />
        {Array.from({ length: chevrons }).map((_, i) => (
          <path
            key={i}
            d={`M17 ${38 - i * 3.4} L24 ${34.5 - i * 3.4} L31 ${38 - i * 3.4}`}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.9}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="stat-numeral font-bold text-accent-foreground"
          style={{ fontSize: size * 0.34, marginTop: chevrons > 0 ? -size * 0.08 : 0 }}
        >
          {level}
        </span>
      </div>
    </div>
  );
}
