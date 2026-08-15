import { z } from "zod";

export const DomainSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  /** Official exam weight, percent. All domains in a pack must sum to 100. */
  weight: z.number().int().min(1).max(100),
});

export const FlashcardSchema = z.object({
  id: z.string().min(1),
  domainCode: z.string().min(1),
  front: z.string().min(1),
  back: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

const quizBase = {
  id: z.string().min(1),
  domainCode: z.string().min(1),
  prompt: z.string().min(1),
  explanation: z.string().min(1),
};

export const McQuestionSchema = z.object({
  ...quizBase,
  type: z.literal("mc"),
  choices: z.array(z.string().min(1)).min(2),
  answerIndex: z.number().int().min(0),
});

export const OrderQuestionSchema = z.object({
  ...quizBase,
  type: z.literal("order"),
  /** Items listed in the correct order; the client shuffles for display. */
  items: z.array(z.string().min(1)).min(2),
});

export const MatchQuestionSchema = z.object({
  ...quizBase,
  type: z.literal("match"),
  pairs: z.array(z.object({ left: z.string().min(1), right: z.string().min(1) })).min(2),
});

export const TerminalQuestionSchema = z.object({
  ...quizBase,
  type: z.literal("terminal"),
  /** Acceptable literal commands (any match counts as correct). */
  expected: z.array(z.string().min(1)).min(1),
});

export const QuizQuestionSchema = z.discriminatedUnion("type", [
  McQuestionSchema,
  OrderQuestionSchema,
  MatchQuestionSchema,
  TerminalQuestionSchema,
]);

export const ReferenceGroupSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  columns: z.array(z.string().min(1)).min(1),
  rows: z.array(z.array(z.string())).min(1),
});

/**
 * Cert-specific exam facts. The *modes* (full / half / drill / PBQ / weak)
 * are behavior and live in the server's exam module — a new pack declares
 * these four numbers and inherits every mode.
 */
export const ExamConfigSchema = z.object({
  /** Real exam length, e.g. 90 for A+. */
  questionCount: z.number().int().min(1),
  /** Real time limit in minutes. */
  minutes: z.number().int().min(1),
  /** Official pass mark on the scaled range (675 Core 1, 700 Core 2). */
  passingScaledScore: z.number().int(),
  /** Raw percent treated as the pass line; anchors the scaled-score curve. */
  passingRawPercent: z.number().min(1).max(100),
  scaledMin: z.number().int().default(100),
  scaledMax: z.number().int().default(900),
});

export const CertPackSchema = z
  .object({
    code: z.string().min(1),
    name: z.string().min(1),
    version: z.string().min(1),
    exam: ExamConfigSchema,
    domains: z.array(DomainSchema).min(1),
    flashcards: z.array(FlashcardSchema).min(1),
    quiz: z.array(QuizQuestionSchema).min(1),
    reference: z.array(ReferenceGroupSchema),
  })
  .superRefine((pack, ctx) => {
    const weightSum = pack.domains.reduce((s, d) => s + d.weight, 0);
    if (weightSum !== 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["domains"],
        message: `domain weights must sum to 100, got ${weightSum}`,
      });
    }

    const domainCodes = new Set(pack.domains.map((d) => d.code));
    if (domainCodes.size !== pack.domains.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["domains"], message: "duplicate domain codes" });
    }

    const seenIds = new Set<string>();
    const checkId = (id: string, path: (string | number)[]) => {
      if (seenIds.has(id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: `duplicate id "${id}"` });
      }
      seenIds.add(id);
    };
    const checkDomain = (code: string, path: (string | number)[]) => {
      if (!domainCodes.has(code)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: `unknown domainCode "${code}"` });
      }
    };

    pack.flashcards.forEach((c, i) => {
      checkId(c.id, ["flashcards", i, "id"]);
      checkDomain(c.domainCode, ["flashcards", i, "domainCode"]);
    });
    pack.quiz.forEach((q, i) => {
      checkId(q.id, ["quiz", i, "id"]);
      checkDomain(q.domainCode, ["quiz", i, "domainCode"]);
      if (q.type === "mc" && q.answerIndex >= q.choices.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["quiz", i, "answerIndex"],
          message: `answerIndex ${q.answerIndex} out of range for ${q.choices.length} choices`,
        });
      }
    });
    pack.reference.forEach((g, i) => {
      g.rows.forEach((row, j) => {
        if (row.length !== g.columns.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["reference", i, "rows", j],
            message: `row has ${row.length} cells, expected ${g.columns.length}`,
          });
        }
      });
    });
  });

export type ExamConfig = z.infer<typeof ExamConfigSchema>;
export type CertDomain = z.infer<typeof DomainSchema>;
export type Flashcard = z.infer<typeof FlashcardSchema>;
export type McQuestion = z.infer<typeof McQuestionSchema>;
export type OrderQuestion = z.infer<typeof OrderQuestionSchema>;
export type MatchQuestion = z.infer<typeof MatchQuestionSchema>;
export type TerminalQuestion = z.infer<typeof TerminalQuestionSchema>;
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export type QuizQuestionType = QuizQuestion["type"];
export type ReferenceGroup = z.infer<typeof ReferenceGroupSchema>;
export type CertPack = z.infer<typeof CertPackSchema>;
