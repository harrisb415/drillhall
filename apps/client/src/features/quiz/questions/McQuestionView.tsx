import type { QuizQuestionPublic } from "@comptia/shared-types";
import { DrawCheck } from "@/components/ui/draw-check";
import { cn } from "@/lib/utils";
import { currentAnswer, type QuestionViewProps } from "./types";

export function McQuestionView({
  question,
  answer,
  given,
  busy,
  onSubmit,
}: QuestionViewProps<Extract<QuizQuestionPublic, { type: "mc" }>>) {
  const picked = currentAnswer({ answer, given });
  const chosen = picked?.type === "mc" ? picked.choiceIndex : null;
  const correctIndex = answer?.solution.type === "mc" ? answer.solution.answerIndex : null;
  const locked = !!answer || busy;

  return (
    <div className="space-y-2">
      {question.choices.map((choice, i) => {
        const isChosen = chosen === i;
        const isCorrectChoice = correctIndex === i;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSubmit({ type: "mc", choiceIndex: i })}
            disabled={locked}
            aria-pressed={isChosen}
            className={cn(
              "flex w-full items-start gap-3 rounded-md border p-3 text-left text-sm transition-colors",
              // ungraded: show the selection, say nothing about correctness
              !answer && isChosen && "border-primary bg-accent/60",
              !answer && !isChosen && "border-border bg-card hover:border-ring/60 hover:bg-accent/30",
              answer && isCorrectChoice && "border-success bg-success/10",
              // Only the choice you picked yourself pulses — the reveal on a
              // wrong answer shouldn't feel like a reward.
              answer?.correct && isChosen && isCorrectChoice && "animate-pulse-ring",
              answer && isChosen && !isCorrectChoice && "border-destructive bg-destructive/10",
              answer && !isChosen && !isCorrectChoice && "border-border opacity-60",
            )}
          >
            <span className="mt-0.5 font-mono text-xs text-muted-foreground">
              {String.fromCharCode(65 + i)}
            </span>
            <span className="flex-1">{choice}</span>
            {/* Draws itself in on the graded correct answer. */}
            {answer && isCorrectChoice && <DrawCheck className="mt-0.5 size-4 shrink-0 text-success" />}
          </button>
        );
      })}
    </div>
  );
}
