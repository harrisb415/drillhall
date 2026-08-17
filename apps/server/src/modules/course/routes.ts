import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { CourseResponse } from "@comptia/shared-types";
import { courseProgress } from "../../db/schema";
import { recordActivity } from "../gamification/service";
import { h } from "../../lib/handler";
import { resolveCert, type ApiDeps } from "../shared";

const ProgressBody = z.object({
  certId: z.number().int(),
  lessonId: z.string().min(1),
});

export function courseRoutes(deps: ApiDeps): Router {
  const router = Router();

  router.get(
    "/certs/:certId/course",
    h((req, res) => {
      const resolved = resolveCert(deps, req, res);
      if (!resolved) return;

      const rows = deps.db
        .select()
        .from(courseProgress)
        .where(
          and(eq(courseProgress.userId, req.user!.id), eq(courseProgress.certId, resolved.certId)),
        )
        .all();

      const response: CourseResponse = {
        lessons: resolved.pack.course,
        progress: Object.fromEntries(rows.map((r) => [r.lessonId, r.completedAt.getTime()])),
      };
      res.json(response);
    }),
  );

  // Idempotent and re-postable: completing an already-completed lesson just
  // refreshes completedAt rather than erroring, so a client retry can't fail
  // oddly. XP is guarded separately, by row existence, so a retry can't farm it.
  router.post(
    "/course/progress",
    h((req, res) => {
      const body = ProgressBody.parse(req.body);
      const pack = deps.content.byCertId.get(body.certId);
      if (!pack) {
        res.status(404).json({ error: "Unknown cert" });
        return;
      }
      if (!pack.course.some((l) => l.id === body.lessonId)) {
        res.status(404).json({ error: "Unknown lesson" });
        return;
      }

      const existing = deps.db
        .select({ lessonId: courseProgress.lessonId })
        .from(courseProgress)
        .where(
          and(
            eq(courseProgress.userId, req.user!.id),
            eq(courseProgress.certId, body.certId),
            eq(courseProgress.lessonId, body.lessonId),
          ),
        )
        .get();

      deps.db
        .insert(courseProgress)
        .values({
          userId: req.user!.id,
          certId: body.certId,
          lessonId: body.lessonId,
          completedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [courseProgress.userId, courseProgress.certId, courseProgress.lessonId],
          set: { completedAt: new Date() },
        })
        .run();

      if (!existing) {
        recordActivity(deps.db, req.user!.id, "lesson_completed");
      }

      res.json({ ok: true });
    }),
  );

  return router;
}
