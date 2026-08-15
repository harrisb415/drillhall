import { useState } from "react";
import { Link } from "react-router-dom";
import type { AttemptAnswer } from "@comptia/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { useCompleteSession, useStartSession, useSubmitAttempt } from "@/lib/api";
import { useCert } from "@/lib/cert-context";
import { cn } from "@/lib/utils";
import { useQuizStore } from "@/stores/quiz";
import { McQuestionView } from "./questions/McQuestionView";
import { MatchQuestionView } from "./questions/MatchQuestionView";
import { OrderQuestionView } from "./questions/OrderQuestionView";
import { TerminalQuestionView } from "./questions/TerminalQuestionView";

const COUNT_OPTIONS = [5, 10, 20];

const TYPE_LABELS: Record<string, string> = {
  mc: "Multiple choice",
  order: "Ordering",
  match: "Matching",
  terminal: "Terminal",
};

function SetupPhase() {
  const cert = useCert();
  const begin = useQuizStore((s) => s.begin);
  const start = useStartSession();
  const [count, setCount] = useState(10);
  const [domains, setDomains] = useState<string[]>([]);

  function toggleDomain(code: string) {
    setDomains((d) => (d.includes(code) ? d.filter((c) => c !== code) : [...d, code]));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New quiz</CardTitle>
        <CardDescription>
          Questions from the {cert.name} pool — multiple choice plus performance-based (ordering,
          matching, terminal). Graded as you go.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <div className="mb-2 text-sm font-medium">Questions</div>
          <div className="flex gap-2">
            {COUNT_OPTIONS.map((n) => (
              <Button
                key={n}
                variant={count === n ? "default" : "outline"}
                size="sm"
                onClick={() => setCount(n)}
              >
                {n}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-sm font-medium">Domains (all when none selected)</div>
          <div className="flex flex-wrap gap-2">
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
          </div>
        </div>
        {start.isError && (
          <p className="text-sm text-destructive">{(start.error as Error).message}</p>
        )}
        <Button
          size="lg"
          disabled={start.isPending}
          onClick={() =>
            start.mutate(
              { certId: cert.id, count, domainCodes: domains.length ? domains : undefined },
              { onSuccess: begin },
            )
          }
        >
          {start.isPending ? <Spinner className="size-4 text-primary-foreground" /> : "Start quiz"}
        </Button>
      </CardContent>
    </Card>
  );
}

function PlayingPhase() {
  const cert = useCert();
  const { sessionId, questions, index, answers, advance, record, finish } = useQuizStore();
  const submit = useSubmitAttempt();
  const complete = useCompleteSession(cert.id);

  const question = questions[index];
  if (!question || sessionId === null) return null;
  const answer = answers[question.id];
  const answeredCount = Object.keys(answers).length;
  const isLast = index === questions.length - 1;

  function submitAnswer(given: AttemptAnswer) {
    if (answer || submit.isPending || sessionId === null || !question) return;
    submit.mutate(
      { sessionId, questionId: question.id, answer: given },
      { onSuccess: (result) => record(question.id, given, result) },
    );
  }

  const viewProps = { answer, busy: submit.isPending, onSubmit: submitAnswer } as const;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Question {index + 1} of {questions.length}
        </span>
        <span className="flex items-center gap-2">
          <Badge variant="secondary">{TYPE_LABELS[question.type]}</Badge>
          <Badge variant="accent">
            {question.domainCode} ·{" "}
            {cert.domains.find((d) => d.code === question.domainCode)?.name ?? ""}
          </Badge>
        </span>
      </div>
      <Progress value={(answeredCount / questions.length) * 100} />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg leading-relaxed">{question.prompt}</CardTitle>
        </CardHeader>
        <CardContent>
          {question.type === "mc" && <McQuestionView question={question} {...viewProps} />}
          {question.type === "order" && <OrderQuestionView question={question} {...viewProps} />}
          {question.type === "match" && <MatchQuestionView question={question} {...viewProps} />}
          {question.type === "terminal" && (
            <TerminalQuestionView question={question} {...viewProps} />
          )}
        </CardContent>
      </Card>

      {answer && (
        <Card className={answer.correct ? "border-success" : "border-destructive"}>
          <CardContent className="space-y-2 p-4 text-sm">
            <div className={cn("font-semibold", answer.correct ? "text-success" : "text-destructive")}>
              {answer.correct ? "Correct" : "Incorrect"}
            </div>
            {!answer.correct && answer.solution.type === "order" && (
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                {answer.solution.order.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            )}
            {!answer.correct && answer.solution.type === "match" && (
              <ul className="space-y-1 text-muted-foreground">
                {answer.solution.pairs.map((p) => (
                  <li key={p.left}>
                    <span className="font-medium text-foreground">{p.left}</span> — {p.right}
                  </li>
                ))}
              </ul>
            )}
            {answer.solution.type === "terminal" && (
              <p className="font-mono text-xs text-muted-foreground">
                Expected: {answer.solution.expected.join("  or  ")}
              </p>
            )}
            <p className="text-muted-foreground">{answer.explanation}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        {answer &&
          (isLast ? (
            <Button
              disabled={complete.isPending}
              onClick={() => complete.mutate(sessionId, { onSuccess: finish })}
            >
              {complete.isPending ? (
                <Spinner className="size-4 text-primary-foreground" />
              ) : (
                "Finish quiz"
              )}
            </Button>
          ) : (
            <Button onClick={advance}>Next question</Button>
          ))}
      </div>
    </div>
  );
}

function SummaryPhase() {
  const { summary, reset } = useQuizStore();
  if (!summary) return null;

  return (
    <Card>
      <CardHeader className="items-center text-center">
        <CardDescription>Session complete</CardDescription>
        <CardTitle className="text-5xl">{summary.score}%</CardTitle>
        <CardDescription>
          {summary.correct} of {summary.total} correct
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary.perDomain.map((d) => (
          <div key={d.code}>
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-medium">
                {d.code} {d.name}
              </span>
              <span className="text-muted-foreground">
                {d.correct}/{d.total}
              </span>
            </div>
            <Progress value={d.total > 0 ? (d.correct / d.total) * 100 : 0} />
          </div>
        ))}
        <div className="flex justify-center gap-2 pt-2">
          <Button onClick={reset}>New quiz</Button>
          <Link to="/dashboard">
            <Button variant="outline">View dashboard</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export function QuizPage() {
  const phase = useQuizStore((s) => s.phase);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Quiz</h1>
      {phase === "setup" && <SetupPhase />}
      {phase === "playing" && <PlayingPhase />}
      {phase === "summary" && <SummaryPhase />}
    </div>
  );
}
