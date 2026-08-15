import { create } from "zustand";
import type {
  AttemptAnswer,
  AttemptResponse,
  QuizQuestionPublic,
  SessionSummary,
  StartSessionResponse,
} from "@comptia/shared-types";

export type AnswerRecord = AttemptResponse & { given: AttemptAnswer };

interface QuizState {
  phase: "setup" | "playing" | "summary";
  sessionId: number | null;
  questions: QuizQuestionPublic[];
  index: number;
  answers: Record<string, AnswerRecord>;
  summary: SessionSummary | null;
  begin: (session: StartSessionResponse) => void;
  record: (questionId: string, given: AttemptAnswer, result: AttemptResponse) => void;
  advance: () => void;
  finish: (summary: SessionSummary) => void;
  reset: () => void;
}

export const useQuizStore = create<QuizState>((set) => ({
  phase: "setup",
  sessionId: null,
  questions: [],
  index: 0,
  answers: {},
  summary: null,
  begin: (session) =>
    set({
      phase: "playing",
      sessionId: session.sessionId,
      questions: session.questions,
      index: 0,
      answers: {},
      summary: null,
    }),
  record: (questionId, given, result) =>
    set((s) => ({ answers: { ...s.answers, [questionId]: { ...result, given } } })),
  advance: () => set((s) => ({ index: Math.min(s.index + 1, s.questions.length - 1) })),
  finish: (summary) => set({ phase: "summary", summary }),
  reset: () =>
    set({ phase: "setup", sessionId: null, questions: [], index: 0, answers: {}, summary: null }),
}));
