import type { QuizQuestion } from "@comptia/content";
import type { AttemptAnswer, QuizQuestionPublic, Solution } from "@comptia/shared-types";

export function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** Shuffle that never returns the input order (so PBQs don't arrive pre-solved). */
function shuffleAvoidingIdentity(items: string[]): string[] {
  const out = shuffle(items);
  if (items.length > 1 && out.every((v, i) => v === items[i])) {
    return [...out.slice(1), out[0]!];
  }
  return out;
}

/**
 * How one question was arranged on screen: the shuffled order of an `order`
 * question's items, or of a `match` question's right column.
 *
 * Exams persist this so a reload redisplays the exact same arrangement.
 * Rescrambling a question you were partway through is disorienting at best,
 * and during a timed sitting it destroys work.
 */
export interface QuestionLayout {
  items?: string[];
  rights?: string[];
}

export function buildLayout(q: QuizQuestion): QuestionLayout {
  switch (q.type) {
    case "order":
      return { items: shuffleAvoidingIdentity(q.items) };
    case "match":
      return { rights: shuffleAvoidingIdentity(q.pairs.map((p) => p.right)) };
    default:
      return {};
  }
}

/**
 * Strips answers and explanations. Pass a `layout` to reuse a previously
 * served arrangement; omit it to shuffle fresh (practice mode, which never
 * resumes a session).
 */
export function toPublicQuestion(q: QuizQuestion, layout?: QuestionLayout): QuizQuestionPublic {
  switch (q.type) {
    case "mc":
      return { id: q.id, domainCode: q.domainCode, type: "mc", prompt: q.prompt, choices: q.choices };
    case "multi":
      return {
        id: q.id,
        domainCode: q.domainCode,
        type: "multi",
        prompt: q.prompt,
        choices: q.choices,
        selectCount: q.answerIndices.length,
      };
    case "order":
      return {
        id: q.id,
        domainCode: q.domainCode,
        type: "order",
        prompt: q.prompt,
        items: layout?.items ?? shuffleAvoidingIdentity(q.items),
      };
    case "match":
      return {
        id: q.id,
        domainCode: q.domainCode,
        type: "match",
        prompt: q.prompt,
        lefts: q.pairs.map((p) => p.left),
        rights: layout?.rights ?? shuffleAvoidingIdentity(q.pairs.map((p) => p.right)),
      };
    case "terminal":
      return { id: q.id, domainCode: q.domainCode, type: "terminal", prompt: q.prompt };
  }
}

export function solutionFor(q: QuizQuestion): Solution {
  switch (q.type) {
    case "mc":
      return { type: "mc", answerIndex: q.answerIndex };
    case "multi":
      return { type: "multi", answerIndices: q.answerIndices };
    case "order":
      return { type: "order", order: q.items };
    case "match":
      return { type: "match", pairs: q.pairs };
    case "terminal":
      return { type: "terminal", expected: q.expected };
  }
}

/**
 * Per-question display order for multiple-choice options, so the correct
 * answer isn't parked in the same slot every time. The permutation maps
 * display index -> original (file order) index and is stored with the
 * session so grading and review both resolve correctly.
 */
export function buildChoiceOrders(questions: QuizQuestion[]): Record<string, number[]> {
  const orders: Record<string, number[]> = {};
  for (const q of questions) {
    if (q.type !== "mc" && q.type !== "multi") continue;
    orders[q.id] = shuffle(q.choices.map((_, i) => i));
  }
  return orders;
}

/** Reorders an mc/multi question's choices per the session's stored permutation. */
export function applyChoiceOrder(
  question: QuizQuestionPublic,
  orders: Record<string, number[]>,
): QuizQuestionPublic {
  if (question.type !== "mc" && question.type !== "multi") return question;
  const order = orders[question.id];
  if (!order) return question;
  return { ...question, choices: order.map((orig) => question.choices[orig]!) };
}

/**
 * Maps a submitted display index back to the original (file-order) index
 * through a session's stored permutation. `order[displayIndex] === originalIndex`.
 * Returns undefined if the display index is out of range.
 */
export function displayToOriginalIndex(
  order: number[] | undefined,
  displayIndex: number,
): number | undefined {
  return order ? order[displayIndex] : displayIndex;
}

/** Expresses an mc/multi solution's answer index/indices in the display order the client saw. */
export function applySolutionOrder(
  solution: Solution,
  orders: Record<string, number[]>,
  questionId: string,
): Solution {
  const order = orders[questionId];
  if (!order) return solution;
  if (solution.type === "mc") {
    const display = order.indexOf(solution.answerIndex);
    return display === -1 ? solution : { ...solution, answerIndex: display };
  }
  if (solution.type === "multi") {
    const display = solution.answerIndices.map((orig) => order.indexOf(orig)).filter((d) => d !== -1);
    return { ...solution, answerIndices: display };
  }
  return solution;
}

export function normalizeCommand(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Grades an answer against a question. Binary correct/incorrect (no partial
 * credit). Throws on a type mismatch — the route turns that into a 400.
 */
export function grade(q: QuizQuestion, answer: AttemptAnswer): boolean {
  if (q.type !== answer.type) {
    throw new AnswerTypeMismatchError(q.type, answer.type);
  }
  switch (answer.type) {
    case "mc": {
      if (q.type !== "mc") return false;
      return answer.choiceIndex === q.answerIndex;
    }
    case "multi": {
      if (q.type !== "multi") return false;
      // All-or-nothing: the set of picked indices must equal the answer set
      // exactly — no partial credit, and picking extra choices fails it.
      const picked = new Set(answer.choiceIndices);
      const correct = new Set(q.answerIndices);
      return picked.size === correct.size && [...correct].every((i) => picked.has(i));
    }
    case "order": {
      if (q.type !== "order") return false;
      return (
        answer.order.length === q.items.length && answer.order.every((v, i) => v === q.items[i])
      );
    }
    case "match": {
      if (q.type !== "match") return false;
      return (
        Object.keys(answer.pairs).length === q.pairs.length &&
        q.pairs.every((p) => answer.pairs[p.left] === p.right)
      );
    }
    case "terminal": {
      if (q.type !== "terminal") return false;
      const given = normalizeCommand(answer.command);
      return q.expected.some((e) => normalizeCommand(e) === given);
    }
  }
}

export class AnswerTypeMismatchError extends Error {
  constructor(questionType: string, answerType: string) {
    super(`answer type "${answerType}" does not match question type "${questionType}"`);
  }
}
