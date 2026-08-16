import type { GamificationDto } from "@comptia/shared-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export function StreakCard({ stats }: { stats: GamificationDto }) {
  const pct =
    stats.xpForNextLevel > 0 ? (stats.xpIntoLevel / stats.xpForNextLevel) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Level {stats.level}</CardTitle>
            <CardDescription>
              {stats.xp.toLocaleString()} XP total — counted across every certification, since
              this tracks the habit rather than one exam.
            </CardDescription>
          </div>
          <Badge variant={stats.activeToday ? "success" : "secondary"}>
            {stats.currentStreak === 0
              ? "no streak yet"
              : `${stats.currentStreak} day${stats.currentStreak === 1 ? "" : "s"}`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Progress to level {stats.level + 1}</span>
            <span>
              {stats.xpIntoLevel} / {stats.xpForNextLevel} XP
            </span>
          </div>
          <Progress value={pct} />
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-border pt-3">
          <div>
            <div className="text-xs text-muted-foreground">Current streak</div>
            <div className="text-2xl font-bold tabular-nums">{stats.currentStreak}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Longest streak</div>
            <div className="text-2xl font-bold tabular-nums">{stats.longestStreak}</div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {stats.activeToday
            ? "Today already counts — the streak is safe."
            : stats.currentStreak > 0
              ? "Answer one question today to keep the streak alive."
              : "Answer a question to start a streak. Studying is what counts, not signing in."}
        </p>
      </CardContent>
    </Card>
  );
}
