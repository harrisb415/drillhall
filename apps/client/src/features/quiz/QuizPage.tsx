import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { useCompleteSession, useStartSession, useSubmitAttempt } from "@/lib/api";
import { useCert } from "@/lib/cert-context";
import { cn } from "@/lib/utils";
import { useQuizStore } from "@/stores/quiz";

const COUNT_OPTIONS = [5, 10, 20];

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
          Multiple-choice questions from the {cert.name} pool. Answers are graded as you go.
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

  function choose(choiceIndex: number) {
    if (answer || submit.isPending || sessionId === null || !question) return;
    submit.mutate(
      { sessionId, questionId: question.id, choiceIndex },
      { onSuccess: (result) => record(question.id, choiceIndex, result) },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Question {index + 1} of {questions.length}
        </span>
        <Badge variant="accent">
          {question.domainCode} ·{" "}
          {cert.domains.find((d) => d.code === question.domainCode)?.name ?? ""}
        </Badge>
      </div>
      <Progress value={(answeredCount / questions.length) * 100} />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg leading-relaxed">{question.prompt}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {question.choices.map((choice, i) => {
            const isChosen = answer?.choiceIndex === i;
            const isCorrectChoice = answer && answer.answerIndex === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => choose(i)}
                disabled={!!answer || submit.isPending}
                className={cn(
                  "flex w-full items-start gap-3 rounded-md border p-3 text-left text-sm transition-colors",
                  !answer && "border-border bg-card hover:border-ring/60 hover:bg-accent/50",
                  answer && isCorrectChoice && "border-success bg-success/10",
                  answer && isChosen && !isCorrectChoice && "border-destructive bg-destructive/10",
                  answer && !isChosen && !isCorrectChoice && "border-border opacity-60",
                )}
              >
                <span className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {String.fromCharCode(65 + i)}
                </span>
                <span>{choice}</span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {answer && (
        <Card className={answer.correct ? "border-success" : "border-destructive"}>
          <CardContent className="space-y-1 p-4 text-sm">
            <div className={cn("font-semibold", answer.correct ? "text-success" : "text-destructive")}>
              {answer.correct
                ? "Correct"
                : `Incorrect — the answer is ${String.fromCharCode(65 + answer.answerIndex)}`}
            </div>
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
          <Link to="/">
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
