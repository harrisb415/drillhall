import cron, { type ScheduledTask } from "node-cron";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { examPlans, quizAttempts, quizSessions, user } from "../../db/schema";
import {
  dateKeyInZone,
  hourInZone,
  utcDateKey,
  utcDaysUntil,
  utcIsoWeekKey,
  utcLongDate,
} from "../../lib/dates";
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
  /**
   * Skip the local-hour gate. Tests and a manual sweep want every eligible
   * message now rather than only those whose local morning has arrived.
   */
  ignoreDeliveryWindow?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Reminders go out during this local-hour window for the recipient. A nudge
 * that lands at 3am reads as noise, and the whole point of storing the
 * timezone was to avoid that.
 *
 * The job runs every 30 minutes, so any user whose local clock passes through
 * this window gets picked up. Users with no timezone recorded fall back to
 * UTC, which is the old behaviour rather than being skipped entirely.
 */
const DELIVERY_HOUR_START = 8;
const DELIVERY_HOUR_END = 20;

function withinDeliveryWindow(deps: SchedulerDeps, now: Date, timezone: string | null): boolean {
  if (deps.ignoreDeliveryWindow) return true;
  const hour = hourInZone(now, timezone);
  return hour >= DELIVERY_HOUR_START && hour < DELIVERY_HOUR_END;
}

function certName(deps: SchedulerDeps, certId: number): string {
  return deps.content.byCertId.get(certId)?.name ?? "your certification";
}

/**
 * Which lead-time window an exam falls in is computed in UTC, because the exam
 * date is a UTC calendar date. *When* the resulting mail is sent is gated on
 * the recipient's local hour, so "3 days out" is decided consistently but
 * delivered civilly.
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
    if (!withinDeliveryWindow(deps, now, prefs.timezone)) continue;

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

    const prefs = getPrefs(deps.db, row.id);
    if (!withinDeliveryWindow(deps, now, prefs.timezone)) continue;

    const idleDays = Math.floor((now.getTime() - last) / DAY_MS);
    const ok = await deps.notifications.send({
      userId: row.id,
      email: row.email,
      name: row.name,
      type: "inactivity",
      // One nudge per *their* calendar day, so someone near the dateline
      // can't be nudged twice as UTC rolls over mid-afternoon for them.
      windowKey: `inactive:${dateKeyInZone(now, prefs.timezone)}`,
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

    const prefs = getPrefs(deps.db, row.id);
    if (!withinDeliveryWindow(deps, now, prefs.timezone)) continue;

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
