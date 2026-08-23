import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { DashboardStats } from "@comptia/shared-types";

/**
 * How much of the bank has been met, and what that does to the readiness
 * figure sitting above it.
 *
 * This card exists because readiness quietly stops meaning "how ready am I"
 * once a bank is exhausted and starts meaning "how well do I remember these
 * specific questions". Rather than silently damping the score by some invented
 * factor, both real numbers are shown: coverage, and readiness recomputed over
 * each question's first encounter only.
 */
export function BankCoverageCard({ bank, readiness }: {
  bank: DashboardStats["bank"];
  readiness: number | null;
}) {
  const { total, seen, unseen, coverage, highCoverage, firstSeenReadiness, firstSeenAttempts } = bank;

  // Only worth drawing attention to a gap that is both real and measured on
  // enough questions to mean something.
  const gap =
    readiness !== null && firstSeenReadiness !== null && firstSeenAttempts >= 15
      ? readiness - firstSeenReadiness
      : null;
  const notableGap = gap !== null && gap >= 8;

  return (
    <Card className={highCoverage ? "border-dashed" : undefined}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Question bank coverage</CardTitle>
          {highCoverage && (
            <Badge variant="outline" title="Most questions have been seen before">
              mostly seen
            </Badge>
          )}
        </div>
        <CardDescription>
          Readiness is measured on the questions you answer. Once you have met most of them, it
          starts reflecting recall rather than knowledge.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium">
              <span className="stat-numeral">{seen}</span>
              <span className="text-muted-foreground"> of {total} seen</span>
            </span>
            <span className="stat-numeral text-sm font-semibold">{coverage}%</span>
          </div>
          <div role="img" aria-label={`Bank coverage ${coverage} percent`}>
            <Progress value={coverage} />
          </div>
          <p className="text-xs text-muted-foreground">
            {unseen > 0
              ? `${unseen} question${unseen === 1 ? "" : "s"} you have never been asked.`
              : "You have been asked every question in this pack at least once."}
          </p>
        </div>

        {firstSeenReadiness !== null && (
          <div className="rounded-md border border-border bg-secondary/40 p-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">First-encounter readiness</span>
              <span className="stat-numeral text-sm font-semibold">{firstSeenReadiness}%</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {notableGap
                ? `Scored only on the first time you met each question — ${gap} points below your headline
                   ${readiness}%. The gap is the part of your score that is recall rather than knowledge.`
                : `Scored only on the first time you met each question, across ${firstSeenAttempts} question${
                    firstSeenAttempts === 1 ? "" : "s"
                  }. Close to your headline figure, which is a good sign.`}
            </p>
          </div>
        )}

        {unseen > 0 && (
          <div className="flex flex-wrap gap-2">
            <Link to="/quiz?unseen=1">
              <Button size="sm" variant={highCoverage ? "default" : "outline"}>
                Quiz me on unseen questions
              </Button>
            </Link>
            <Link to="/exam?unseen=1">
              <Button size="sm" variant="outline">
                Fresh mock exam
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
