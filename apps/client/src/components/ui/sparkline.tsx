import { cn } from "@/lib/utils";

export interface SparklineProps {
  /** Oldest first. Fewer than 2 points renders a single dot (or nothing). */
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  /** Draws a dashed reference line (e.g. the exam pass mark). */
  threshold?: number;
  className?: string;
  label: string;
}

export function Sparkline({
  values,
  width = 120,
  height = 32,
  color = "var(--primary)",
  threshold,
  className,
  label,
}: SparklineProps) {
  if (values.length === 0) return null;

  const pad = 3;
  // The threshold joins the domain so the reference line can't fall off-chart.
  const domain = threshold === undefined ? values : [...values, threshold];
  const min = Math.min(...domain);
  const max = Math.max(...domain);
  const span = max - min || 1;

  const x = (i: number) =>
    values.length === 1 ? width / 2 : pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);

  const last = values[values.length - 1]!;
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("block overflow-visible", className)}
      role="img"
      aria-label={label}
    >
      {threshold !== undefined && (
        <line
          x1={0}
          x2={width}
          y1={y(threshold)}
          y2={y(threshold)}
          stroke="var(--muted-foreground)"
          strokeWidth={1}
          strokeDasharray="3 3"
          opacity={0.5}
        />
      )}
      {values.length > 1 && (
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {/* The newest point is the one being read, so it gets the emphasis. */}
      <circle cx={x(values.length - 1)} cy={y(last)} r={2.75} fill={color} />
    </svg>
  );
}
