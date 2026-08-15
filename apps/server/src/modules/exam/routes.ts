import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { McQuestion, QuizQuestion } from "@comptia/content";
import type {
  ExamHistoryItem,
  ExamModeDto,
  ExamOptionsDto,
  ExamResultDto,
  ExamReviewItem,
  ExamSessionDto,
  QuizQuestionPublic,
} from "@comptia/shared-types";
import { quizAttempts, quizSessions } from "../../db/schema";
import { h } from "../../lib/handler";
import { computeReadiness, type AttemptLite } from "../analytics/readiness";
import {
  AnswerTypeMismatchError,
  buildLayout,
  grade,
  solutionFor,
  toPublicQuestion,
  type QuestionLayout,
} from "../quiz/grade";
import type { ApiDeps } from "../shared";
import { examModes, findExamMode } from "./modes";
import { buildChoiceOrders, selectExamQuestions } from "./select";
import { didPass, toScaledScore } from "./score";

const EXAM_MODE_IDS = ["full", "half", "domain", "pbq", "weak"] as const;

const StartBody = z.object({
  certId: z.number().int(),
  examMode: z.enum(EXAM_MODE_IDS),
  domainCodes: z.array(z.string()).optional(),
});

const AnswerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("mc"), choiceIndex: z.number().int().min(0) }),
  z.object({ type: z.literal("order"), order: z.array(z.string()).min(2).max(50) }),
  z.object({ type: z.literal("match"), pairs: z.record(z.string().max(500)) }),
  z.object({ type: z.literal("terminal"), command: z.string().min(1).max(500) }),
]);

const AttemptBody = z.object({
  sessionId: z.number().int(),
  questionId: z.string().min(1),
  answer: AnswerSchema.nullable(),
});

const FlagBody = z.object({ questionId: z.string().min(1), flagged: z.boolean() });

/** How many past exams count as "recently seen" for anti-repeat selection. */
const RECENT_EXAMS_FOR_NOVELTY = 3;

/**
 * Applies the session's stored choice permutation to a public question, so the
 * candidate sees options in the shuffled order. `orders[i]` is the original
 * index shown at display position i.
 */
function applyChoiceOrder(
  question: QuizQuestionPublic,
  orders: Record<string, number[]>,
): QuizQuestionPublic {
  if (question.type !== "mc") return question;
  const order = orders[question.id];
  if (!order) return question;
  return { ...question, choices: order.map((orig) => question.choices[orig]!) };
}

