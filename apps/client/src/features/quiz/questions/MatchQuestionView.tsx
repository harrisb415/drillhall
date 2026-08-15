import { useEffect, useState } from "react";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import type { QuizQuestionPublic } from "@comptia/shared-types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { currentAnswer, type QuestionViewProps } from "./types";

export function MatchQuestionView({
  question,
  answer,
  given,
  busy,
  onSubmit,
  submitLabel = "Submit matches",
  autoSubmit = false,
}: QuestionViewProps<Extract<QuizQuestionPublic, { type: "match" }>>) {
  const picked = currentAnswer({ answer, given });

  /** Rebuilds the right-column order from a previously submitted mapping. */
  function ordered(): string[] {
    if (picked?.type !== "match") return question.rights;
    const fromAnswer = question.lefts.map((l) => picked.pairs[l]);
    return fromAnswer.every((r): r is string => typeof r === "string")
      ? fromAnswer
      : question.rights;
  }

  const [rights, setRights] = useState<string[]>(ordered);
  useEffect(() => {
    setRights(ordered());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id]);

  const locked = !!answer || busy;
  const solutionPairs = answer?.solution.type === "match" ? answer.solution.pairs : null;
  const dirty =
    picked?.type !== "match" ||
    question.lefts.some((l, i) => picked.pairs[l] !== rights[i]);

  function pairsFor(order: string[]) {
    return Object.fromEntries(question.lefts.map((left, i) => [left, order[i]!]));
  }

  function onDragEnd(result: DropResult) {
    if (!result.destination || locked) return;
    const next = [...rights];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved!);
    setRights(next);
    if (autoSubmit) onSubmit({ type: "match", pairs: pairsFor(next) });
  }

  function rowCorrect(i: number): boolean | null {
    if (!solutionPairs) return null;
    const left = question.lefts[i];
    return solutionPairs.find((p) => p.left === left)?.right === rights[i];
  }

  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">
        Drag the right-hand answers until each number lines up with its match, then submit.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          {question.lefts.map((left, i) => (
            <div
              key={left}
              className="flex min-h-16 items-center gap-3 rounded-md border border-border bg-secondary/60 p-3 text-sm font-medium"
            >
              <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground">{i + 1}.</span>
              {left}
            </div>
          ))}
        </div>
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId={`match-${question.id}`}>
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                {rights.map((right, i) => {
                  const ok = rowCorrect(i);
                  return (
                    <Draggable key={right} draggableId={right} index={i} isDragDisabled={locked}>
                      {(p, snapshot) => (
                        <div
                          ref={p.innerRef}
                          {...p.draggableProps}
                          {...p.dragHandleProps}
                          className={cn(
                            "flex min-h-16 items-center gap-3 rounded-md border bg-card p-3 text-sm",
                            snapshot.isDragging && "border-ring shadow-lg",
                            !answer && !snapshot.isDragging && "border-border",
                            answer && ok && "border-success bg-success/10",
                            answer && ok === false && "border-destructive bg-destructive/10",
                          )}
                        >
                          <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground">
                            {i + 1}.
                          </span>
                          <span>{right}</span>
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>
      {!answer &&
        (autoSubmit ? (
          <p className="mt-4 text-xs text-muted-foreground">
            {picked?.type === "match"
              ? "Saved — these pairings are recorded. Drag again to change them."
              : "Your pairings are recorded automatically as you drag."}
          </p>
        ) : (
          <Button
            className="mt-4"
            disabled={busy || !dirty}
            onClick={() => onSubmit({ type: "match", pairs: pairsFor(rights) })}
          >
            {dirty ? submitLabel : "Matches saved"}
          </Button>
        ))}
    </div>
  );
}
