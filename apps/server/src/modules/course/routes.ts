import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { CourseResponse } from "@comptia/shared-types";
import { courseFlags, courseProgress } from "../../db/schema";
import { recordActivity } from "../gamification/service";
import { h } from "../../lib/handler";
import { resolveCert, type ApiDeps } from "../shared";

const ProgressBody = z.object({
  certId: z.number().int(),
  lessonId: z.string().min(1),
  read: z.boolean().default(true),
});

const FlagBody = z.object({
  certId: z.number().int(),
  lessonId: z.string().min(1),
  flagged: z.boolean().default(true),
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

      const flagRows = deps.db
        .select({ lessonId: courseFlags.lessonId })
        .from(courseFlags)
        .where(and(eq(courseFlags.userId, req.user!.id), eq(courseFlags.certId, resolved.certId)))
        .all();

      const response: CourseResponse = {
        lessons: resolved.pack.course,
        // Only currently-read lessons appear here — a row that exists but
        // was unmarked (read: false) is deliberately absent, same as a row
        // that never existed. The client can't tell those apart and doesn't
        // need to; only the server needs the distinction, for the XP guard.
        progress: Object.fromEntries(
          rows.filter((r) => r.read).map((r) => [r.lessonId, r.completedAt.getTime()]),
        ),
        flagged: flagRows.map((r) => r.lessonId),
      };
      res.json(response);
    }),
  );

  // Idempotent and re-postable: marking an already-read lesson read again
  // just refreshes completedAt, so a client retry can't fail oddly. Unmarking
  // (read: false) never deletes the row — it flips the flag and leaves
  // completedAt untouched, so a later remark can't re-earn XP it already
  // earned once. XP is guarded purely by row *existence*, not by the read
  // flag, which is what makes mark -> unmark -> remark loop-proof.
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
          read: body.read,
        })
        .onConflictDoUpdate({
          target: [courseProgress.userId, courseProgress.certId, courseProgress.lessonId],
          // Only a mark-as-read bumps the timestamp; an unmark just flips the
          // flag, so "last actually read" doesn't drift on every toggle.
          set: body.read ? { read: true, completedAt: new Date() } : { read: false },
        })
        .run();

      if (!existing && body.read) {
        recordActivity(deps.db, req.user!.id, "lesson_completed");
      }

      res.json({ ok: true });
    }),
  );

  // Independent of read state — see the comment on `courseFlags` in schema.ts
  // for why this isn't a column on course_progress. Row existence is the
  // whole signal, so clearing a flag deletes the row rather than flipping it.
  router.post(
    "/course/flag",
    h((req, res) => {
      const body = FlagBody.parse(req.body);
      const pack = deps.content.byCertId.get(body.certId);
      if (!pack) {
        res.status(404).json({ error: "Unknown cert" });
        return;
      }
      if (!pack.course.some((l) => l.id === body.lessonId)) {
        res.status(404).json({ error: "Unknown lesson" });
        return;
      }

      if (body.flagged) {
        deps.db
          .insert(courseFlags)
          .values({
            userId: req.user!.id,
            certId: body.certId,
            lessonId: body.lessonId,
            flaggedAt: new Date(),
          })
          .onConflictDoNothing()
          .run();
      } else {
        deps.db
          .delete(courseFlags)
          .where(
            and(
              eq(courseFlags.userId, req.user!.id),
              eq(courseFlags.certId, body.certId),
              eq(courseFlags.lessonId, body.lessonId),
            ),
          )
          .run();
      }

      res.json({ ok: true });
    }),
  );

  return router;
}
