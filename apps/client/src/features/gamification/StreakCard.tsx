import type { GamificationDto } from "@comptia/shared-types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Confetti, type ConfettiIntensity } from "@/components/ui/confetti";
import { RankInsignia } from "@/components/ui/rank-insignia";
import { SegmentedProgress } from "@/components/ui/segmented-progress";
import { StreakFlame } from "@/components/ui/streak-flame";
import { LEVEL_MILESTONES, STREAK_MILESTONES, useMilestone } from "@/lib/milestones";

function nextMilestone(streak: number): number | null {
  return STREAK_MILESTONES.find((m) => m > streak) ?? null;
}

/** How big the burst reads for each threshold — later ones escalate. */
const STREAK_INTENSITY: Record<number, ConfettiIntensity> = {
  7: "small",
  30: "medium",
  100: "large",
  365: "large",
};
const LEVEL_INTENSITY: Record<number, ConfettiIntensity> = {
  5: "small",
  10: "small",
  25: "medium",
  50: "medium",
  100: "large",
};

export function StreakCard({ stats }: { stats: GamificationDto }) {
  const pct = stats.xpForNextLevel > 0 ? (stats.xpIntoLevel / stats.xpForNextLevel) * 100 : 0;
  const upcoming = nextMilestone(stats.currentStreak);
  const atRisk = stats.currentStreak > 0 && !stats.activeToday;

  // Streak takes priority if both land on the same load — it's the rarer event.
  const streakHit = useMilestone("streak", stats.currentStreak, STREAK_MILESTONES);
  const levelHit = useMilestone("level", stats.level, LEVEL_MILESTONES);
  const celebrating = streakHit !== null || levelHit !== null;
  const intensity =
    streakHit !== null
      ? STREAK_INTENSITY[streakHit]
      : levelHit !== null
        ? LEVEL_INTENSITY[levelHit]
        : "medium";

  return (
    <Card>
      <Confetti active={celebrating} intensity={intensity} />
      <CardHeader>
        <div className="flex items-start gap-4">
          <RankInsignia level={stats.level} />
          <div className="min-w-0">
            <CardTitle>Level {stats.level}</CardTitle>
            <CardDescription>
              <span className="stat-numeral font-medium text-foreground">
                {stats.xp.toLocaleString()}
              </span>{" "}
              XP total — counted across every certification, since this tracks the habit rather
              than one exam.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
            <span>Progress to level {stats.level + 1}</span>
            <span className="stat-numeral">
              {stats.xpIntoLevel} / {stats.xpForNextLevel} XP
            </span>
          </div>
          <SegmentedProgress
            value={pct}
            label={`${stats.xpIntoLevel} of ${stats.xpForNextLevel} XP toward level ${stats.level + 1}`}
          />
        </div>

        <div className="flex items-center gap-4 border-t border-border pt-4">
          <StreakFlame days={stats.currentStreak} atRisk={atRisk} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="stat-numeral text-2xl font-bold">{stats.currentStreak}</span>
              <span className="text-sm text-muted-foreground">
                day{stats.currentStreak === 1 ? "" : "s"}
              </span>
              {stats.longestStreak > stats.currentStreak && (
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  best <span className="stat-numeral font-medium">{stats.longestStreak}</span>
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {stats.activeToday
                ? upcoming
                  ? `Today counts. ${upcoming - stats.currentStreak} more to reach ${upcoming}.`
                  : "Today already counts — the streak is safe."
                : stats.currentStreak > 0
                  ? "Answer one question today to keep the streak alive."
                  : "Answer a question to start a streak. Studying is what counts, not signing in."}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
