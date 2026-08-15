import { useEffect, useState } from "react";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import type { AttemptAnswer, QuizQuestionPublic } from "@comptia/shared-types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AnswerRecord } from "@/stores/quiz";

export function MatchQuestionView({
  question,
  answer,
  busy,
  onSubmit,
}: {
  question: Extract<QuizQuestionPublic, { type: "match" }>;
  answer: AnswerRecord | undefined;
  busy: boolean;
  onSubmit: (answer: AttemptAnswer) => void;
}) {
  const [rights, setRights] = useState<string[]>(question.rights);
  useEffect(() => {
    setRights(question.rights);
  }, [question.id, question.rights]);

  const locked = !!answer || busy;
  const solutionPairs = answer?.solution.type === "match" ? answer.solution.pairs : null;

  function onDragEnd(result: DropResult) {
    if (!result.destination || locked) return;
    const next = [...rights];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved!);
    setRights(next);
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
      {!answer && (
        <Button
          className="mt-4"
          disabled={busy}
          onClick={() =>
            onSubmit({
              type: "match",
              pairs: Object.fromEntries(question.lefts.map((left, i) => [left, rights[i]!])),
            })
          }
        >
          Submit matches
        </Button>
      )}
    </div>
  );
}
