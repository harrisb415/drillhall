import { Router } from "express";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type {
  AttemptResponse,
  RecentSession,
  SessionSummary,
  StartSessionResponse,
} from "@comptia/shared-types";
import { quizAttempts, quizSessions } from "../../db/schema";
import { recordActivity } from "../gamification/service";
import { h } from "../../lib/handler";
import type { ApiDeps } from "../shared";
import {
  AnswerTypeMismatchError,
  applyChoiceOrder,
  applySolutionOrder,
  buildChoiceOrders,
  displayToOriginalIndex,
  grade,
  shuffle,
  solutionFor,
  toPublicQuestion,
} from "./grade";

const QUESTION_TYPES = ["mc", "multi", "order", "match", "terminal"] as const;

const StartBody = z.object({
  certId: z.number().int(),
  domainCodes: z.array(z.string()).optional(),
  types: z.array(z.enum(QUESTION_TYPES)).optional(),
  count: z.number().int().min(1).max(50).default(10),
});

const AnswerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("mc"), choiceIndex: z.number().int().min(0) }),
  z.object({ type: z.literal("multi"), choiceIndices: z.array(z.number().int().min(0)).min(1).max(20) }),
  z.object({ type: z.literal("order"), order: z.array(z.string()).min(2).max(50) }),
  z.object({ type: z.literal("match"), pairs: z.record(z.string().max(500)) }),
  z.object({ type: z.literal("terminal"), command: z.string().min(1).max(500) }),
]);

const AttemptBody = z.object({
  sessionId: z.number().int(),
  questionId: z.string().min(1),
  answer: AnswerSchema,
});

