import { Link } from "react-router-dom";
import type { DashboardStats } from "@comptia/shared-types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadialGauge } from "@/components/ui/radial-gauge";

/**
 * Cross-references what's been read against what's actually been proven by a
 * quiz answer — the "go practice, don't re-watch" signal. Deliberately its
 * own card rather than folded into the readiness gauge: reading a lesson
 * isn't evidence of mastery the way a graded answer is, the same call already
 * made for mock exams.
 *
 * Renders nothing when the cert has no course content yet, rather than an
 * empty card — nothing here is a placeholder.
 */
export function CourseProgressCard({ stats }: { stats: DashboardStats }) {
  const { course, quiz } = stats;
  if (course.totalLessons === 0) return null;

  const overallPct = Math.round((course.completedLessons / course.totalLessons) * 100);
  const masteryByCode = new Map(quiz.perDomain.map((d) => [d.code, d]));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-4">
          <RadialGauge
            value={overallPct}
            size={56}
            strokeWidth={5}
            color="var(--primary)"
            label={`${course.completedLessons} of ${course.totalLessons} lessons read`}
          >
            <span className="stat-numeral text-sm font-semibold">{overallPct}%</span>
          </RadialGauge>
          <div>
            <CardTitle className="text-base">Course progress</CardTitle>
            <CardDescription>
              {course.completedLessons} of {course.totalLessons} lessons read
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {course.perDomain.map((d) => {
          const mastery = masteryByCode.get(d.code);
          const studied = d.studiedPercent ?? 0;
          // The signal worth calling out: substantially read, but not yet
          // backed by enough graded answers to call it proven.
          const gap = studied >= 50 && (mastery?.mastery === null || (mastery?.mastery ?? 0) < 60);
          return (
            <div key={d.code} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{d.code}</span>
              <span className="shrink-0 text-right text-xs text-muted-foreground">
                <span className="stat-numeral">{studied}%</span> studied
                {" · "}
                <span className="stat-numeral">{mastery?.mastery ?? "—"}</span>
                {mastery?.mastery !== null && mastery?.mastery !== undefined ? "%" : ""} mastery
                {gap && (
                  <Link
                    to={`/quiz?domain=${d.code}`}
                    className="ml-1.5 text-primary hover:underline"
                  >
                    quiz it →
                  </Link>
                )}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
