import { useState } from "react";
import type { ExamModeId } from "@comptia/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useExamHistory, useExamOptions, useStartExam } from "@/lib/api";
import { useCert } from "@/lib/cert-context";
import { cn, formatDate } from "@/lib/utils";
import { useExamStore } from "@/stores/exam";

export function ExamSetup() {
  const cert = useCert();
  const { data: options, isPending } = useExamOptions(cert.id);
  const { data: history } = useExamHistory(cert.id);
  const start = useStartExam();
  const begin = useExamStore((s) => s.begin);

  const [selected, setSelected] = useState<ExamModeId>("full");
  const [domains, setDomains] = useState<string[]>([]);

  if (isPending || !options) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  const mode = options.modes.find((m) => m.id === selected)!;
  const short = mode.availableQuestions < mode.questionCount;
  const needsDomains = mode.picksDomains && domains.length === 0;

  function toggleDomain(code: string) {
    setDomains((d) => (d.includes(code) ? d.filter((c) => c !== code) : [...d, code]));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Exam simulator</h1>
        <p className="text-sm text-muted-foreground">
          Timed, no feedback until you submit, scored on {cert.name}'s{" "}
          {options.scaledMin}–{options.scaledMax} scale (pass: {options.passingScaledScore}).
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {options.modes.map((m) => {
          const disabled = m.availableQuestions === 0;
          return (
            <button
              key={m.id}
              type="button"
              disabled={disabled}
              onClick={() => setSelected(m.id)}
              className={cn(
                "rounded-lg border p-4 text-left transition-colors",
                selected === m.id
                  ? "border-primary bg-accent/50"
                  : "border-border bg-card hover:border-ring/50",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{m.name}</span>
                <Badge variant={selected === m.id ? "default" : "secondary"}>
                  {m.availableQuestions}q · {Math.round((m.minutes / m.questionCount) * m.availableQuestions)}m
                </Badge>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{m.description}</p>
            </button>
          );
        })}
      </div>

      {mode.picksDomains && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Choose domains</CardTitle>
            <CardDescription>Questions are spread evenly across what you pick.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {cert.domains.map((d) => (
              <Button
                key={d.code}
                variant={domains.includes(d.code) ? "secondary" : "ghost"}
                size="sm"
                onClick={() => toggleDomain(d.code)}
              >
                {d.code} {d.name}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {short && (
        <div className="rounded-md border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
          The real {cert.name} exam is {options.officialQuestionCount} questions in{" "}
          {options.officialMinutes} minutes. This bank currently holds enough for{" "}
          {mode.availableQuestions}, so the sitting is shortened proportionally. It becomes a
          full-length exam automatically as questions are added.
        </div>
      )}

      {start.isError && <p className="text-sm text-destructive">{(start.error as Error).message}</p>}

      <div className="flex items-center gap-3">
        <Button
          size="lg"
          disabled={start.isPending || needsDomains}
          onClick={() =>
            start.mutate(
              {
                certId: cert.id,
                examMode: selected,
                domainCodes: mode.picksDomains ? domains : undefined,
              },
              { onSuccess: begin },
            )
          }
        >
          {start.isPending ? (
            <Spinner className="size-4 text-primary-foreground" />
          ) : (
            `Start ${mode.name.toLowerCase()}`
          )}
        </Button>
        {needsDomains && (
          <span className="text-xs text-muted-foreground">Pick at least one domain.</span>
        )}
      </div>

      {history && history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Past exams</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {history.map((h) => (
                <li key={h.sessionId} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-muted-foreground">
                    {formatDate(h.startedAt)} · {options.modes.find((m) => m.id === h.examMode)?.name ?? h.examMode}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {h.correct}/{h.total}
                    </span>
                    <Badge variant={h.passed ? "success" : "secondary"}>
                      {h.scaledScore ?? "—"} {h.passed ? "pass" : "fail"}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
