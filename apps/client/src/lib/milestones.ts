import { useEffect, useState } from "react";

/**
 * Which achievements are worth a celebration.
 *
 * These are deliberately sparse. Levels arrive fast early on — a level-up
 * every five questions would make confetti meaningless within one sitting —
 * so only milestone levels fire, and ordinary level-ups keep the toast alone.
 */
export const LEVEL_MILESTONES = [5, 10, 25, 50, 100];
export const STREAK_MILESTONES = [7, 30, 100, 365];

/** The highest threshold `value` has reached, or null if it's below all of them. */
export function milestoneFor(value: number, thresholds: readonly number[]): number | null {
  let hit: number | null = null;
  for (const t of thresholds) if (value >= t) hit = t;
  return hit;
}

function readStored(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function write(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* storage disabled — celebrations just won't dedupe */
  }
}

/**
 * Fires once when `value` crosses into a new milestone, and returns which one.
 *
 * Silent on the very first run: with nothing stored there's no way to tell a
 * milestone just reached from one reached months ago, and congratulating
 * someone for a 30-day streak the instant this ships would be nonsense. The
 * first run records where they already are, and celebrates from then on.
 *
 * `enabled` defers the whole thing until the underlying data has actually
 * loaded — otherwise a value of 0 during fetch would be recorded as the
 * baseline and swallow the first real milestone.
 */
export function useMilestone(
  storageKey: string,
  value: number,
  thresholds: readonly number[],
  enabled = true,
): number | null {
  const [reached, setReached] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const key = `dh:ms:${storageKey}`;
    const current = milestoneFor(value, thresholds);
    if (current === null) return;

    const seen = readStored(key);
    if (seen === null) {
      // First run for this browser — establish the baseline silently.
      write(key, current);
      return;
    }
    if (current > seen) {
      write(key, current);
      setReached(current);
    }
  }, [storageKey, value, thresholds, enabled]);

  return reached;
}

/**
 * A one-shot flag for achievements that aren't a rising number — a perfect
 * quiz, finishing a course. `token` uniquely identifies the occurrence (a
 * session id, a cert code + count) so the same event can't re-fire on a
 * remount, but a *different* one still can.
 */
export function useOneShot(storageKey: string, token: string | null): boolean {
  const [fired, setFired] = useState(false);

  useEffect(() => {
    if (!token) return;
    const key = `dh:once:${storageKey}`;
    try {
      if (localStorage.getItem(key) === token) return;
      localStorage.setItem(key, token);
    } catch {
      /* storage disabled — may re-fire on remount, which is survivable */
    }
    setFired(true);
  }, [storageKey, token]);

  return fired;
}