export function quizRoutes(deps: ApiDeps): Router {
  const router = Router();

  router.post(
    "/quiz/sessions",
    h((req, res) => {
      const body = StartBody.parse(req.body);
      const questionsById = deps.content.questionsByCertId.get(body.certId);
      if (!questionsById) {
        res.status(404).json({ error: "Unknown cert" });
        return;
      }
      let pool = [...questionsById.values()];
      if (body.domainCodes && body.domainCodes.length > 0) {
        const wanted = new Set(body.domainCodes);
        pool = pool.filter((q) => wanted.has(q.domainCode));
      }
      if (body.types && body.types.length > 0) {
        const wanted = new Set<string>(body.types);
        pool = pool.filter((q) => wanted.has(q.type));
      }
      if (pool.length === 0) {
        res.status(400).json({ error: "No questions match the selected filters" });
        return;
      }
      const chosen = shuffle(pool).slice(0, body.count);
      // Stored so grading can map the display index back to the original
      // answer — without this, the first-listed choice is correct almost
      // every time, since content authoring habitually puts it there.
      const choiceOrders = buildChoiceOrders(chosen);
      const session = deps.db
        .insert(quizSessions)
        .values({
          userId: req.user!.id,
          certId: body.certId,
          questionIds: JSON.stringify(chosen.map((q) => q.id)),
          questionCount: chosen.length,
          startedAt: new Date(),
          choiceOrders: JSON.stringify(choiceOrders),
        })
        .returning()
        .get();

      const response: StartSessionResponse = {
        sessionId: session.id,
        certId: body.certId,
        // order/match layouts still shuffle fresh each delivery — practice
        // sessions are never resumed, so there's nothing to stay consistent
        // with. mc choice order is the exception: it's persisted above so the
        // attempt endpoint can translate the answer back correctly.
        questions: chosen.map((q) => applyChoiceOrder(toPublicQuestion(q), choiceOrders)),
      };
      res.json(response);
    }),
  );

  router.post(
    "/quiz/attempts",
    h((req, res) => {
      const body = AttemptBody.parse(req.body);
      const session = deps.db
        .select()
        .from(quizSessions)
        .where(
          and(
            eq(quizSessions.id, body.sessionId),
            eq(quizSessions.userId, req.user!.id),
            // exam sessions go through /api/exam/attempts, which withholds grading
            eq(quizSessions.mode, "practice"),
          ),
        )
        .get();
      if (!session) {
        res.status(404).json({ error: "Unknown session" });
        return;
      }
      if (session.finishedAt) {
        res.status(400).json({ error: "Session already completed" });
        return;
      }
      const questionIds = JSON.parse(session.questionIds) as string[];
      if (!questionIds.includes(body.questionId)) {
        res.status(400).json({ error: "Question is not part of this session" });
        return;
      }
      const question = deps.content.questionsByCertId.get(session.certId)?.get(body.questionId);
      if (!question) {
        res.status(404).json({ error: "Unknown question" });
        return;
      }

      // Map the displayed choice index/indices back through this session's shuffle.
      const choiceOrders = JSON.parse(session.choiceOrders ?? "{}") as Record<string, number[]>;
      let answer = body.answer;
      if (answer.type === "mc" && question.type === "mc") {
        const original = displayToOriginalIndex(choiceOrders[question.id], answer.choiceIndex);
        if (original === undefined) {
          res.status(400).json({ error: "choiceIndex out of range" });
          return;
        }
        answer = { type: "mc", choiceIndex: original };
      } else if (answer.type === "multi" && question.type === "multi") {
        const order = choiceOrders[question.id];
        const originals: number[] = [];
        for (const displayIdx of answer.choiceIndices) {
          const original = displayToOriginalIndex(order, displayIdx);
          if (original === undefined) {
            res.status(400).json({ error: "choiceIndex out of range" });
            return;
          }
          originals.push(original);
        }
        answer = { type: "multi", choiceIndices: originals };
      }

      const existing = deps.db
        .select({ id: quizAttempts.id })
        .from(quizAttempts)
        .where(
          and(eq(quizAttempts.sessionId, session.id), eq(quizAttempts.questionId, body.questionId)),
        )
        .get();
      if (existing) {
        res.status(409).json({ error: "Question already answered in this session" });
        return;
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

      deps.db
        .insert(quizAttempts)
        .values({
          sessionId: session.id,
          userId: req.user!.id,
          certId: session.certId,
          questionId: question.id,
          domainCode: question.domainCode,
          choiceIndex: answer.type === "mc" ? answer.choiceIndex : null,
          answer: JSON.stringify(answer),
          correct,
          answeredAt: new Date(),
        })
        .run();

      // XP for the effort, not the outcome — a wrong answer you engaged with
      // still counts, and paying only for correct ones would push people to
      // avoid the material they most need.
      recordActivity(deps.db, req.user!.id, "question_answered");

      const response: AttemptResponse = {
        correct,
        explanation: question.explanation,
        // Expressed in the same display order the client was shown, so its
        // highlight-by-index logic needs no knowledge of the shuffle.
        solution: applySolutionOrder(solutionFor(question), choiceOrders, question.id),
      };
      res.json(response);
    }),
  );

  router.post(
    "/quiz/sessions/:id/complete",
    h((req, res) => {
      const sessionId = Number(req.params.id);
      if (!Number.isInteger(sessionId)) {
        res.status(400).json({ error: "Session id must be an integer" });
        return;
      }
      const session = deps.db
        .select()
        .from(quizSessions)
        .where(and(eq(quizSessions.id, sessionId), eq(quizSessions.userId, req.user!.id)))
        .get();
      if (!session) {
        res.status(404).json({ error: "Unknown session" });
        return;
      }

      const attempts = deps.db
        .select()
        .from(quizAttempts)
        .where(eq(quizAttempts.sessionId, sessionId))
        .all();
      const correct = attempts.filter((a) => a.correct).length;
      const score = Math.round((correct / session.questionCount) * 100);

      // Award only on the first completion; re-posting to this endpoint is
      // idempotent (it re-reads and returns the same summary), so the XP has
      // to be too or a refresh would mint 50 XP each time.
      if (!session.finishedAt) {
        deps.db
          .update(quizSessions)
          .set({ finishedAt: new Date(), correctCount: correct, score })
          .where(eq(quizSessions.id, sessionId))
          .run();
        recordActivity(deps.db, req.user!.id, "session_completed");
      }

      const pack = deps.content.byCertId.get(session.certId);
      const perDomain = (pack?.domains ?? [])
        .map((d) => {
          const domainAttempts = attempts.filter((a) => a.domainCode === d.code);
          return {
            code: d.code,
            name: d.name,
            total: domainAttempts.length,
            correct: domainAttempts.filter((a) => a.correct).length,
          };
        })
        .filter((d) => d.total > 0);

      const summary: SessionSummary = {
        sessionId,
        total: session.questionCount,
        answered: attempts.length,
        correct,
        score,
        perDomain,
      };
      res.json(summary);
    }),
  );

  router.get(
    "/quiz/sessions",
    h((req, res) => {
      const certId = Number(req.query.certId);
      const rows = deps.db
        .select()
        .from(quizSessions)
        .where(
          and(
            eq(quizSessions.userId, req.user!.id),
            eq(quizSessions.mode, "practice"),
            ...(Number.isInteger(certId) ? [eq(quizSessions.certId, certId)] : []),
            isNotNull(quizSessions.finishedAt),
          ),
        )
        .orderBy(desc(quizSessions.startedAt))
        .limit(10)
        .all();
      const response: RecentSession[] = rows.map((s) => ({
        id: s.id,
        startedAt: s.startedAt.getTime(),
        finishedAt: s.finishedAt?.getTime() ?? null,
        total: s.questionCount,
        correct: s.correctCount ?? 0,
        score: s.score,
      }));
      res.json(response);
    }),
  );

  return router;
}
