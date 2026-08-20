import { useEffect, useMemo, useState } from "react";
import type { AttemptAnswer, QuizQuestionPublic } from "@comptia/shared-types";
import { Button } from "@/components/ui/button";
import { DrawCheck } from "@/components/ui/draw-check";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { currentAnswer, type QuestionViewProps } from "./types";

const NUMBER_WORDS = ["ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX"];

function selectWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/**
 * Multiple-response ("Select TWO"). Enforces the exact count the way the real
 * exam does: once `selectCount` boxes are checked, the rest are disabled, and
 * the submit button stays disabled until exactly that many are picked.
 * Grading is all-or-nothing, so on reveal every choice is coloured by whether
 * it belonged in the answer set, and each pick by whether it was right.
 */
export function MultiQuestionView({
  question,
  answer,
  given,
  busy,
  onSubmit,
  submitLabel = "Submit",
  autoSubmit,
}: QuestionViewProps<Extract<QuizQuestionPublic, { type: "multi" }>>) {
  const picked = currentAnswer({ answer, given });
  const externalSelection = useMemo(
    () => (picked?.type === "multi" ? picked.choiceIndices : []),
    [picked],
  );

  const [selected, setSelected] = useState<number[]>(externalSelection);
  // Keep in sync when the parent swaps to another question (exam navigation).
  useEffect(() => {
    setSelected(externalSelection);
  }, [question.id, externalSelection]);

  const correctSet = useMemo(
    () =>
      answer?.solution.type === "multi" ? new Set(answer.solution.answerIndices) : null,
    [answer],
  );
  const locked = !!answer || busy;
  const atLimit = selected.length >= question.selectCount;

  function toggle(i: number) {
    if (locked) return;
    setSelected((prev) => {
      const next = prev.includes(i)
        ? prev.filter((x) => x !== i)
        : prev.length < question.selectCount
          ? [...prev, i]
          : prev; // at the cap: ignore additional picks, matching the real exam
      // Exam mode records every change immediately; practice waits for Submit.
      if (autoSubmit && next !== prev) {
        onSubmit({ type: "multi", choiceIndices: next } satisfies AttemptAnswer);
      }
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Select {selectWord(question.selectCount)}
      </p>
      <div className="space-y-2">
        {question.choices.map((choice, i) => {
          const isChosen = selected.includes(i);
          const inAnswer = correctSet?.has(i) ?? false;
          const disabled = locked || (!isChosen && atLimit);
          return (
            <button
              key={i}
              type="button"
              role="checkbox"
              aria-checked={isChosen}
              onClick={() => toggle(i)}
              disabled={disabled}
              className={cn(
                "flex w-full items-start gap-3 rounded-md border p-3 text-left text-sm transition-colors",
                !answer && isChosen && "border-primary bg-accent/60",
                !answer &&
                  !isChosen &&
                  !disabled &&
                  "border-border bg-card hover:border-ring/60 hover:bg-accent/30",
                !answer && disabled && "border-border bg-card opacity-50",
                // reveal: colour by whether the choice belonged in the answer set
                answer && inAnswer && "border-success bg-success/10",
                answer && !inAnswer && isChosen && "border-destructive bg-destructive/10",
                answer && !inAnswer && !isChosen && "border-border opacity-60",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                  isChosen ? "border-primary bg-primary" : "border-muted-foreground/50",
                  answer && inAnswer && "border-success bg-success",
                )}
              >
                {isChosen && !answer && (
                  <span className="size-2 rounded-[1px] bg-primary-foreground" />
                )}
                {answer && inAnswer && <DrawCheck className="size-3 text-success-foreground" />}
              </span>
              <span className="flex-1">{choice}</span>
            </button>
          );
        })}
      </div>
      {!autoSubmit && !answer && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {selected.length} of {question.selectCount} selected
          </span>
          <Button
            disabled={busy || selected.length !== question.selectCount}
            onClick={() => onSubmit({ type: "multi", choiceIndices: selected })}
          >
            {busy ? <Spinner className="size-4 text-primary-foreground" /> : submitLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
