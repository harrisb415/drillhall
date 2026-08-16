import { useEffect, useRef, useState } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Counts from 0 to `target` once on mount, so a headline stat lands with a
 * little weight instead of just appearing. Returns `target` immediately when
 * the user has asked for reduced motion, or when there's nothing to count to.
 */
export function useCountUp(target: number | null, durationMs = 750): number | null {
  const [value, setValue] = useState<number | null>(
    target === null || prefersReducedMotion() ? target : 0,
  );
  const frame = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (target === null || prefersReducedMotion()) {
      setValue(target);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // ease-out cubic: fast start, gentle settle
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);

    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, [target, durationMs]);

  return value;
}
