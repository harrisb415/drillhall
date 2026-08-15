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

/** Strips answers/explanations; pre-shuffles order items and match rights. */
export function toPublicQuestion(q: QuizQuestion): QuizQuestionPublic {
  switch (q.type) {
    case "mc":
      return { id: q.id, domainCode: q.domainCode, type: "mc", prompt: q.prompt, choices: q.choices };
    case "order":
      return {
        id: q.id,
        domainCode: q.domainCode,
        type: "order",
        prompt: q.prompt,
        items: shuffleAvoidingIdentity(q.items),
      };
    case "match":
      return {
        id: q.id,
        domainCode: q.domainCode,
        type: "match",
        prompt: q.prompt,
        lefts: q.pairs.map((p) => p.left),
        rights: shuffleAvoidingIdentity(q.pairs.map((p) => p.right)),
      };
    case "terminal":
      return { id: q.id, domainCode: q.domainCode, type: "terminal", prompt: q.prompt };
  }
}

export function solutionFor(q: QuizQuestion): Solution {
  switch (q.type) {
    case "mc":
      return { type: "mc", answerIndex: q.answerIndex };
    case "order":
      return { type: "order", order: q.items };
    case "match":
      return { type: "match", pairs: q.pairs };
    case "terminal":
      return { type: "terminal", expected: q.expected };
  }
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
