import type { CertDomain, QuizQuestion } from "@comptia/content";
import { shuffle } from "../quiz/grade";
import type { SelectionStrategy } from "./modes";

const PBQ_ORDER: Record<string, number> = { order: 0, match: 0, terminal: 0, mc: 1 };

/**
 * Distributes `total` across `weights` proportionally, using largest-remainder
 * so the parts sum to exactly `total` instead of drifting on rounding.
 */
export function apportion(weights: number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (w / sum) * total);
  const floors = exact.map(Math.floor);
  let remaining = total - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (const { i } of order) {
    if (remaining <= 0) break;
    out[i]! += 1;
    remaining--;
  }
  return out;
}

export interface SelectOptions {
  pool: QuizQuestion[];
  domains: CertDomain[];
  count: number;
  selection: SelectionStrategy;
  /** limit to these domain codes (domain drill) */
  domainCodes?: string[];
  /** question ids the user saw in recent exams — deprioritized, not banned */
  recentlySeen?: Set<string>;
  /** domain code -> mastery 0..100 (null = untouched); drives "weak" selection */
  masteryByDomain?: Map<string, number | null>;
}

/**
 * Picks a randomized, blueprint-weighted question set.
 *
 * Two things make repeat attempts feel like different exams rather than the
 * same test reshuffled: the per-domain sample is random each time, and
 * questions seen in the user's recent exams are drawn last within their
 * domain. When the pool is barely larger than the exam, novelty is limited by
 * arithmetic rather than by this function.
 */
export function selectExamQuestions(opts: SelectOptions): QuizQuestion[] {
  const { pool, count, selection, recentlySeen = new Set() } = opts;

  let domains = opts.domains;
  if (opts.domainCodes && opts.domainCodes.length > 0) {
    const wanted = new Set(opts.domainCodes);
    domains = domains.filter((d) => wanted.has(d.code));
  }
  if (domains.length === 0) return [];

  const byDomain = new Map<string, QuizQuestion[]>();
  for (const d of domains) byDomain.set(d.code, []);
  for (const q of pool) byDomain.get(q.domainCode)?.push(q);

  const weights = domains.map((d) => {
    switch (selection) {
      case "blueprint":
        return d.weight;
      case "even":
        return 1;
      case "weak": {
        const mastery = opts.masteryByDomain?.get(d.code) ?? null;
        // Untouched domains are the weakest thing you can have, so they get the
        // heaviest pull; otherwise weight grows as mastery falls.
        return mastery === null ? 100 : Math.max(100 - mastery, 5);
      }
    }
  });

  const wanted = apportion(weights, Math.min(count, pool.length));

  // Draw per domain, unseen questions first.
  const picked: QuizQuestion[] = [];
  const leftovers: QuizQuestion[] = [];
  domains.forEach((d, i) => {
    const available = byDomain.get(d.code) ?? [];
    const fresh = shuffle(available.filter((q) => !recentlySeen.has(q.id)));
    const stale = shuffle(available.filter((q) => recentlySeen.has(q.id)));
    const ordered = [...fresh, ...stale];
    const take = Math.min(wanted[i] ?? 0, ordered.length);
    picked.push(...ordered.slice(0, take));
    leftovers.push(...ordered.slice(take));
  });

  // Domains that couldn't fill their allocation (small banks) borrow from the rest.
  const shortfall = Math.min(count, pool.length) - picked.length;
  if (shortfall > 0) picked.push(...leftovers.slice(0, shortfall));

  // Real exams front-load performance-based questions.
  return picked.sort((a, b) => (PBQ_ORDER[a.type] ?? 1) - (PBQ_ORDER[b.type] ?? 1));
}

/**
 * Per-question display order for multiple-choice options, so a repeat sighting
 * can't be answered from muscle memory of the position. The permutation maps
 * display index -> original index and is stored with the session so grading
 * and review both resolve correctly.
 */
export function buildChoiceOrders(questions: QuizQuestion[]): Record<string, number[]> {
  const orders: Record<string, number[]> = {};
  for (const q of questions) {
    if (q.type !== "mc") continue;
    orders[q.id] = shuffle(q.choices.map((_, i) => i));
  }
  return orders;
}
