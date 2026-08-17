import { Router } from "express";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { DashboardStats } from "@comptia/shared-types";
import {
  courseProgress,
  flashcardProgress,
  gamificationStats,
  quizAttempts,
  quizSessions,
} from "../../db/schema";
import { h } from "../../lib/handler";
import { CONFIDENT_ATTEMPTS, computeReadiness, type AttemptLite } from "../analytics/readiness";
import { getStats } from "../gamification/service";
import { xpForLevel, xpIntoCurrentLevel } from "../gamification/levels";
import { isSameUtcDay } from "../../lib/dates";
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

      const progressRows = deps.db
        .select({ status: flashcardProgress.status })
        .from(flashcardProgress)
        .where(and(eq(flashcardProgress.userId, userId), eq(flashcardProgress.certId, certId)))
        .all();

      const completedLessonIds = new Set(
        deps.db
          .select({ lessonId: courseProgress.lessonId })
          .from(courseProgress)
          .where(and(eq(courseProgress.userId, userId), eq(courseProgress.certId, certId)))
          .all()
          .map((r) => r.lessonId),
      );
      const lessonsByDomain = new Map<string, number>();
      const completedByDomain = new Map<string, number>();
      for (const l of pack.course) {
        lessonsByDomain.set(l.domainCode, (lessonsByDomain.get(l.domainCode) ?? 0) + 1);
        if (completedLessonIds.has(l.id)) {
          completedByDomain.set(l.domainCode, (completedByDomain.get(l.domainCode) ?? 0) + 1);
        }
      }

      const attemptRows = deps.db
        .select({
          domainCode: quizAttempts.domainCode,
          correct: quizAttempts.correct,
          answeredAt: quizAttempts.answeredAt,
        })
        .from(quizAttempts)
        .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.certId, certId)))
        .all();

      const byDomain = new Map<string, AttemptLite[]>();
      for (const a of attemptRows) {
        const list = byDomain.get(a.domainCode);
        if (list) list.push(a);
        else byDomain.set(a.domainCode, [a]);
      }
      const readiness = computeReadiness(pack.domains, byDomain);
      const readinessByCode = new Map(readiness.perDomain.map((d) => [d.code, d]));

      const recent = deps.db
        .select()
        .from(quizSessions)
        .where(
          and(
            eq(quizSessions.userId, userId),
            eq(quizSessions.certId, certId),
            eq(quizSessions.mode, "practice"),
            isNotNull(quizSessions.finishedAt),
          ),
        )
        .orderBy(desc(quizSessions.startedAt))
        .limit(5)
        .all();

      // Mock exams are shown beside readiness rather than blended into it —
      // averaging two different measures makes both unreadable.
      const examRows = deps.db
        .select()
        .from(quizSessions)
        .where(
          and(
            eq(quizSessions.userId, userId),
            eq(quizSessions.certId, certId),
            eq(quizSessions.mode, "exam"),
            isNotNull(quizSessions.finishedAt),
          ),
        )
        .orderBy(desc(quizSessions.startedAt))
        .all();
      const scaledScores = examRows
        .map((s) => s.scaledScore)
        .filter((v): v is number => v !== null);

      const attempts = attemptRows.length;
      const correct = attemptRows.filter((a) => a.correct).length;
      const response: DashboardStats = {
        flashcards: {
          total: pack.flashcards.length,
          known: progressRows.filter((r) => r.status === "known").length,
          learning: progressRows.filter((r) => r.status === "learning").length,
        },
        course: {
          totalLessons: pack.course.length,
          completedLessons: completedLessonIds.size,
          perDomain: pack.domains
            .map((d) => {
              const total = lessonsByDomain.get(d.code) ?? 0;
              const completed = completedByDomain.get(d.code) ?? 0;
              return {
                code: d.code,
                totalLessons: total,
                completedLessons: completed,
                studiedPercent: total > 0 ? Math.round((completed / total) * 100) : null,
              };
            })
            .filter((d) => d.totalLessons > 0),
        },
        quiz: {
          attempts,
          correct,
          accuracy: attempts > 0 ? Math.round((correct / attempts) * 100) : null,
          readiness: readiness.overall,
          readinessConfident: readiness.confident,
          attemptsForConfidence: readiness.attemptsForConfidence,
          confidenceThreshold: CONFIDENT_ATTEMPTS,
          perDomain: pack.domains.map((d) => {
            const domainAttempts = byDomain.get(d.code) ?? [];
            const dCorrect = domainAttempts.filter((a) => a.correct).length;
            return {
              code: d.code,
              name: d.name,
              weight: d.weight,
              attempts: domainAttempts.length,
              correct: dCorrect,
              accuracy:
                domainAttempts.length > 0
                  ? Math.round((dCorrect / domainAttempts.length) * 100)
                  : null,
              mastery: readinessByCode.get(d.code)?.mastery ?? null,
              confident: readinessByCode.get(d.code)?.confident ?? false,
            };
          }),
        },
        gamification: (() => {
          // XP and streaks span every cert — they measure study habit, not
          // progress on one exam, so they are not scoped by certId.
          const stats = getStats(deps.db, userId);
          const { current, needed } = xpIntoCurrentLevel(stats.xp);
          const lastActive = deps.db
            .select({ lastActiveDate: gamificationStats.lastActiveDate })
            .from(gamificationStats)
            .where(eq(gamificationStats.userId, userId))
            .get()?.lastActiveDate;
          return {
            xp: stats.xp,
            level: stats.level,
            xpIntoLevel: current,
            xpForNextLevel: needed,
            currentStreak: stats.currentStreak,
            longestStreak: stats.longestStreak,
            activeToday: !!lastActive && isSameUtcDay(lastActive, new Date()),
          };
        })(),
        exams: {
          attempts: examRows.length,
          passed: examRows.filter((s) => s.passed).length,
          bestScaledScore: scaledScores.length > 0 ? Math.max(...scaledScores) : null,
          lastScaledScore: examRows[0]?.scaledScore ?? null,
          lastPassed: examRows[0]?.passed ?? null,
          passingScaledScore: pack.exam.passingScaledScore,
          recent: examRows.slice(0, 5).map((s) => ({
            sessionId: s.id,
            examMode: (s.examMode ?? "full") as "full" | "half" | "domain" | "pbq" | "weak",
            startedAt: s.startedAt.getTime(),
            finishedAt: s.finishedAt?.getTime() ?? null,
            total: s.questionCount,
            correct: s.correctCount ?? 0,
            score: s.score,
            scaledScore: s.scaledScore,
            passed: s.passed,
          })),
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
