import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { FlashcardsResponse } from "@comptia/shared-types";
import { flashcardProgress } from "../../db/schema";
import { h } from "../../lib/handler";
import { resolveCert, type ApiDeps } from "../shared";

const ProgressBody = z.object({
  certId: z.number().int(),
  cardId: z.string().min(1),
  status: z.enum(["known", "learning"]),
});

export function flashcardsRoutes(deps: ApiDeps): Router {
  const router = Router();

  router.get(
    "/certs/:certId/flashcards",
    h((req, res) => {
      const resolved = resolveCert(deps, req, res);
      if (!resolved) return;
      const rows = deps.db
        .select()
        .from(flashcardProgress)
        .where(
          and(
            eq(flashcardProgress.userId, req.user!.id),
            eq(flashcardProgress.certId, resolved.certId),
          ),
        )
        .all();
      const response: FlashcardsResponse = {
        cards: resolved.pack.flashcards,
        progress: Object.fromEntries(rows.map((r) => [r.cardId, r.status])),
      };
      res.json(response);
    }),
  );

  router.post(
    "/flashcards/progress",
    h((req, res) => {
      const body = ProgressBody.parse(req.body);
      const pack = deps.content.byCertId.get(body.certId);
      if (!pack) {
        res.status(404).json({ error: "Unknown cert" });
        return;
      }
      if (!pack.flashcards.some((c) => c.id === body.cardId)) {
        res.status(404).json({ error: "Unknown card" });
        return;
      }
      deps.db
        .insert(flashcardProgress)
        .values({
          userId: req.user!.id,
          certId: body.certId,
          cardId: body.cardId,
          status: body.status,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [flashcardProgress.userId, flashcardProgress.certId, flashcardProgress.cardId],
          set: { status: body.status, updatedAt: new Date() },
        })
        .run();
      res.json({ ok: true });
    }),
  );

  return router;
}
