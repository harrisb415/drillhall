import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { NotificationPrefsDto } from "@comptia/shared-types";
import { notificationPreferences } from "../../db/schema";
import { h } from "../../lib/handler";
import { getPrefs } from "../notifications/service";
import type { ApiDeps } from "../shared";

const TimezoneBody = z.object({ timezone: z.string().min(1).max(100) });

const PrefsBody = z.object({
  emailEnabled: z.boolean().optional(),
  examReminders: z.boolean().optional(),
  examReminderDays: z.array(z.number().int().min(0).max(90)).max(6).optional(),
  inactivityReminders: z.boolean().optional(),
  digestFrequency: z.enum(["weekly", "never"]).optional(),
  timezone: z.string().min(1).max(100).nullable().optional(),
});

export function settingsRoutes(deps: ApiDeps): Router {
  const router = Router();

  // Captures the browser's IANA timezone at signup/first load (spec §4).
  // Only fills the column while it is still null, so a user-chosen timezone
  // is never clobbered.
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

  router.get(
    "/settings/notifications",
    h((req, res) => {
      const prefs = getPrefs(deps.db, req.user!.id);
      const dto: NotificationPrefsDto = {
        emailEnabled: prefs.emailEnabled,
        examReminders: prefs.examReminders,
        examReminderDays: [...prefs.examReminderDays].sort((a, b) => b - a),
        inactivityReminders: prefs.inactivityReminders,
        digestFrequency: prefs.digestFrequency === "never" ? "never" : "weekly",
        timezone: prefs.timezone,
        emailDeliveryConfigured: deps.emailDeliveryConfigured,
      };
      res.json(dto);
    }),
  );

  router.put(
    "/settings/notifications",
    h((req, res) => {
      const body = PrefsBody.parse(req.body);
      const current = getPrefs(deps.db, req.user!.id);
      const merged = {
        emailEnabled: body.emailEnabled ?? current.emailEnabled,
        examReminders: body.examReminders ?? current.examReminders,
        examReminderDays: body.examReminderDays ?? current.examReminderDays,
        inactivityReminders: body.inactivityReminders ?? current.inactivityReminders,
        digestFrequency: body.digestFrequency ?? current.digestFrequency,
        timezone: body.timezone === undefined ? current.timezone : body.timezone,
      };

      deps.db
        .insert(notificationPreferences)
        .values({
          userId: req.user!.id,
          emailEnabled: merged.emailEnabled,
          examReminders: merged.examReminders,
          examReminderDays: JSON.stringify(merged.examReminderDays),
          inactivityReminders: merged.inactivityReminders,
          digestFrequency: merged.digestFrequency,
          timezone: merged.timezone,
        })
        .onConflictDoUpdate({
          target: notificationPreferences.userId,
          set: {
            emailEnabled: merged.emailEnabled,
            examReminders: merged.examReminders,
            examReminderDays: JSON.stringify(merged.examReminderDays),
            inactivityReminders: merged.inactivityReminders,
            digestFrequency: merged.digestFrequency,
            timezone: merged.timezone,
          },
        })
        .run();

      const dto: NotificationPrefsDto = {
        ...merged,
        examReminderDays: [...merged.examReminderDays].sort((a, b) => b - a),
        digestFrequency: merged.digestFrequency === "never" ? "never" : "weekly",
        emailDeliveryConfigured: deps.emailDeliveryConfigured,
      };
      res.json(dto);
    }),
  );

  return router;
}
