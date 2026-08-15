import { Router } from "express";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type {
  AttemptResponse,
  QuizQuestionPublic,
  RecentSession,
  SessionSummary,
  StartSessionResponse,
} from "@comptia/shared-types";
import { quizAttempts, quizSessions } from "../../db/schema";
import { h } from "../../lib/handler";
import type { ApiDeps } from "../shared";

const StartBody = z.object({
  certId: z.number().int(),
  domainCodes: z.array(z.string()).optional(),
  count: z.number().int().min(1).max(50).default(10),
});

const AttemptBody = z.object({
  sessionId: z.number().int(),
  questionId: z.string().min(1),
  choiceIndex: z.number().int().min(0),
});

function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

export function quizRoutes(deps: ApiDeps): Router {
  const router = Router();

  router.post(
    "/quiz/sessions",
    h((req, res) => {
      const body = StartBody.parse(req.body);
      const mcById = deps.content.mcByCertId.get(body.certId);
      if (!mcById) {
        res.status(404).json({ error: "Unknown cert" });
        return;
      }
      let pool = [...mcById.values()];
      if (body.domainCodes && body.domainCodes.length > 0) {
        const wanted = new Set(body.domainCodes);
        pool = pool.filter((q) => wanted.has(q.domainCode));
      }
      if (pool.length === 0) {
        res.status(400).json({ error: "No questions match the selected domains" });
        return;
      }
      const chosen = shuffle(pool).slice(0, body.count);
      const session = deps.db
        .insert(quizSessions)
        .values({
          userId: req.user!.id,
          certId: body.certId,
          questionIds: JSON.stringify(chosen.map((q) => q.id)),
          questionCount: chosen.length,
          startedAt: new Date(),
        })
        .returning()
        .get();

      const questions: QuizQuestionPublic[] = chosen.map((q) => ({
        id: q.id,
        domainCode: q.domainCode,
        type: "mc",
        prompt: q.prompt,
        choices: q.choices,
      }));
      const response: StartSessionResponse = {
        sessionId: session.id,
        certId: body.certId,
        questions,
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
        .where(and(eq(quizSessions.id, body.sessionId), eq(quizSessions.userId, req.user!.id)))
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
      const question = deps.content.mcByCertId.get(session.certId)?.get(body.questionId);
      if (!question) {
        res.status(404).json({ error: "Unknown question" });
        return;
      }
      if (body.choiceIndex >= question.choices.length) {
        res.status(400).json({ error: "choiceIndex out of range" });
        return;
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

      const correct = body.choiceIndex === question.answerIndex;
      deps.db
        .insert(quizAttempts)
        .values({
          sessionId: session.id,
          userId: req.user!.id,
          certId: session.certId,
          questionId: question.id,
          domainCode: question.domainCode,
          choiceIndex: body.choiceIndex,
          correct,
          answeredAt: new Date(),
        })
        .run();

      const response: AttemptResponse = {
        correct,
        answerIndex: question.answerIndex,
        explanation: question.explanation,
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

      if (!session.finishedAt) {
        deps.db
          .update(quizSessions)
          .set({ finishedAt: new Date(), correctCount: correct, score })
          .where(eq(quizSessions.id, sessionId))
          .run();
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
