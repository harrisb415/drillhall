import { Router } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { notificationPreferences } from "../../db/schema";
import { h } from "../../lib/handler";
import type { ApiDeps } from "../shared";

const TimezoneBody = z.object({ timezone: z.string().min(1).max(100) });

export function settingsRoutes(deps: ApiDeps): Router {
  const router = Router();

  // Captures the browser's IANA timezone at signup/first load (spec §4).
  // Only fills the column while it is still null, so a user-chosen timezone
  // (Phase 4 settings page) is never clobbered.
  router.post(
    "/settings/timezone",
    h((req, res) => {
      const { timezone } = TimezoneBody.parse(req.body);
      deps.db
        .insert(notificationPreferences)
        .values({ userId: req.user!.id, timezone })
        .onConflictDoUpdate({
          target: notificationPreferences.userId,
          set: {
            timezone: sql`coalesce(${notificationPreferences.timezone}, ${timezone})`,
          },
        })
        .run();
      res.json({ ok: true });
    }),
  );

  return router;
}
