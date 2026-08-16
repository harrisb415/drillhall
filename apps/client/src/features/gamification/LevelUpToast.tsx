import { useEffect, useState } from "react";
import { RankInsignia } from "@/components/ui/rank-insignia";

const STORAGE_KEY = "dh:lastSeenLevel";
const VISIBLE_MS = 5000;

/**
 * Announces a level-up once, the next time the dashboard loads after it
 * happened. XP is awarded server-side across several endpoints, so rather than
 * plumbing a "you levelled up" flag through all of them, this compares the
 * current level against the last one this browser saw.
 *
 * Deliberately silent on first ever load (nothing stored = nothing to compare),
 * and the stored value updates even while hidden so a level-up can't re-fire
 * on every refresh.
 */
export function LevelUpToast({ level }: { level: number }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let previous: number | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      previous = raw === null ? null : Number(raw);
    } catch {
      // Private mode / storage disabled — just never celebrate.
      return;
    }

    if (previous !== null && Number.isFinite(previous) && level > previous) setShown(true);

    try {
      localStorage.setItem(STORAGE_KEY, String(level));
    } catch {
      /* nothing to do */
    }
  }, [level]);

  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(false), VISIBLE_MS);
    return () => clearTimeout(t);
  }, [shown]);

  if (!shown) return null;

  return (
    <div
      role="status"
      className="animate-slide-up fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-50 flex items-center gap-3 rounded-lg border border-primary/40 bg-card p-3 pr-4 shadow-lg"
    >
      <RankInsignia level={level} size={44} />
      <div>
        <div className="text-sm font-semibold">Level {level}</div>
        <div className="text-xs text-muted-foreground">Nice work — keep the streak going.</div>
      </div>
      <button
        type="button"
        onClick={() => setShown(false)}
        aria-label="Dismiss"
        className="ml-1 self-start text-muted-foreground transition-colors hover:text-foreground"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