export function examRoutes(deps: ApiDeps): Router {
  const router = Router();

  /** What exam types this cert offers, plus how much of each the pool can fill. */
  router.get(
    "/exam/options",
    h((req, res) => {
      const certId = Number(req.query.certId);
      const pack = Number.isInteger(certId) ? deps.content.byCertId.get(certId) : undefined;
      if (!pack) {
        res.status(404).json({ error: "Unknown cert — pass ?certId=" });
        return;
      }
      const modes: ExamModeDto[] = examModes(pack).map((m) => {
        const eligible = m.types
          ? pack.quiz.filter((q) => m.types!.includes(q.type)).length
          : pack.quiz.length;
        return {
          id: m.id,
          name: m.name,
          description: m.description,
          questionCount: m.questionCount,
          minutes: m.minutes,
          picksDomains: m.picksDomains,
          availableQuestions: Math.min(m.questionCount, eligible),
        };
      });
      const options: ExamOptionsDto = {
        certId,
        passingScaledScore: pack.exam.passingScaledScore,
        passingRawPercent: pack.exam.passingRawPercent,
        scaledMin: pack.exam.scaledMin,
        scaledMax: pack.exam.scaledMax,
        officialQuestionCount: pack.exam.questionCount,
        officialMinutes: pack.exam.minutes,
        modes,
      };
      res.json(options);
    }),
  );

  router.post(
    "/exam/sessions",
    h((req, res) => {
      const body = StartBody.parse(req.body);
      const pack = deps.content.byCertId.get(body.certId);
      if (!pack) {
        res.status(404).json({ error: "Unknown cert" });
        return;
      }
      const mode = findExamMode(pack, body.examMode);
      if (!mode) {
        res.status(400).json({ error: "Unknown exam type" });
        return;
      }
      const userId = req.user!.id;

      let pool: QuizQuestion[] = pack.quiz;
      if (mode.types) pool = pool.filter((q) => mode.types!.includes(q.type));
      if (pool.length === 0) {
        res.status(400).json({ error: "This cert has no questions for that exam type yet" });
        return;
      }

      // Anti-repeat: what did they see in their last few exams?
      const recentSessions = deps.db
        .select({ questionIds: quizSessions.questionIds })
        .from(quizSessions)
        .where(
          and(
            eq(quizSessions.userId, userId),
            eq(quizSessions.certId, body.certId),
            eq(quizSessions.mode, "exam"),
          ),
        )
        .orderBy(desc(quizSessions.startedAt))
        .limit(RECENT_EXAMS_FOR_NOVELTY)
        .all();
      const recentlySeen = new Set(
        recentSessions.flatMap((s) => JSON.parse(s.questionIds) as string[]),
      );

      // "Weak areas" needs current mastery, which is the Phase 2 readiness engine.
      let masteryByDomain: Map<string, number | null> | undefined;
      if (mode.selection === "weak") {
        const attemptRows = deps.db
          .select({
            domainCode: quizAttempts.domainCode,
            correct: quizAttempts.correct,
            answeredAt: quizAttempts.answeredAt,
          })
          .from(quizAttempts)
          .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.certId, body.certId)))
          .all();
        const byDomain = new Map<string, AttemptLite[]>();
        for (const a of attemptRows) {
          const list = byDomain.get(a.domainCode);
          if (list) list.push(a);
          else byDomain.set(a.domainCode, [a]);
        }
        const readiness = computeReadiness(pack.domains, byDomain);
        masteryByDomain = new Map(readiness.perDomain.map((d) => [d.code, d.mastery]));
      }

      const questions = selectExamQuestions({
        pool,
        domains: pack.domains,
        count: mode.questionCount,
        selection: mode.selection,
        domainCodes: mode.picksDomains ? body.domainCodes : undefined,
        recentlySeen,
        masteryByDomain,
      });
      if (questions.length === 0) {
        res.status(400).json({ error: "No questions match that selection" });
        return;
      }

      // Time scales with the questions actually served, so a short bank yields a
      // proportionally short exam rather than an absurd amount of time.
      const secondsPerQuestion = (mode.minutes * 60) / mode.questionCount;
      const timeLimitSeconds = Math.max(60, Math.round(questions.length * secondsPerQuestion));
      const now = new Date();
      const choiceOrders = buildChoiceOrders(questions);
      const layouts: Record<string, QuestionLayout> = Object.fromEntries(
        questions.map((q) => [q.id, buildLayout(q)]),
      );

      const session = deps.db
        .insert(quizSessions)
        .values({
          userId,
          certId: body.certId,
          questionIds: JSON.stringify(questions.map((q) => q.id)),
          questionCount: questions.length,
          startedAt: now,
          mode: "exam",
          examMode: mode.id,
          timeLimitSeconds,
          expiresAt: new Date(now.getTime() + timeLimitSeconds * 1000),
          choiceOrders: JSON.stringify(choiceOrders),
          layouts: JSON.stringify(layouts),
          flagged: JSON.stringify([]),
        })
        .returning()
        .get();

      const dto: ExamSessionDto = {
        sessionId: session.id,
        certId: body.certId,
        examMode: mode.id,
        questions: questions.map((q) =>
          applyChoiceOrder(toPublicQuestion(q, layouts[q.id]), choiceOrders),
        ),
        answers: {},
        flagged: [],
        secondsRemaining: timeLimitSeconds,
        timeLimitSeconds,
        expiresAt: session.expiresAt!.getTime(),
        submitted: false,
      };
      res.json(dto);
    }),
  );

  /** Resume — a reload mid-exam must not restart the clock or lose answers. */
  router.get(
    "/exam/sessions/:id",
    h((req, res) => {
      const sessionId = Number(req.params.id);
      if (!Number.isInteger(sessionId)) {
        res.status(400).json({ error: "Session id must be an integer" });
        return;
      }
      const session = deps.db
        .select()
        .from(quizSessions)
        .where(
          and(
            eq(quizSessions.id, sessionId),
            eq(quizSessions.userId, req.user!.id),
            eq(quizSessions.mode, "exam"),
          ),
        )
        .get();
      if (!session) {
        res.status(404).json({ error: "Unknown exam session" });
        return;
      }

      const questionIds = JSON.parse(session.questionIds) as string[];
      const byId = deps.content.questionsByCertId.get(session.certId)!;
      const choiceOrders = JSON.parse(session.choiceOrders ?? "{}") as Record<string, number[]>;
      const layouts = JSON.parse(session.layouts ?? "{}") as Record<string, QuestionLayout>;
      const attempts = deps.db
        .select()
        .from(quizAttempts)
        .where(eq(quizAttempts.sessionId, sessionId))
        .all();

      const answers: ExamSessionDto["answers"] = {};
      for (const a of attempts) {
        if (a.answer) answers[a.questionId] = JSON.parse(a.answer);
      }

      const dto: ExamSessionDto = {
        sessionId,
        certId: session.certId,
        examMode: (session.examMode ?? "full") as ExamSessionDto["examMode"],
        questions: questionIds
          .map((id) => byId.get(id))
          .filter((q): q is QuizQuestion => !!q)
          .map((q) => applyChoiceOrder(toPublicQuestion(q, layouts[q.id]), choiceOrders)),
        answers,
        flagged: JSON.parse(session.flagged ?? "[]"),
        secondsRemaining: session.expiresAt
          ? Math.max(0, Math.round((session.expiresAt.getTime() - Date.now()) / 1000))
          : 0,
        timeLimitSeconds: session.timeLimitSeconds ?? 0,
        expiresAt: session.expiresAt?.getTime() ?? 0,
        submitted: !!session.finishedAt,
      };
      res.json(dto);
    }),
  );

  /**
   * Record (or clear) an answer. Returns no grading — an exam stays dark until
   * submit, which is both the realistic behavior and keeps answers off the wire.
   */
  router.post(
    "/exam/attempts",
    h((req, res) => {
      const body = AttemptBody.parse(req.body);
      const session = deps.db
        .select()
        .from(quizSessions)
        .where(
          and(
            eq(quizSessions.id, body.sessionId),
            eq(quizSessions.userId, req.user!.id),
            eq(quizSessions.mode, "exam"),
          ),
        )
        .get();
      if (!session) {
        res.status(404).json({ error: "Unknown exam session" });
        return;
      }
      if (session.finishedAt) {
        res.status(409).json({ error: "This exam has already been submitted" });
        return;
      }
      if (session.expiresAt && session.expiresAt.getTime() <= Date.now()) {
        res.status(410).json({ error: "Time is up — submit to see your results" });
        return;
      }
      const questionIds = JSON.parse(session.questionIds) as string[];
      if (!questionIds.includes(body.questionId)) {
        res.status(400).json({ error: "Question is not part of this exam" });
        return;
      }
      const question = deps.content.questionsByCertId.get(session.certId)?.get(body.questionId);
      if (!question) {
        res.status(404).json({ error: "Unknown question" });
        return;
      }

      const existing = deps.db
        .select({ id: quizAttempts.id })
        .from(quizAttempts)
        .where(
          and(eq(quizAttempts.sessionId, session.id), eq(quizAttempts.questionId, body.questionId)),
        )
        .get();

      // Clearing an answer leaves the question genuinely unanswered.
      if (body.answer === null) {
        if (existing) {
          deps.db.delete(quizAttempts).where(eq(quizAttempts.id, existing.id)).run();
        }
        res.json({ recorded: false });
        return;
      }

      // Map the displayed choice index back through this session's shuffle.
      let answer = body.answer;
      if (answer.type === "mc" && question.type === "mc") {
        const orders = JSON.parse(session.choiceOrders ?? "{}") as Record<string, number[]>;
        const order = orders[question.id];
        const original = order ? order[answer.choiceIndex] : answer.choiceIndex;
        if (original === undefined) {
          res.status(400).json({ error: "choiceIndex out of range" });
          return;
        }
        answer = { type: "mc", choiceIndex: original };
      }

      let correct: boolean;
      try {
        correct = grade(question, answer);
      } catch (err) {
        if (err instanceof AnswerTypeMismatchError) {
          res.status(400).json({ error: err.message });
          return;
        }
        throw err;
      }

      const values = {
        sessionId: session.id,
        userId: req.user!.id,
        certId: session.certId,
        questionId: question.id,
        domainCode: question.domainCode,
        choiceIndex: answer.type === "mc" ? answer.choiceIndex : null,
        answer: JSON.stringify(answer),
        correct,
        answeredAt: new Date(),
      };
      // Unlike practice, an exam answer is revisable right up until submit.
      if (existing) {
        deps.db.update(quizAttempts).set(values).where(eq(quizAttempts.id, existing.id)).run();
      } else {
        deps.db.insert(quizAttempts).values(values).run();
      }
      res.json({ recorded: true });
    }),
  );

  router.post(
    "/exam/sessions/:id/flag",
    h((req, res) => {
      const sessionId = Number(req.params.id);
      const body = FlagBody.parse(req.body);
      const session = deps.db
        .select()
        .from(quizSessions)
        .where(
          and(
            eq(quizSessions.id, sessionId),
            eq(quizSessions.userId, req.user!.id),
            eq(quizSessions.mode, "exam"),
          ),
        )
        .get();
      if (!session) {
        res.status(404).json({ error: "Unknown exam session" });
        return;
      }
      const flagged = new Set(JSON.parse(session.flagged ?? "[]") as string[]);
      if (body.flagged) flagged.add(body.questionId);
      else flagged.delete(body.questionId);
      deps.db
        .update(quizSessions)
        .set({ flagged: JSON.stringify([...flagged]) })
        .where(eq(quizSessions.id, sessionId))
        .run();
      res.json({ flagged: [...flagged] });
    }),
  );

  router.post(
    "/exam/sessions/:id/submit",
    h((req, res) => {
      const sessionId = Number(req.params.id);
      if (!Number.isInteger(sessionId)) {
        res.status(400).json({ error: "Session id must be an integer" });
        return;
      }
      const session = deps.db
        .select()
        .from(quizSessions)
        .where(
          and(
            eq(quizSessions.id, sessionId),
            eq(quizSessions.userId, req.user!.id),
            eq(quizSessions.mode, "exam"),
          ),
        )
        .get();
      if (!session) {
        res.status(404).json({ error: "Unknown exam session" });
        return;
      }
      const pack = deps.content.byCertId.get(session.certId)!;
      const byId = deps.content.questionsByCertId.get(session.certId)!;
      const questionIds = JSON.parse(session.questionIds) as string[];
      const choiceOrders = JSON.parse(session.choiceOrders ?? "{}") as Record<string, number[]>;

      const attempts = deps.db
        .select()
        .from(quizAttempts)
        .where(eq(quizAttempts.sessionId, sessionId))
        .all();
      const attemptByQuestion = new Map(attempts.map((a) => [a.questionId, a]));

      const correct = attempts.filter((a) => a.correct).length;
      // Unanswered counts against you, exactly as it would on the real exam.
      const rawPercent = Math.round((correct / session.questionCount) * 100);
      const scaled = toScaledScore(rawPercent, pack.exam);
      const passed = didPass(rawPercent, pack.exam);
      const finishedAt = session.finishedAt ?? new Date();
      const expired = !!session.expiresAt && session.expiresAt.getTime() <= finishedAt.getTime();

      if (!session.finishedAt) {
        deps.db
          .update(quizSessions)
          .set({
            finishedAt,
            correctCount: correct,
            score: rawPercent,
            scaledScore: scaled,
            passed,
          })
          .where(eq(quizSessions.id, sessionId))
          .run();
      }

      const perDomain = pack.domains
        .map((d) => {
          const ids = questionIds.filter((id) => byId.get(id)?.domainCode === d.code);
          return {
            code: d.code,
            name: d.name,
            total: ids.length,
            correct: ids.filter((id) => attemptByQuestion.get(id)?.correct).length,
          };
        })
        .filter((d) => d.total > 0);

      // Review reports choices in their original order. Stored answers were
      // already mapped back out of the display shuffle when recorded, so
      // `given` and `solution` index into this same array.
      const review: ExamReviewItem[] = questionIds.flatMap((id) => {
        const q = byId.get(id);
        if (!q) return [];
        const attempt = attemptByQuestion.get(id);
        return [
          {
            questionId: id,
            domainCode: q.domainCode,
            prompt: q.prompt,
            type: q.type,
            correct: !!attempt?.correct,
            answered: !!attempt,
            given: attempt?.answer ? JSON.parse(attempt.answer) : null,
            solution: solutionFor(q),
            explanation: q.explanation,
            ...(q.type === "mc" ? { choices: (q as McQuestion).choices } : {}),
          },
        ];
      });

      const result: ExamResultDto = {
        sessionId,
        certId: session.certId,
        examMode: (session.examMode ?? "full") as ExamResultDto["examMode"],
        total: session.questionCount,
        answered: attempts.length,
        correct,
        score: rawPercent,
        scaledScore: scaled,
        passingScaledScore: pack.exam.passingScaledScore,
        passed,
        timeSpentSeconds: Math.round(
          (finishedAt.getTime() - session.startedAt.getTime()) / 1000,
        ),
        timeLimitSeconds: session.timeLimitSeconds ?? 0,
        expired,
        perDomain,
        review,
      };
      res.json(result);
    }),
  );

  router.get(
    "/exam/history",
    h((req, res) => {
      const certId = Number(req.query.certId);
      const rows = deps.db
        .select()
        .from(quizSessions)
        .where(
          and(
            eq(quizSessions.userId, req.user!.id),
            eq(quizSessions.mode, "exam"),
            ...(Number.isInteger(certId) ? [eq(quizSessions.certId, certId)] : []),
          ),
        )
        .orderBy(desc(quizSessions.startedAt))
        .limit(20)
        .all();
      const history: ExamHistoryItem[] = rows.map((s) => ({
        sessionId: s.id,
        examMode: (s.examMode ?? "full") as ExamHistoryItem["examMode"],
        startedAt: s.startedAt.getTime(),
        finishedAt: s.finishedAt?.getTime() ?? null,
        total: s.questionCount,
        correct: s.correctCount ?? 0,
        score: s.score,
        scaledScore: s.scaledScore,
        passed: s.passed,
      }));
      res.json(history);
    }),
  );

  return router;
}
