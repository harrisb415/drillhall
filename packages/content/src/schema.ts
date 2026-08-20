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

/**
 * Multiple-response ("Select TWO/THREE"): more than one correct choice, graded
 * all-or-nothing. The count the candidate must pick is derived from
 * `answerIndices.length` — no separate field to drift out of sync.
 */
export const MultiQuestionSchema = z.object({
  ...quizBase,
  type: z.literal("multi"),
  choices: z.array(z.string().min(1)).min(3),
  answerIndices: z.array(z.number().int().min(0)).min(2),
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
  MultiQuestionSchema,
  OrderQuestionSchema,
  MatchQuestionSchema,
  TerminalQuestionSchema,
]);

/**
 * A course lesson. Only `reading` exists today — video was deliberately left
 * out rather than stubbed, so adding it later is a schema change with no
 * migration and no dead code in the meantime.
 *
 * Lessons are domain-tagged like everything else in a pack, so a domain is
 * effectively the module; ordering inside a domain is array order.
 */
export const ReadingLessonSchema = z.object({
  id: z.string().min(1),
  domainCode: z.string().min(1),
  type: z.literal("reading"),
  title: z.string().min(1),
  /** One-line summary shown in the course index. */
  summary: z.string().min(1),
  /** Reading time in minutes, for the index and for pacing expectations. */
  estimatedMinutes: z.number().int().min(1).max(120),
  /** Markdown. Rendered through react-markdown — never innerHTML. */
  body: z.string().min(1),
});

export const CourseLessonSchema = z.discriminatedUnion("type", [ReadingLessonSchema]);

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
    /** Optional so the packs that predate courses keep validating untouched. */
    course: z.array(CourseLessonSchema).default([]),
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
      if (q.type === "multi") {
        const uniq = new Set(q.answerIndices);
        if (uniq.size !== q.answerIndices.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["quiz", i, "answerIndices"],
            message: "answerIndices contains duplicates",
          });
        }
        for (const idx of q.answerIndices) {
          if (idx >= q.choices.length) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["quiz", i, "answerIndices"],
              message: `answerIndex ${idx} out of range for ${q.choices.length} choices`,
            });
          }
        }
        // A multi-response question with every choice correct isn't a question.
        if (uniq.size >= q.choices.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["quiz", i, "answerIndices"],
            message: "multi question must have at least one incorrect choice",
          });
        }
      }
    });
    pack.course.forEach((l, i) => {
      checkId(l.id, ["course", i, "id"]);
      checkDomain(l.domainCode, ["course", i, "domainCode"]);
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
export type MultiQuestion = z.infer<typeof MultiQuestionSchema>;
export type OrderQuestion = z.infer<typeof OrderQuestionSchema>;
export type MatchQuestion = z.infer<typeof MatchQuestionSchema>;
export type TerminalQuestion = z.infer<typeof TerminalQuestionSchema>;
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export type QuizQuestionType = QuizQuestion["type"];
export type ReferenceGroup = z.infer<typeof ReferenceGroupSchema>;
export type ReadingLesson = z.infer<typeof ReadingLessonSchema>;
export type CourseLesson = z.infer<typeof CourseLessonSchema>;
export type CourseLessonType = CourseLesson["type"];
export type CertPack = z.infer<typeof CertPackSchema>;
