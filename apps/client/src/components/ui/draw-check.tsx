import { cn } from "@/lib/utils";

/**
 * A checkmark that draws itself in. The path length is hardcoded to match the
 * `d` below — measured once rather than read at runtime, so there's no layout
 * read on every render. If the path changes, re-measure it.
 */
const PATH = "M20 6 9 17l-5-5";
const PATH_LENGTH = 24;

export function DrawCheck({ className, animate = true }: { className?: string; animate?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-4", className)}
      aria-hidden="true"
    >
      <path
        d={PATH}
        className={animate ? "animate-draw" : undefined}
        style={
          animate
            ? { strokeDasharray: PATH_LENGTH, strokeDashoffset: PATH_LENGTH }
            : undefined
        }
      />
    </svg>
  );
}
