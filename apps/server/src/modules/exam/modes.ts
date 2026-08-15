import type { CertPack, QuizQuestionType } from "@comptia/content";

export type ExamModeId = "full" | "half" | "domain" | "pbq" | "weak";

export type SelectionStrategy =
  /** sample each domain in proportion to its official exam weight */
  | "blueprint"
  /** sample preferentially from the domains with the lowest mastery */
  | "weak"
  /** spread evenly across whatever domains the user picked */
  | "even";

export interface ExamMode {
  id: ExamModeId;
  name: string;
  description: string;
  questionCount: number;
  minutes: number;
  selection: SelectionStrategy;
  /** restrict the pool to these question types */
  types?: QuizQuestionType[];
  /** whether the client is expected to supply domainCodes */
  picksDomains: boolean;
}

const PBQ_TYPES: QuizQuestionType[] = ["order", "match", "terminal"];

/**
 * Modes are behavior, derived from the pack's four exam numbers — so adding a
 * cert never means restating the mode list. Counts are clamped to the pool at
 * selection time, so a mode stays runnable while a question bank is still small.
 */
export function examModes(pack: CertPack): ExamMode[] {
  const { questionCount, minutes } = pack.exam;
  const pbqCount = pack.quiz.filter((q) => PBQ_TYPES.includes(q.type)).length;

  return [
    {
      id: "full",
      name: "Full mock exam",
      description: `${questionCount} questions, ${minutes} minutes — same length, timing, and domain weighting as the real exam.`,
      questionCount,
      minutes,
      selection: "blueprint",
      picksDomains: false,
    },
    {
      id: "half",
      name: "Half exam",
      description: `${Math.ceil(questionCount / 2)} questions, ${Math.ceil(
        minutes / 2,
      )} minutes — same weighting, half the sitting.`,
      questionCount: Math.ceil(questionCount / 2),
      minutes: Math.ceil(minutes / 2),
      selection: "blueprint",
      picksDomains: false,
    },
    {
      id: "domain",
      name: "Domain drill",
      description: "20 questions, 20 minutes, drawn only from the domains you choose.",
      questionCount: 20,
      minutes: 20,
      selection: "even",
      picksDomains: true,
    },
    {
      id: "pbq",
      name: "PBQ gauntlet",
      description: `Performance-based questions only — ordering, matching, and terminal. ${
        pbqCount > 0 ? `${Math.min(pbqCount, 15)} questions` : "No PBQs in this pack yet"
      }, 2 minutes each.`,
      questionCount: Math.min(Math.max(pbqCount, 1), 15),
      minutes: Math.min(Math.max(pbqCount, 1), 15) * 2,
      selection: "even",
      types: PBQ_TYPES,
      picksDomains: false,
    },
    {
      id: "weak",
      name: "Weak areas",
      description:
        "20 questions, 20 minutes, weighted toward the domains where your recent accuracy is lowest.",
      questionCount: 20,
      minutes: 20,
      selection: "weak",
      picksDomains: false,
    },
  ];
}

export function findExamMode(pack: CertPack, id: string): ExamMode | undefined {
  return examModes(pack).find((m) => m.id === id);
}
