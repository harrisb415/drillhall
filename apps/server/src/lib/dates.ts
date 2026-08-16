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

/** Whole calendar days from `a` to `b`, both taken in UTC (positive when `b` is later). */
export function utcCalendarDayDiff(a: Date, b: Date): number {
  return Math.round((utcMidnight(b) - utcMidnight(a)) / MS_PER_DAY);
}

/** Whole calendar days from `now` to `target`, both taken in UTC. */
export function utcDaysUntil(target: Date, now: Date = new Date()): number {
  return utcCalendarDayDiff(now, target);
}

/** Same UTC calendar date — used for "did this already happen today". */
export function isSameUtcDay(a: Date, b: Date): boolean {
  return utcCalendarDayDiff(a, b) === 0;
}

/** `earlier` is exactly one UTC calendar day before `reference`. */
export function isUtcYesterday(earlier: Date, reference: Date): boolean {
  return utcCalendarDayDiff(earlier, reference) === 1;
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

/**
 * The local hour (0–23) in an IANA zone at a given instant.
 * Falls back to the UTC hour if the zone string is unusable, so a bad value in
 * the database degrades to the old behaviour rather than throwing mid-sweep.
 */
export function hourInZone(at: Date, timeZone: string | null): number {
  if (!timeZone) return at.getUTCHours();
  try {
    const hour = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "numeric",
      hour12: false,
    }).format(at);
    const parsed = Number(hour);
    return Number.isFinite(parsed) ? parsed % 24 : at.getUTCHours();
  } catch {
    return at.getUTCHours();
  }
}

/** yyyy-MM-dd as it reads in the given zone, for per-user daily dedupe keys. */
export function dateKeyInZone(at: Date, timeZone: string | null): string {
  if (!timeZone) return utcDateKey(at);
  try {
    // en-CA renders ISO-style yyyy-mm-dd.
    return new Intl.DateTimeFormat("en-CA", { timeZone }).format(at);
  } catch {
    return utcDateKey(at);
  }
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
