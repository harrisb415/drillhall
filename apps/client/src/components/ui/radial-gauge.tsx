import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { bandColor, masteryBand } from "@/lib/mastery";

export interface RadialGaugeProps {
  /** 0-100, or null for "no data" (renders the track only). */
  value: number | null;
  size?: number;
  strokeWidth?: number;
  /** 360 = full donut, 270 = classic gauge with a gap at the bottom. */
  sweep?: 360 | 270;
  /** Explicit colour; defaults to the mastery band for `value`. */
  color?: string;
  /** Centre content. Omit for a bare ring. */
  children?: ReactNode;
  className?: string;
  /** Screen-reader description — required, since the ring itself says nothing. */
  label: string;
}

export function RadialGauge({
  value,
  size = 72,
  strokeWidth = 7,
  sweep = 360,
  color,
  children,
  className,
  label,
}: RadialGaugeProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const arc = circumference * (sweep / 360);

  const pct = value === null ? 0 : Math.min(100, Math.max(0, value));
  const stroke = color ?? (value === null ? "var(--muted-foreground)" : bandColor(masteryBand(pct)));

  // SVG circles start at 3 o'clock. -90 puts a full donut's start at the top;
  // 135 centres a 270° gauge's gap at the bottom.
  const rotation = sweep === 360 ? -90 : 135;

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
        <g transform={`rotate(${rotation} ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--secondary)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${arc} ${circumference}`}
          />
          {value !== null && (
            <circle
              className="gauge-arc"
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${arc} ${circumference}`}
              strokeDashoffset={arc * (1 - pct / 100)}
            />
          )}
        </g>
      </svg>
      {children && (
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          {children}
        </div>
      )}
    </div>
  );
}
