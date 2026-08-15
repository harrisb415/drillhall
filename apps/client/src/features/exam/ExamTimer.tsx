import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function format(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/**
 * Counts down from the server-issued deadline. The server is the authority —
 * this is display only, and it re-derives from `expiresAt` on every tick so a
 * backgrounded tab doesn't drift.
 */
export function ExamTimer({
  expiresAt,
  onExpire,
}: {
  expiresAt: number;
  onExpire: () => void;
}) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.round((expiresAt - Date.now()) / 1000)),
  );

  useEffect(() => {
    const tick = () => {
      const next = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setRemaining(next);
      if (next <= 0) onExpire();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, onExpire]);

  const urgent = remaining <= 60;
  const warn = remaining <= 300 && !urgent;

  return (
    <div
      role="timer"
      aria-live={urgent ? "assertive" : "off"}
      className={cn(
        "rounded-md border px-3 py-1.5 font-mono text-sm tabular-nums",
        urgent && "border-destructive bg-destructive/10 text-destructive",
        warn && "border-border bg-secondary text-foreground",
        !urgent && !warn && "border-border bg-card text-muted-foreground",
      )}
    >
      {format(remaining)}
    </div>
  );
}
