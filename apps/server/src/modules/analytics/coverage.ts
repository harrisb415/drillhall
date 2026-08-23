/**
 * Bank coverage — how much of a pack's question bank the user has actually met.
 *
 * This exists because readiness alone is misleading once a bank is exhausted.
 * A pack of 250 questions is fully seen after roughly three 90-question mocks,
 * and from that point "accuracy" increasingly measures recall of specific
 * questions rather than knowledge of the material — while the readiness score
 * keeps climbing.
 *
 * Rather than inventing a discount factor to damp the score (which would be a
 * made-up number dressed as a measurement), this module reports two real ones:
 *
 * 1. Coverage — the plain fact of how much of the bank has been seen.
 * 2. First-encounter readiness — the same readiness calculation run over only
 *    each question's *earliest* attempt. That is the closest thing available to
 *    "how would you have done meeting this cold", and the gap between it and
 *    headline readiness is the memorisation signal.
 */

import { computeReadiness, type AttemptLite, type ReadinessResult } from "./readiness";

/** Coverage at or above this proportion means headline accuracy is mostly recall. */
export const HIGH_COVERAGE_PERCENT = 70;

export interface AttemptRecord extends AttemptLite {
  questionId: string;
  domainCode: string;
}

export interface BankCoverage {
  /** questions in the pack */
  total: number;
  /** distinct questions this user has attempted at least once */
  seen: number;
  unseen: number;
  /** percent 0-100 */
  coverage: number;
  /** true once accuracy is drawing mostly on questions already met */
  highCoverage: boolean;
}

export function bankCoverage(total: number, attempts: { questionId: string }[]): BankCoverage {
  const seenIds = new Set<string>();
  for (const a of attempts) seenIds.add(a.questionId);
  // An attempt can outlive the question it referenced (content is edited between
  // releases), so clamp rather than reporting more seen than the bank holds.
  const seen = Math.min(seenIds.size, total);
  const coverage = total === 0 ? 0 : Math.round((seen / total) * 100);
  return {
    total,
    seen,
    unseen: Math.max(0, total - seen),
    coverage,
    highCoverage: coverage >= HIGH_COVERAGE_PERCENT,
  };
}

/**
 * Keeps only the earliest attempt per question.
 *
 * Ties on `answeredAt` are possible (same-millisecond writes), so the first
 * occurrence in input order wins — deterministic rather than arbitrary.
 */
export function firstEncounters<T extends { questionId: string; answeredAt: Date }>(
  attempts: T[],
): T[] {
  const earliest = new Map<string, T>();
  for (const a of attempts) {
    const held = earliest.get(a.questionId);
    if (!held || a.answeredAt.getTime() < held.answeredAt.getTime()) {
      earliest.set(a.questionId, a);
    }
  }
  return [...earliest.values()];
}

export interface FirstEncounterReadiness {
  /** readiness over first encounters only, percent 0-100; null with no attempts */
  readiness: number | null;
  /** how many distinct questions that figure rests on */
  attempts: number;
}

export function firstEncounterReadiness(
  domains: { code: string; weight: number }[],
  attempts: AttemptRecord[],
): FirstEncounterReadiness {
  const firsts = firstEncounters(attempts);
  const byDomain = new Map<string, AttemptLite[]>();
  for (const a of firsts) {
    const list = byDomain.get(a.domainCode);
    if (list) list.push(a);
    else byDomain.set(a.domainCode, [a]);
  }
  const result: ReadinessResult = computeReadiness(domains, byDomain);
  return { readiness: result.overall, attempts: firsts.length };
}
