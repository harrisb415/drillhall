import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDeleteExamPlan, useExamPlans, useSaveExamPlan } from "@/lib/api";
import { useCert } from "@/lib/cert-context";

/** Today's date in UTC, matching how the server stores and compares exam dates. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatUtc(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(ms));
}

export function ExamPlanCard({ readinessPercent }: { readinessPercent: number | null }) {
  const cert = useCert();
  const { data: plans } = useExamPlans();
  const savePlan = useSaveExamPlan();
  const deletePlan = useDeleteExamPlan();
  const [date, setDate] = useState("");

  const plan = plans?.find((p) => p.certId === cert.id);

  if (!plan) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Exam date</CardTitle>
          <CardDescription>
            Set the day you're sitting {cert.name} and you'll get reminders as it approaches.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            min={todayUtc()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-auto"
            aria-label="Exam date"
          />
          <Button
            disabled={!date || savePlan.isPending}
            onClick={() => savePlan.mutate({ certId: cert.id, examDate: date })}
          >
            Save date
          </Button>
          {savePlan.isError && (
            <span className="text-sm text-destructive">{(savePlan.error as Error).message}</span>
          )}
        </CardContent>
      </Card>
    );
  }

  const { daysRemaining } = plan;
  const urgent = daysRemaining <= 7;
  const past = daysRemaining < 0;

  // Only worth saying something pointed when we have both numbers.
  let verdict: string | null = null;
  if (!past && readinessPercent !== null) {
    if (readinessPercent >= 85) verdict = "You're tracking well ahead of this date.";
    else if (readinessPercent >= 75) verdict = "You're around the pass mark — keep the weak domains moving.";
    else if (daysRemaining <= 7) verdict = "Readiness is below the pass mark with under a week to go.";
    else verdict = "Readiness is below the pass mark, but there's still time.";
  }

  return (
    <Card className={urgent && !past ? "border-primary" : undefined}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Exam date</CardTitle>
            <CardDescription>{formatUtc(plan.examDate)}</CardDescription>
          </div>
          <Badge variant={past ? "secondary" : urgent ? "default" : "accent"}>
            {past
              ? "date passed"
              : daysRemaining === 0
                ? "today"
                : daysRemaining === 1
                  ? "tomorrow"
                  : `${daysRemaining} days away`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {verdict && <p className="text-sm text-muted-foreground">{verdict}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            min={todayUtc()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-auto"
            aria-label="Change exam date"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!date || savePlan.isPending}
            onClick={() => savePlan.mutate({ certId: cert.id, examDate: date })}
          >
            Change
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={deletePlan.isPending}
            onClick={() => deletePlan.mutate(cert.id)}
          >
            Clear
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
