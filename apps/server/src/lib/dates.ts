/**
 * Exam dates are calendar dates, not instants. They are stored as midnight UTC
 * and must be compared in UTC throughout.
 *
 * Mixing in local-time arithmetic silently shifts the day for anyone at a
 * negative UTC offset — a date picked as the 25th reads back as the 24th in
 * Los Angeles, so the countdown is short by one and reminders fire a day
 * early. Per-user local delivery is a Phase 5 concern; this keeps the one
 * timeline we do have internally consistent.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function utcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Whole calendar days from `now` to `target`, both taken in UTC. */
export function utcDaysUntil(target: Date, now: Date = new Date()): number {
  return Math.round((utcMidnight(target) - utcMidnight(now)) / MS_PER_DAY);
}

/** yyyy-MM-dd in UTC. */
export function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** e.g. "Tuesday 25 August 2026", rendered in UTC. */
export function utcLongDate(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** ISO week key such as 2026-W33, in UTC. */
export function utcIsoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // ISO weeks run Monday–Sunday and belong to the year containing their Thursday.
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
