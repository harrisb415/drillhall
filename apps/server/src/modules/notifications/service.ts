import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import { notificationLog, notificationPreferences } from "../../db/schema";
import type { Logger } from "../../lib/logger";
import type { SendEmail } from "./providers/email";

export type NotificationType = "exam_reminder" | "inactivity" | "weekly_digest";

export interface NotificationPrefs {
  emailEnabled: boolean;
  examReminders: boolean;
  examReminderDays: number[];
  inactivityReminders: boolean;
  digestFrequency: string;
  timezone: string | null;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  emailEnabled: true,
  examReminders: true,
  examReminderDays: [7, 3, 1],
  inactivityReminders: true,
  digestFrequency: "weekly",
  timezone: null,
};

function parseDays(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((n): n is number => Number.isFinite(n));
  } catch {
    /* fall through to the default */
  }
  return DEFAULT_PREFS.examReminderDays;
}

export function getPrefs(db: Db, userId: string): NotificationPrefs {
  const row = db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .get();
  if (!row) return DEFAULT_PREFS;
  return {
    emailEnabled: row.emailEnabled,
    examReminders: row.examReminders,
    examReminderDays: parseDays(row.examReminderDays),
    inactivityReminders: row.inactivityReminders,
    digestFrequency: row.digestFrequency,
    timezone: row.timezone,
  };
}

function wantsType(prefs: NotificationPrefs, type: NotificationType): boolean {
  if (!prefs.emailEnabled) return false;
  switch (type) {
    case "exam_reminder":
      return prefs.examReminders;
    case "inactivity":
      return prefs.inactivityReminders;
    case "weekly_digest":
      return prefs.digestFrequency !== "never";
  }
}

export interface NotificationService {
  /** Returns true when an email was actually dispatched. */
  send(input: {
    userId: string;
    email: string;
    name: string;
    type: NotificationType;
    /** stable per intended send; the unique index makes a repeat impossible */
    windowKey: string;
    subject: string;
    body: string;
  }): Promise<boolean>;
}

export function createNotificationService(deps: {
  db: Db;
  sendEmail: SendEmail;
  logger: Logger;
}): NotificationService {
  return {
    async send(input) {
      const prefs = getPrefs(deps.db, input.userId);
      if (!wantsType(prefs, input.type)) return false;

      // Claim the send by inserting first. The unique index on
      // (user_id, type, window_key) is the dedupe mechanism: a duplicate
      // attempt throws here rather than racing a check-then-insert, so even
      // two processes cannot both decide to send.
      try {
        deps.db
          .insert(notificationLog)
          .values({
            userId: input.userId,
            type: input.type,
            sentAt: new Date(),
            channel: "email",
            windowKey: input.windowKey,
          })
          .run();
      } catch {
        return false; // already claimed — nothing to do
      }

      try {
        await deps.sendEmail({ to: input.email, subject: input.subject, text: input.body });
        return true;
      } catch (err) {
        // The claim stays. Retrying a reminder risks spamming far more than a
        // single missed nudge costs, and the next window will come around.
        deps.logger.error(
          { err, userId: input.userId, type: input.type },
          "notification email failed after being claimed",
        );
        return false;
      }
    },
  };
}
