import { cn } from "@/lib/utils";

/**
 * A notched progress bar. Segments make partial progress legible at a glance
 * ("3 of 10" reads faster than a fractional smear), which suits XP better than
 * a continuous fill.
 */
export function SegmentedProgress({
  value,
  segments = 10,
  className,
  barClassName,
  label,
}: {
  value: number;
  segments?: number;
  className?: string;
  barClassName?: string;
  label?: string;
}) {
  const pct = Math.min(100, Math.max(0, value));
  const filledUnits = (pct / 100) * segments;

  return (
    <div
      className={cn("flex h-2.5 w-full gap-[3px]", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      {Array.from({ length: segments }).map((_, i) => {
        // The boundary segment fills partially, so the bar stays precise
        // rather than rounding progress up or down to whole notches.
        const fill = Math.min(1, Math.max(0, filledUnits - i));
        return (
          <div
            key={i}
            className="h-full flex-1 overflow-hidden rounded-[2px] bg-secondary first:rounded-l-full last:rounded-r-full"
          >
            <div
              className={cn(
                "h-full rounded-[2px] bg-primary transition-[width] duration-500 ease-out",
                barClassName,
              )}
              style={{ width: `${fill * 100}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}
