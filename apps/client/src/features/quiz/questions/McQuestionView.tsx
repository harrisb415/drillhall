import type { AttemptAnswer, QuizQuestionPublic } from "@comptia/shared-types";
import { cn } from "@/lib/utils";
import type { AnswerRecord } from "@/stores/quiz";

export function McQuestionView({
  question,
  answer,
  busy,
  onSubmit,
}: {
  question: Extract<QuizQuestionPublic, { type: "mc" }>;
  answer: AnswerRecord | undefined;
  busy: boolean;
  onSubmit: (answer: AttemptAnswer) => void;
}) {
  const chosen = answer?.given.type === "mc" ? answer.given.choiceIndex : null;
  const correctIndex = answer?.solution.type === "mc" ? answer.solution.answerIndex : null;

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
            disabled={!!answer || busy}
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
    </div>
  );
}
