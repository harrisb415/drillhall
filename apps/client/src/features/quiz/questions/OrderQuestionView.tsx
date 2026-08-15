import { useEffect, useState } from "react";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import type { AttemptAnswer, QuizQuestionPublic } from "@comptia/shared-types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AnswerRecord } from "@/stores/quiz";

export function OrderQuestionView({
  question,
  answer,
  busy,
  onSubmit,
}: {
  question: Extract<QuizQuestionPublic, { type: "order" }>;
  answer: AnswerRecord | undefined;
  busy: boolean;
  onSubmit: (answer: AttemptAnswer) => void;
}) {
  const [items, setItems] = useState<string[]>(question.items);
  useEffect(() => {
    setItems(question.items);
  }, [question.id, question.items]);

  const locked = !!answer || busy;
  const solutionOrder = answer?.solution.type === "order" ? answer.solution.order : null;

  function onDragEnd(result: DropResult) {
    if (!result.destination || locked) return;
    const next = [...items];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved!);
    setItems(next);
  }

  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">
        Drag the steps into the correct order (keyboard: Tab to a step, Space to lift, arrows to
        move, Space to drop), then submit.
      </p>
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId={`order-${question.id}`}>
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
              {items.map((item, i) => {
                const inRightSpot = solutionOrder ? solutionOrder[i] === item : null;
                return (
                  <Draggable key={item} draggableId={item} index={i} isDragDisabled={locked}>
                    {(p, snapshot) => (
                      <div
                        ref={p.innerRef}
                        {...p.draggableProps}
                        {...p.dragHandleProps}
                        className={cn(
                          "flex items-center gap-3 rounded-md border bg-card p-3 text-sm",
                          snapshot.isDragging && "border-ring shadow-lg",
                          !answer && !snapshot.isDragging && "border-border",
                          answer && inRightSpot && "border-success bg-success/10",
                          answer && inRightSpot === false && "border-destructive bg-destructive/10",
                        )}
                      >
                        <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground">
                          {i + 1}.
                        </span>
                        <svg
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="size-4 shrink-0 text-muted-foreground"
                        >
                          <circle cx="9" cy="6" r="1.5" />
                          <circle cx="15" cy="6" r="1.5" />
                          <circle cx="9" cy="12" r="1.5" />
                          <circle cx="15" cy="12" r="1.5" />
                          <circle cx="9" cy="18" r="1.5" />
                          <circle cx="15" cy="18" r="1.5" />
                        </svg>
                        <span>{item}</span>
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
      {!answer && (
        <Button
          className="mt-4"
          disabled={busy}
          onClick={() => onSubmit({ type: "order", order: items })}
        >
          Submit order
        </Button>
      )}
    </div>
  );
}
