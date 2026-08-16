import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import { gamificationStats } from "../../db/schema";
import { isSameUtcDay, isUtcYesterday } from "../../lib/dates";
import { computeLevel } from "./levels";

export type XpAction = "question_answered" | "session_completed" | "exam_completed" | "flashcard_known";

export const XP_VALUES: Record<XpAction, number> = {
  question_answered: 10,
  session_completed: 50,
  exam_completed: 200,
  flashcard_known: 2,
};

export interface GamificationResult {
  xp: number;
  level: number;
  leveledUp: boolean;
  currentStreak: number;
  longestStreak: number;
  streakExtended: boolean;
}

/**
 * Awards XP and updates the streak for one qualifying activity.
 *
 * Triggered by the activity itself — not by login — because a session can
 * run for days without generating a fresh "login" event while the user
 * studies daily inside it. Gating the streak on login would silently freeze
 * it for exactly that case.
 *
 * Wrapped in a transaction because the naive version — read stats,
 * conditionally modify, write back — has a real race: two requests for the
 * same user close together (a double submit, two open tabs) can both read
 * the pre-update state and one write clobbers the other's XP or double-counts
 * a streak day. better-sqlite3's transaction takes an exclusive lock for its
 * duration, which closes that window.
 */
export function recordActivity(db: Db, userId: string, action: XpAction, now: Date = new Date()): GamificationResult {
  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(gamificationStats)
      .where(eq(gamificationStats.userId, userId))
      .get();

    const before = existing ?? {
      userId,
      xp: 0,
      level: 1,
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: null as Date | null,
    };

    let currentStreak = before.currentStreak;
    let longestStreak = before.longestStreak;
    let streakExtended = false;
    // The isSameDay guard is what makes repeated calls in one sitting safe:
    // answer 50 questions today and XP accrues 50 times, but the streak only
    // mutates on that day's first qualifying activity.
    if (!before.lastActiveDate || !isSameUtcDay(before.lastActiveDate, now)) {
      currentStreak = before.lastActiveDate && isUtcYesterday(before.lastActiveDate, now)
        ? before.currentStreak + 1
        : 1; // gap of 2+ days, or first activity ever, resets to 1
      longestStreak = Math.max(longestStreak, currentStreak);
      streakExtended = true;
    }

    const xp = before.xp + XP_VALUES[action];
    const level = computeLevel(xp);
    const leveledUp = level > before.level;

    const values = {
      userId,
      xp,
      level,
      currentStreak,
      longestStreak,
      lastActiveDate: now,
    };
    if (existing) {
      tx.update(gamificationStats).set(values).where(eq(gamificationStats.userId, userId)).run();
    } else {
      tx.insert(gamificationStats).values(values).run();
    }

    return { xp, level, leveledUp, currentStreak, longestStreak, streakExtended };
  });
}

export function getStats(db: Db, userId: string): GamificationResult & { hasActivity: boolean } {
  const row = db.select().from(gamificationStats).where(eq(gamificationStats.userId, userId)).get();
  if (!row) {
    return { xp: 0, level: 1, leveledUp: false, currentStreak: 0, longestStreak: 0, streakExtended: false, hasActivity: false };
  }
  return {
    xp: row.xp,
    level: row.level,
    leveledUp: false,
    currentStreak: row.currentStreak,
    longestStreak: row.longestStreak,
    streakExtended: false,
    hasActivity: true,
  };
}
