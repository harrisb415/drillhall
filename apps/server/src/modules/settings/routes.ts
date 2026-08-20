import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { NotificationPrefsDto } from "@comptia/shared-types";
import {
  courseFlags,
  courseProgress,
  flashcardProgress,
  flashcardState,
  gamificationStats,
  notificationPreferences,
  quizAttempts,
  quizSessions,
} from "../../db/schema";
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

  // Wipes every scrap of study progress for the signed-in user — XP, level,
  // streaks, quiz/exam history, flashcard state, and course read/flag state —
  // while leaving the account, its login, and settings (notification prefs,
  // booked exam date) untouched. Wrapped in a transaction so a mid-way
  // failure can't leave some tables cleared and others not.
  router.post(
    "/settings/reset-progress",
    h((req, res) => {
      const userId = req.user!.id;
      deps.db.transaction((tx) => {
        tx.delete(quizAttempts).where(eq(quizAttempts.userId, userId)).run();
        tx.delete(quizSessions).where(eq(quizSessions.userId, userId)).run();
        tx.delete(flashcardProgress).where(eq(flashcardProgress.userId, userId)).run();
        tx.delete(flashcardState).where(eq(flashcardState.userId, userId)).run();
        tx.delete(courseProgress).where(eq(courseProgress.userId, userId)).run();
        tx.delete(courseFlags).where(eq(courseFlags.userId, userId)).run();
        tx.delete(gamificationStats).where(eq(gamificationStats.userId, userId)).run();
      });
      res.json({ ok: true });
    }),
  );

  // Same wipe, scoped to a single cert — for "I want to start Network+ over
  // without touching my Core 1 progress." XP/level/streak are deliberately
  // left alone here: they measure study habit across every certification,
  // not progress against one exam (see the dashboard's gamification query),
  // so there's nothing cert-scoped to reset there.
  router.post(
    "/settings/reset-progress/:certId",
    h((req, res) => {
      const certId = Number(req.params.certId);
      if (!Number.isInteger(certId)) {
        res.status(400).json({ error: "certId must be an integer" });
        return;
      }
      if (!deps.content.byCertId.has(certId)) {
        res.status(404).json({ error: "Unknown cert" });
        return;
      }
      const userId = req.user!.id;
      deps.db.transaction((tx) => {
        tx.delete(quizAttempts)
          .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.certId, certId)))
          .run();
        tx.delete(quizSessions)
          .where(and(eq(quizSessions.userId, userId), eq(quizSessions.certId, certId)))
          .run();
        tx.delete(flashcardProgress)
          .where(and(eq(flashcardProgress.userId, userId), eq(flashcardProgress.certId, certId)))
          .run();
        tx.delete(flashcardState)
          .where(and(eq(flashcardState.userId, userId), eq(flashcardState.certId, certId)))
          .run();
        tx.delete(courseProgress)
          .where(and(eq(courseProgress.userId, userId), eq(courseProgress.certId, certId)))
          .run();
        tx.delete(courseFlags)
          .where(and(eq(courseFlags.userId, userId), eq(courseFlags.certId, certId)))
          .run();
      });
      res.json({ ok: true });
    }),
  );

  return router;
}
