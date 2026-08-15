import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { ExamPlanDto } from "@comptia/shared-types";
import { examPlans } from "../../db/schema";
import { utcDaysUntil } from "../../lib/dates";
import { h } from "../../lib/handler";
import type { ApiDeps } from "../shared";

const SaveBody = z.object({
  certId: z.number().int(),
  /** Date only. Stored as midnight UTC so "days remaining" is calendar-based. */
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "examDate must be YYYY-MM-DD"),
});

function toDto(row: { certId: number; examDate: Date; createdAt: Date }): ExamPlanDto {
  return {
    certId: row.certId,
    examDate: row.examDate.getTime(),
    daysRemaining: utcDaysUntil(row.examDate),
    createdAt: row.createdAt.getTime(),
  };
}

export function plannerRoutes(deps: ApiDeps): Router {
  const router = Router();

  router.get(
    "/exam-plans",
    h((req, res) => {
      const rows = deps.db
        .select()
        .from(examPlans)
        .where(eq(examPlans.userId, req.user!.id))
        .all();
      res.json(rows.map(toDto));
    }),
  );

  router.put(
    "/exam-plans",
    h((req, res) => {
      const body = SaveBody.parse(req.body);
      if (!deps.content.byCertId.has(body.certId)) {
        res.status(404).json({ error: "Unknown cert" });
        return;
      }
      const examDate = new Date(`${body.examDate}T00:00:00.000Z`);
      if (Number.isNaN(examDate.getTime())) {
        res.status(400).json({ error: "Invalid date" });
        return;
      }

      const existing = deps.db
        .select()
        .from(examPlans)
        .where(and(eq(examPlans.userId, req.user!.id), eq(examPlans.certId, body.certId)))
        .get();

      // One plan per user per cert: booking a new date replaces the old one.
      if (existing) {
        deps.db.update(examPlans).set({ examDate }).where(eq(examPlans.id, existing.id)).run();
        res.json(toDto({ ...existing, examDate }));
        return;
      }
      const created = deps.db
        .insert(examPlans)
        .values({ userId: req.user!.id, certId: body.certId, examDate, createdAt: new Date() })
        .returning()
        .get();
      res.json(toDto(created));
    }),
  );

  router.delete(
    "/exam-plans/:certId",
    h((req, res) => {
      const certId = Number(req.params.certId);
      if (!Number.isInteger(certId)) {
        res.status(400).json({ error: "certId must be an integer" });
        return;
      }
      deps.db
        .delete(examPlans)
        .where(and(eq(examPlans.userId, req.user!.id), eq(examPlans.certId, certId)))
        .run();
      res.json({ ok: true });
    }),
  );

  return router;
}
