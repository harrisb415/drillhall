import type { AttemptAnswer } from "@comptia/shared-types";
import type { AnswerRecord } from "@/stores/quiz";

/**
 * Practice and exam mode need the same inputs but differ on one axis: practice
 * grades every answer immediately, an exam stays dark until submit. So grading
 * (`answer`) and selection (`given`) are separate props — an exam passes only
 * `given`, which shows what you picked without implying anything about it.
 */
export interface QuestionViewProps<Q> {
  question: Q;
  /** Grading result. Present in practice mode only; its presence locks the input. */
  answer?: AnswerRecord;
  /** What the candidate currently has selected. */
  given?: AttemptAnswer;
  busy: boolean;
  onSubmit: (answer: AttemptAnswer) => void;
  submitLabel?: string;
  /**
   * Record every rearrangement immediately instead of waiting for a button.
   *
   * Exams use this. Multiple-choice records on click and the terminal records
   * on Enter, so a drag-and-drop question that quietly needs a *second*
   * explicit press is a trap: you arrange it, it looks answered, you move on,
   * and nothing was ever sent. Practice mode leaves it off, because there an
   * answer is graded once and submitting must stay deliberate.
   */
  autoSubmit?: boolean;
}

/** The answer to display, whichever mode we're in. */
export function currentAnswer(props: {
  answer?: AnswerRecord;
  given?: AttemptAnswer;
}): AttemptAnswer | undefined {
  return props.answer?.given ?? props.given;
}
