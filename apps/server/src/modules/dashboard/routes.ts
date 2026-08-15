import { Router } from "express";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { DashboardStats } from "@comptia/shared-types";
import { flashcardProgress, quizAttempts, quizSessions } from "../../db/schema";
import { h } from "../../lib/handler";
import type { ApiDeps } from "../shared";

export function dashboardRoutes(deps: ApiDeps): Router {
  const router = Router();

  router.get(
    "/dashboard",
    h((req, res) => {
      const certId = Number(req.query.certId);
      const pack = Number.isInteger(certId) ? deps.content.byCertId.get(certId) : undefined;
      if (!pack) {
        res.status(404).json({ error: "Unknown cert — pass ?certId=" });
        return;
      }
      const userId = req.user!.id;

      const fc = deps.db
        .select({
          known: sql<number>`coalesce(sum(case when ${flashcardProgress.status} = 'known' then 1 else 0 end), 0)`,
          learning: sql<number>`coalesce(sum(case when ${flashcardProgress.status} = 'learning' then 1 else 0 end), 0)`,
        })
        .from(flashcardProgress)
        .where(and(eq(flashcardProgress.userId, userId), eq(flashcardProgress.certId, certId)))
        .get();

      const totals = deps.db
        .select({
          attempts: sql<number>`count(*)`,
          correct: sql<number>`coalesce(sum(${quizAttempts.correct}), 0)`,
        })
        .from(quizAttempts)
        .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.certId, certId)))
        .get();

      const byDomain = deps.db
        .select({
          domainCode: quizAttempts.domainCode,
          attempts: sql<number>`count(*)`,
          correct: sql<number>`coalesce(sum(${quizAttempts.correct}), 0)`,
        })
        .from(quizAttempts)
        .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.certId, certId)))
        .groupBy(quizAttempts.domainCode)
        .all();
      const domainRows = new Map(byDomain.map((r) => [r.domainCode, r]));

      const recent = deps.db
        .select()
        .from(quizSessions)
        .where(
          and(
            eq(quizSessions.userId, userId),
            eq(quizSessions.certId, certId),
            isNotNull(quizSessions.finishedAt),
          ),
        )
        .orderBy(desc(quizSessions.startedAt))
        .limit(5)
        .all();

      const attempts = totals?.attempts ?? 0;
      const correct = totals?.correct ?? 0;
      const response: DashboardStats = {
        flashcards: {
          total: pack.flashcards.length,
          known: fc?.known ?? 0,
          learning: fc?.learning ?? 0,
        },
        quiz: {
          attempts,
          correct,
          accuracy: attempts > 0 ? Math.round((correct / attempts) * 100) : null,
          perDomain: pack.domains.map((d) => {
            const row = domainRows.get(d.code);
            const dAttempts = row?.attempts ?? 0;
            const dCorrect = row?.correct ?? 0;
            return {
              code: d.code,
              name: d.name,
              weight: d.weight,
              attempts: dAttempts,
              correct: dCorrect,
              accuracy: dAttempts > 0 ? Math.round((dCorrect / dAttempts) * 100) : null,
            };
          }),
        },
        recentSessions: recent.map((s) => ({
          id: s.id,
          startedAt: s.startedAt.getTime(),
          finishedAt: s.finishedAt?.getTime() ?? null,
          total: s.questionCount,
          correct: s.correctCount ?? 0,
          score: s.score,
        })),
      };
      res.json(response);
    }),
  );

  return router;
}
