import cron, { type ScheduledTask } from "node-cron";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { examPlans, quizAttempts, quizSessions, user } from "../../db/schema";
import { utcDateKey, utcDaysUntil, utcIsoWeekKey, utcLongDate } from "../../lib/dates";
import type { Db } from "../../db";
import type { Logger } from "../../lib/logger";
import type { ContentIndex } from "../certs/content";
import type { NotificationService } from "./service";
import { getPrefs } from "./service";

export interface SchedulerDeps {
  db: Db;
  content: ContentIndex;
  notifications: NotificationService;
  logger: Logger;
  baseURL: string;
  /** Days of silence before a nudge. */
  inactivityDays?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function certName(deps: SchedulerDeps, certId: number): string {
  return deps.content.byCertId.get(certId)?.name ?? "your certification";
}

/**
 * Windows are computed in UTC. Per-user local-time delivery is deliberately
 * deferred — the timezone column is captured, but converting send times per
 * user is real complexity for a nudge that is not time-critical.
 */
export async function checkExamReminders(deps: SchedulerDeps, now = new Date()): Promise<number> {
  const rows = deps.db
    .select({
      userId: examPlans.userId,
      certId: examPlans.certId,
      examDate: examPlans.examDate,
      email: user.email,
      name: user.name,
    })
    .from(examPlans)
    .innerJoin(user, eq(user.id, examPlans.userId))
    .all();

  let sent = 0;
  for (const row of rows) {
    const daysOut = utcDaysUntil(row.examDate, now);
    if (daysOut < 0) continue;

    const prefs = getPrefs(deps.db, row.userId);
    if (!prefs.examReminderDays.includes(daysOut)) continue;

    const when =
      daysOut === 0 ? "today" : daysOut === 1 ? "tomorrow" : `in ${daysOut} days`;
    const ok = await deps.notifications.send({
      userId: row.userId,
      email: row.email,
      name: row.name,
      type: "exam_reminder",
      // One reminder per plan per lead-time, forever — re-running the job or
      // restarting the process cannot produce a second copy.
      windowKey: `exam:${row.certId}:${utcDateKey(row.examDate)}:${daysOut}`,
      subject: `${certName(deps, row.certId)} exam ${when}`,
      body:
        `Hi ${row.name},\n\n` +
        `Your ${certName(deps, row.certId)} exam is ${when} ` +
        `(${utcLongDate(row.examDate)}).\n\n` +
        `A timed mock exam is the fastest way to find out where you stand:\n` +
        `${deps.baseURL}/exam\n\n` +
        `Good luck.\n`,
    });
    if (ok) sent++;
  }
  return sent;
}

export async function checkInactivityNudges(deps: SchedulerDeps, now = new Date()): Promise<number> {
  const threshold = deps.inactivityDays ?? 7;
  const cutoff = new Date(now.getTime() - threshold * DAY_MS);

  // Two grouped reads merged in memory. A correlated subquery would save a
  // round trip but this is a friend-group-sized table, and being obviously
  // correct matters more than saving a millisecond.
  const lastActivity = new Map<string, number>();
  const note = (userId: string, at: number) => {
    lastActivity.set(userId, Math.max(lastActivity.get(userId) ?? 0, at));
  };
  for (const row of deps.db
    .select({ userId: quizAttempts.userId, at: sql<number>`max(${quizAttempts.answeredAt})` })
    .from(quizAttempts)
    .groupBy(quizAttempts.userId)
    .all()) {
    note(row.userId, Number(row.at));
  }
  for (const row of deps.db
    .select({ userId: quizSessions.userId, at: sql<number>`max(${quizSessions.startedAt})` })
    .from(quizSessions)
    .groupBy(quizSessions.userId)
    .all()) {
    note(row.userId, Number(row.at));
  }

  const rows = deps.db.select({ id: user.id, email: user.email, name: user.name }).from(user).all();

  let sent = 0;
  for (const row of rows) {
    const last = lastActivity.get(row.id) ?? 0;
    // Never-active accounts are left alone; a nudge to someone who has not
    // started is noise, not a reminder.
    if (last === 0 || last > cutoff.getTime()) continue;

    const idleDays = Math.floor((now.getTime() - last) / DAY_MS);
    const ok = await deps.notifications.send({
      userId: row.id,
      email: row.email,
      name: row.name,
      type: "inactivity",
      // At most one nudge per calendar day, however often the job runs.
      windowKey: `inactive:${utcDateKey(now)}`,
      subject: "Still studying?",
      body:
        `Hi ${row.name},\n\n` +
        `It has been ${idleDays} days since your last question. ` +
        `Twenty minutes on your weakest domain is enough to keep the material warm:\n` +
        `${deps.baseURL}/exam\n\n` +
        `If you would rather not get these, turn them off in Settings.\n`,
    });
    if (ok) sent++;
  }
  return sent;
}

export async function checkWeeklyDigest(deps: SchedulerDeps, now = new Date()): Promise<number> {
  const weekKey = utcIsoWeekKey(now);
  const since = new Date(now.getTime() - 7 * DAY_MS);

  const rows = deps.db
    .select({ id: user.id, email: user.email, name: user.name })
    .from(user)
    .all();

  let sent = 0;
  for (const row of rows) {
    const attempts = deps.db
      .select({ correct: quizAttempts.correct, answeredAt: quizAttempts.answeredAt })
      .from(quizAttempts)
      .where(eq(quizAttempts.userId, row.id))
      .all()
      .filter((a) => a.answeredAt.getTime() >= since.getTime());
    if (attempts.length === 0) continue; // nothing happened; say nothing

    const correct = attempts.filter((a) => a.correct).length;
    const exams = deps.db
      .select({ scaledScore: quizSessions.scaledScore, passed: quizSessions.passed })
      .from(quizSessions)
      .where(
        and(
          eq(quizSessions.userId, row.id),
          eq(quizSessions.mode, "exam"),
          isNotNull(quizSessions.finishedAt),
        ),
      )
      .all();

    const best = exams.map((e) => e.scaledScore ?? 0).reduce((a, b) => Math.max(a, b), 0);
    const ok = await deps.notifications.send({
      userId: row.id,
      email: row.email,
      name: row.name,
      type: "weekly_digest",
      windowKey: `digest:${weekKey}`,
      subject: "Your week of study",
      body:
        `Hi ${row.name},\n\n` +
        `This week you answered ${attempts.length} questions and got ${correct} right ` +
        `(${Math.round((correct / attempts.length) * 100)}%).\n` +
        (best > 0 ? `Your best mock exam score so far is ${best}.\n` : "") +
        `\nPick up where you left off:\n${deps.baseURL}/dashboard\n`,
    });
    if (ok) sent++;
  }
  return sent;
}

export async function runAllChecks(deps: SchedulerDeps, now = new Date()): Promise<void> {
  for (const [name, check] of [
    ["exam reminders", checkExamReminders],
    ["inactivity nudges", checkInactivityNudges],
    ["weekly digest", checkWeeklyDigest],
  ] as const) {
    try {
      const sent = await check(deps, now);
      if (sent > 0) deps.logger.info({ sent }, `${name} dispatched`);
    } catch (err) {
      // One failing check must not stop the others.
      deps.logger.error({ err }, `${name} check failed`);
    }
  }
}

/**
 * The entire scheduling layer: one in-process timer. At this user count and
 * with a single Express instance there is nothing a queue or leader election
 * would add — and the unique constraint already makes a duplicate send
 * impossible even if two processes did run.
 */
export function startScheduler(deps: SchedulerDeps, expression = "*/30 * * * *"): ScheduledTask {
  const task = cron.schedule(expression, () => {
    void runAllChecks(deps);
  });
  deps.logger.info({ expression }, "notification scheduler started");
  return task;
}
