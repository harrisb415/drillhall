import { create } from "zustand";
import type { AttemptAnswer, ExamResultDto, ExamSessionDto } from "@comptia/shared-types";

interface ExamState {
  phase: "setup" | "running" | "results";
  session: ExamSessionDto | null;
  index: number;
  answers: Record<string, AttemptAnswer>;
  flagged: Set<string>;
  result: ExamResultDto | null;
  begin: (session: ExamSessionDto) => void;
  goTo: (index: number) => void;
  next: () => void;
  prev: () => void;
  setAnswer: (questionId: string, answer: AttemptAnswer | null) => void;
  setFlag: (questionId: string, flagged: boolean) => void;
  finish: (result: ExamResultDto) => void;
  reset: () => void;
}

export const useExamStore = create<ExamState>((set) => ({
  phase: "setup",
  session: null,
  index: 0,
  answers: {},
  flagged: new Set(),
  result: null,
  begin: (session) =>
    set({
      phase: "running",
      session,
      index: 0,
      answers: session.answers,
      flagged: new Set(session.flagged),
      result: null,
    }),
  goTo: (index) =>
    set((s) => ({ index: Math.max(0, Math.min(index, (s.session?.questions.length ?? 1) - 1)) })),
  next: () =>
    set((s) => ({ index: Math.min(s.index + 1, (s.session?.questions.length ?? 1) - 1) })),
  prev: () => set((s) => ({ index: Math.max(0, s.index - 1) })),
  setAnswer: (questionId, answer) =>
    set((s) => {
      const answers = { ...s.answers };
      if (answer === null) delete answers[questionId];
      else answers[questionId] = answer;
      return { answers };
    }),
  setFlag: (questionId, flagged) =>
    set((s) => {
      const next = new Set(s.flagged);
      if (flagged) next.add(questionId);
      else next.delete(questionId);
      return { flagged: next };
    }),
  finish: (result) => set({ phase: "results", result }),
  reset: () =>
    set({
      phase: "setup",
      session: null,
      index: 0,
      answers: {},
      flagged: new Set(),
      result: null,
    }),
}));
