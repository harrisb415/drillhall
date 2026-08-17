import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { FlashcardsResponse } from "@comptia/shared-types";
import { flashcardProgress, flashcardState } from "../../db/schema";
import { recordActivity } from "../gamification/service";
import { h } from "../../lib/handler";
import { resolveCert, type ApiDeps } from "../shared";

const ProgressBody = z.object({
  certId: z.number().int(),
  cardId: z.string().min(1),
  status: z.enum(["known", "learning"]),
});

const StateBody = z.object({
  certId: z.number().int(),
  domainCode: z.string().min(1).nullable(),
  hideKnown: z.boolean(),
  seed: z.number().int().min(0),
  cardIndex: z.number().int().min(0),
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
      const state = deps.db
        .select()
        .from(flashcardState)
        .where(
          and(eq(flashcardState.userId, req.user!.id), eq(flashcardState.certId, resolved.certId)),
        )
        .get();

      const response: FlashcardsResponse = {
        cards: resolved.pack.flashcards,
        progress: Object.fromEntries(rows.map((r) => [r.cardId, r.status])),
        state: state
          ? {
              domainCode: state.domainCode,
              hideKnown: state.hideKnown,
              seed: state.seed,
              cardIndex: state.cardIndex,
            }
          : null,
      };
      res.json(response);
    }),
  );

  // Upserted on every navigation within the deck (debounced client-side) so
  // position survives a reload or a switch to another device. Not validated
  // against the current card count here — a shrunken deck (e.g. a domain
  // filter change) is a client-side concern; the client clamps on load.
  router.post(
    "/flashcards/state",
    h((req, res) => {
      const body = StateBody.parse(req.body);
      if (!deps.content.byCertId.has(body.certId)) {
        res.status(404).json({ error: "Unknown cert" });
        return;
      }

      deps.db
        .insert(flashcardState)
        .values({
          userId: req.user!.id,
          certId: body.certId,
          domainCode: body.domainCode,
          hideKnown: body.hideKnown,
          seed: body.seed,
          cardIndex: body.cardIndex,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [flashcardState.userId, flashcardState.certId],
          set: {
            domainCode: body.domainCode,
            hideKnown: body.hideKnown,
            seed: body.seed,
            cardIndex: body.cardIndex,
            updatedAt: new Date(),
          },
        })
        .run();

      res.json({ ok: true });
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

      const existing = deps.db
        .select({ status: flashcardProgress.status })
        .from(flashcardProgress)
        .where(
          and(
            eq(flashcardProgress.userId, req.user!.id),
            eq(flashcardProgress.certId, body.certId),
            eq(flashcardProgress.cardId, body.cardId),
          ),
        )
        .get();

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

      // XP on the transition into "known" only — re-saving an already-known
      // card is a no-op for XP, so toggling back and forth can't farm it.
      if (body.status === "known" && existing?.status !== "known") {
        recordActivity(deps.db, req.user!.id, "flashcard_known");
      }

      res.json({ ok: true });
    }),
  );

  return router;
}
