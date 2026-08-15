import { useCallback, useState } from "react";
import type { AttemptAnswer } from "@comptia/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useFlagExamQuestion, useRecordExamAnswer, useSubmitExam } from "@/lib/api";
import { useCert } from "@/lib/cert-context";
import { cn } from "@/lib/utils";
import { useExamStore } from "@/stores/exam";
import { McQuestionView } from "../quiz/questions/McQuestionView";
import { MatchQuestionView } from "../quiz/questions/MatchQuestionView";
import { OrderQuestionView } from "../quiz/questions/OrderQuestionView";
import { TerminalQuestionView } from "../quiz/questions/TerminalQuestionView";
import { ExamTimer } from "./ExamTimer";

const TYPE_LABELS: Record<string, string> = {
  mc: "Multiple choice",
  order: "Ordering",
  match: "Matching",
  terminal: "Terminal",
};

export function ExamRunner() {
  const cert = useCert();
  const { session, index, answers, flagged, goTo, next, prev, setAnswer, setFlag, finish } =
    useExamStore();
  const record = useRecordExamAnswer();
  const flag = useFlagExamQuestion();
  const submit = useSubmitExam(cert.id);
  const [confirming, setConfirming] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const doSubmit = useCallback(() => {
    if (!session || submit.isPending) return;
    submit.mutate(session.sessionId, { onSuccess: finish });
  }, [session, submit, finish]);

  if (!session) return null;
  const question = session.questions[index];
  if (!question) return null;

  const answeredCount = Object.keys(answers).length;
  const isFlagged = flagged.has(question.id);
  // Naming the blank ones beats counting them: "the 3 you left blank" reads as
  // an accusation when you can't tell which 3 it means.
  const unansweredNumbers = session.questions
    .map((q, i) => (answers[q.id] ? null : i + 1))
    .filter((n): n is number => n !== null);

  /**
   * Optimistic, but never dishonest. The palette marks a question answered the
   * moment you act, so if a save fails we must put it back and say so — a
   * question that looks answered but was never received is the worst outcome
   * here, because you only discover it after the clock is gone.
   */
  function submitAnswer(answer: AttemptAnswer) {
    if (!session || !question) return;
    const questionId = question.id;
    const previous = answers[questionId] ?? null;
    setAnswer(questionId, answer);
    setSaveError(null);
    record.mutate(
      { sessionId: session.sessionId, questionId, answer },
      {
        onError: (err) => {
          setAnswer(questionId, previous);
          setSaveError(
            `That answer was NOT saved (${(err as Error).message}). Try again — it is not recorded.`,
          );
        },
      },
    );
  }

  function clearAnswer() {
    if (!session || !question) return;
    const questionId = question.id;
    const previous = answers[questionId] ?? null;
    setAnswer(questionId, null);
    setSaveError(null);
    record.mutate(
      { sessionId: session.sessionId, questionId, answer: null },
      {
        onError: (err) => {
          setAnswer(questionId, previous);
          setSaveError(`Couldn't clear that answer (${(err as Error).message}).`);
        },
      },
    );
  }

  function toggleFlag() {
    if (!session || !question) return;
    const questionId = question.id;
    const nextFlag = !isFlagged;
    setFlag(questionId, nextFlag);
    flag.mutate(
      { sessionId: session.sessionId, questionId, flagged: nextFlag },
      { onError: () => setFlag(questionId, !nextFlag) },
    );
  }

  // `given` only — never `answer`, so the views show the selection without
  // implying anything about correctness.
  const given = answers[question.id];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            {cert.name} — exam in progress
          </h1>
          <p className="text-xs text-muted-foreground">
            {answeredCount} of {session.questions.length} answered · no feedback until you submit
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExamTimer expiresAt={session.expiresAt} onExpire={doSubmit} />
          <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
            Submit exam
          </Button>
        </div>
      </div>

      {saveError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
        >
          <span>{saveError}</span>
          <button
            type="button"
            onClick={() => setSaveError(null)}
            className="shrink-0 font-medium underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* question palette — answered / flagged / current at a glance */}
      <div className="flex flex-wrap gap-1.5">
        {session.questions.map((q, i) => {
          const isAnswered = !!answers[q.id];
          const isMarked = flagged.has(q.id);
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Question ${i + 1}${isAnswered ? ", answered" : ""}${
                isMarked ? ", flagged" : ""
              }`}
              aria-current={i === index}
              className={cn(
                "relative size-8 rounded border text-xs font-medium transition-colors",
                i === index && "ring-2 ring-ring",
                isAnswered
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-ring/60",
              )}
            >
              {i + 1}
              {isMarked && (
                <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-destructive" />
              )}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Filled = answered · red dot = flagged
        {unansweredNumbers.length > 0 && ` · still blank: ${unansweredNumbers.join(", ")}`}
      </p>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              Question {index + 1} of {session.questions.length}
            </span>
            <span className="flex items-center gap-2">
              <Badge variant="secondary">{TYPE_LABELS[question.type]}</Badge>
              <Badge variant="accent">
                {question.domainCode} ·{" "}
                {cert.domains.find((d) => d.code === question.domainCode)?.name ?? ""}
              </Badge>
              <Button
                variant={isFlagged ? "destructive" : "outline"}
                size="sm"
                onClick={toggleFlag}
              >
                {isFlagged ? "Unflag" : "Flag for review"}
              </Button>
            </span>
          </div>
          <CardTitle className="text-lg leading-relaxed">{question.prompt}</CardTitle>
        </CardHeader>
        <CardContent>
          {question.type === "mc" && (
            <McQuestionView question={question} given={given} busy={false} onSubmit={submitAnswer} />
          )}
          {question.type === "order" && (
            <OrderQuestionView
              key={question.id}
              question={question}
              given={given}
              busy={false}
              onSubmit={submitAnswer}
              autoSubmit
            />
          )}
          {question.type === "match" && (
            <MatchQuestionView
              key={question.id}
              question={question}
              given={given}
              busy={false}
              onSubmit={submitAnswer}
              autoSubmit
            />
          )}
          {question.type === "terminal" && (
            <TerminalQuestionView
              key={question.id}
              question={question}
              given={given}
              busy={false}
              onSubmit={submitAnswer}
            />
          )}
          {given && (
            <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
              <span>Answer recorded.</span>
              <button
                type="button"
                onClick={clearAnswer}
                className="font-medium underline underline-offset-2 hover:text-foreground"
              >
                Clear it
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={prev} disabled={index === 0}>
          ← Previous
        </Button>
        <Button
          variant="outline"
          onClick={next}
          disabled={index === session.questions.length - 1}
        >
          Next →
        </Button>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>Submit this exam?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                You answered {answeredCount} of {session.questions.length}.
              </p>
              {unansweredNumbers.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {unansweredNumbers.length === 1 ? "Question" : "Questions"}{" "}
                  <span className="font-medium text-foreground">
                    {unansweredNumbers.join(", ")}
                  </span>{" "}
                  {unansweredNumbers.length === 1 ? "is" : "are"} still blank and will be marked
                  incorrect.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Keep working
                </Button>
                <Button onClick={doSubmit} disabled={submit.isPending}>
                  {submit.isPending ? (
                    <Spinner className="size-4 text-primary-foreground" />
                  ) : (
                    "Submit"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
