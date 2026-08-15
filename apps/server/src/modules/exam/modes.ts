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

/** At most half the pool, capped at 8, so two gauntlets can be fully distinct. */
function pbqGauntletSize(pbqCount: number): number {
  return Math.min(Math.max(1, Math.floor(pbqCount / 2)), 8);
}

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
      // Deliberately at most half the PBQ pool. Performance-based questions are
      // the most expensive to author, so taking nearly all of them would make
      // every gauntlet the same drill — the one place repetition still bites.
      name: "PBQ gauntlet",
      description: `Performance-based questions only — ordering, matching, and terminal. ${
        pbqCount > 0 ? `${pbqGauntletSize(pbqCount)} questions` : "No PBQs in this pack yet"
      }, 2 minutes each.`,
      questionCount: pbqGauntletSize(pbqCount),
      minutes: pbqGauntletSize(pbqCount) * 2,
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
