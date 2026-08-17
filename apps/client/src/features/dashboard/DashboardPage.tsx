import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RadialGauge } from "@/components/ui/radial-gauge";
import { Sparkline } from "@/components/ui/sparkline";
import { Spinner } from "@/components/ui/spinner";
import { CourseProgressCard } from "@/features/course/CourseProgressCard";
import { ExamPlanCard } from "@/features/planner/ExamPlanCard";
import { LevelUpToast } from "@/features/gamification/LevelUpToast";
import { StreakCard } from "@/features/gamification/StreakCard";
import { useDashboard } from "@/lib/api";
import { useCert } from "@/lib/cert-context";
import { BAND_LABEL, bandTextClass, masteryBand } from "@/lib/mastery";
import { useCountUp } from "@/lib/use-count-up";
import { formatDate } from "@/lib/utils";

export function DashboardPage() {
  const cert = useCert();
  const { data, isPending } = useDashboard(cert.id);
  // Called before the loading early-return so hook order stays stable.
  const readinessShown = useCountUp(data?.quiz.readiness ?? null);

  if (isPending || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  const knownPct =
    data.flashcards.total > 0 ? Math.round((data.flashcards.known / data.flashcards.total) * 100) : 0;

  // Both lists arrive newest-first; a trend line reads left-to-right in time.
  const sessionTrend = [...data.recentSessions]
    .reverse()
    .map((s) => s.score)
    .filter((s): s is number => s !== null);
  const examTrend = [...data.exams.recent]
    .reverse()
    .map((e) => e.scaledScore)
    .filter((s): s is number => s !== null);

  return (
    <div className="space-y-6">
      <LevelUpToast level={data.gamification.level} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {cert.name} ({cert.version})
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className={!data.quiz.readinessConfident ? "border-dashed" : undefined}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              Readiness
              {data.quiz.readiness !== null && !data.quiz.readinessConfident && (
                <Badge variant="outline" title="Too few answers so far for this to mean much">
                  low confidence
                </Badge>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-3">
              <RadialGauge
                value={data.quiz.readiness}
                size={80}
                strokeWidth={8}
                sweep={270}
                label={
                  data.quiz.readiness === null
                    ? "Readiness: no data yet"
                    : `Readiness ${data.quiz.readiness} percent`
                }
              >
                <span className="stat-numeral text-xl font-bold">
                  {readinessShown !== null ? readinessShown : "—"}
                  {readinessShown !== null && <span className="text-sm font-semibold">%</span>}
                </span>
              </RadialGauge>
              {data.quiz.readiness !== null && (
                <span
                  className={`text-xs font-medium ${bandTextClass(masteryBand(data.quiz.readiness))}`}
                >
                  {BAND_LABEL[masteryBand(data.quiz.readiness)]}
                </span>
              )}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {data.quiz.readiness === null || data.quiz.readinessConfident
                ? "recency-weighted mastery × exam weights"
                : `Based on very few answers — roughly ${data.quiz.attemptsForConfidence} more would make this trustworthy.`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Quiz accuracy</CardDescription>
            <CardTitle className="stat-numeral text-3xl">
              {data.quiz.accuracy !== null ? `${data.quiz.accuracy}%` : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {data.quiz.correct} of {data.quiz.attempts} questions correct
            </p>
            {sessionTrend.length > 1 && (
              <Sparkline
                values={sessionTrend}
                width={130}
                height={28}
                label={`Scores across your last ${sessionTrend.length} practice sessions`}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Questions answered</CardDescription>
            <CardTitle className="stat-numeral text-3xl">{data.quiz.attempts}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            across {data.recentSessions.length > 0 ? "your sessions" : "no sessions yet"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Flashcards known</CardDescription>
            <CardTitle className="stat-numeral text-3xl">
              {data.flashcards.known}
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                / {data.flashcards.total}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={knownPct} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ExamPlanCard readinessPercent={data.quiz.readiness} />
        <StreakCard stats={data.gamification} />
        <CourseProgressCard stats={data} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Domains</CardTitle>
          <CardDescription>
            Recency-weighted mastery per exam domain — recent answers count more than old ones.
            Weight badges match the official exam breakdown.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          {data.quiz.perDomain.map((d) => (
            // min-w-0: a grid item defaults to min-width:auto and would
            // otherwise refuse to shrink below the domain name, overflowing
            // the viewport on narrow screens despite the truncate below.
            <div key={d.code} className="flex min-w-0 items-center gap-3">
              <RadialGauge
                value={d.mastery}
                size={54}
                strokeWidth={5}
                label={
                  d.mastery === null
                    ? `${d.code} ${d.name}: no data`
                    : `${d.code} ${d.name}: ${d.mastery} percent mastery`
                }
              >
                <span className="stat-numeral text-xs font-semibold">
                  {d.mastery !== null ? d.mastery : "—"}
                </span>
              </RadialGauge>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="min-w-0 truncate text-sm font-medium" title={`${d.code} ${d.name}`}>
                    {d.code} {d.name}
                  </span>
                  <Badge variant="secondary" className="shrink-0">
                    {d.weight}%
                  </Badge>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {d.mastery !== null ? (
                    <>
                      <span className={bandTextClass(masteryBand(d.mastery))}>
                        {BAND_LABEL[masteryBand(d.mastery)]}
                      </span>
                      {" · "}
                      <span className="stat-numeral">{d.attempts}</span> answered
                      {!d.confident && (
                        <span
                          className="ml-1 text-muted-foreground/70"
                          title={`Fewer than ${data.quiz.confidenceThreshold} answers in this domain — treat with caution`}
                        >
                          (thin)
                        </span>
                      )}
                    </>
                  ) : (
                    "no data yet"
                  )}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Mock exams</CardTitle>
              <CardDescription>
                Shown beside readiness rather than folded into it — they measure different things.
              </CardDescription>
            </div>
            <Link to="/exam">
              <Button size="sm">
                {data.exams.attempts === 0 ? "Take a mock exam" : "Take another"}
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {data.exams.attempts === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              No mock exams yet. A timed sitting is the fastest way to find out whether the
              readiness number above is telling you the truth.
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-4">
                <div>
                  <div className="text-xs text-muted-foreground">Last score</div>
                  <div className="flex items-center gap-2">
                    <span className="stat-numeral text-2xl font-bold">
                      {data.exams.lastScaledScore}
                    </span>
                    <Badge variant={data.exams.lastPassed ? "success" : "secondary"}>
                      {data.exams.lastPassed ? "pass" : "fail"}
                    </Badge>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Best score</div>
                  <div className="stat-numeral text-2xl font-bold">
                    {data.exams.bestScaledScore}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    Passed ({data.exams.passingScaledScore} needed)
                  </div>
                  <div className="stat-numeral text-2xl font-bold">
                    {data.exams.passed}
                    <span className="text-base font-normal text-muted-foreground">
                      {" "}
                      / {data.exams.attempts}
                    </span>
                  </div>
                </div>
                {examTrend.length > 1 && (
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Trend{" "}
                      <span className="text-muted-foreground/70">· dashed = pass mark</span>
                    </div>
                    <Sparkline
                      values={examTrend}
                      threshold={data.exams.passingScaledScore}
                      width={130}
                      height={34}
                      className="mt-1"
                      label={`Scaled scores across your last ${examTrend.length} mock exams, against a pass mark of ${data.exams.passingScaledScore}`}
                    />
                  </div>
                )}
              </div>
              <ul className="mt-4 divide-y divide-border border-t border-border">
                {data.exams.recent.map((e) => (
                  <li key={e.sessionId} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-muted-foreground">
                      {formatDate(e.startedAt)} · {e.examMode}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {e.correct}/{e.total}
                      </span>
                      <Badge variant={e.passed ? "success" : "secondary"}>{e.scaledScore}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent practice sessions</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentSessions.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                No quizzes yet.
                <div className="mt-3">
                  <Link to="/quiz">
                    <Button>Start your first quiz</Button>
                  </Link>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {data.recentSessions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-muted-foreground">{formatDate(s.startedAt)}</span>
                    <span>
                      {s.correct}/{s.total}
                      <Badge
                        variant={(s.score ?? 0) >= 70 ? "success" : "secondary"}
                        className="ml-2"
                      >
                        {s.score ?? 0}%
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Keep going</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Link to="/quiz">
              <Button className="w-full">Take a quiz</Button>
            </Link>
            <Link to="/exam">
              <Button variant="secondary" className="w-full">
                Sit a mock exam
              </Button>
            </Link>
            <Link to="/course">
              <Button variant="secondary" className="w-full">
                Read the course
              </Button>
            </Link>
            <Link to="/flashcards">
              <Button variant="secondary" className="w-full">
                Review flashcards
              </Button>
            </Link>
            <Link to="/reference">
              <Button variant="outline" className="w-full">
                Browse reference sheets
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
