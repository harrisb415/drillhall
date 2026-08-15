/**
 * Readiness scoring (spec §7) — two distinct "weighted" concepts:
 *
 * 1. Recency weighting (per domain): newer attempts count more than old ones.
 *    Content is tagged at domain granularity, so instead of "last 3 attempts
 *    per sub-objective" this uses an exponentially decaying weight over the
 *    most recent attempts in the domain — same intent, sane at this granularity.
 * 2. Exam weighting (rollup): each domain's mastery contributes to overall
 *    readiness in proportion to its official exam weight.
 *
 * readiness = Σ(domain_mastery × domain_weight), mastery ∈ [0,1], weights sum 100.
 * Domains with no attempts contribute 0 — untouched material genuinely lowers
 * exam readiness; per-domain mastery stays null so the UI can say "no data".
 */

export interface AttemptLite {
  correct: boolean;
  answeredAt: Date;
}

const DECAY = 0.85;
const MAX_ATTEMPTS = 30;

/** Recency-weighted mastery for one domain as a fraction 0..1, or null with no attempts. */
export function domainMastery(attempts: AttemptLite[]): number | null {
  if (attempts.length === 0) return null;
  const recent = [...attempts]
    .sort((a, b) => b.answeredAt.getTime() - a.answeredAt.getTime())
    .slice(0, MAX_ATTEMPTS);
  let num = 0;
  let den = 0;
  recent.forEach((a, i) => {
    const w = Math.pow(DECAY, i);
    num += w * (a.correct ? 1 : 0);
    den += w;
  });
  return num / den;
}

export interface ReadinessResult {
  /** percent 0-100, null when there are no attempts at all */
  overall: number | null;
  perDomain: { code: string; mastery: number | null }[];
}

export function computeReadiness(
  domains: { code: string; weight: number }[],
  attemptsByDomain: Map<string, AttemptLite[]>,
): ReadinessResult {
  const perDomain = domains.map((d) => {
    const mastery = domainMastery(attemptsByDomain.get(d.code) ?? []);
    return { code: d.code, mastery: mastery === null ? null : Math.round(mastery * 100) };
  });
  if (perDomain.every((p) => p.mastery === null)) {
    return { overall: null, perDomain };
  }
  const overall = domains.reduce((sum, d) => {
    const mastery = domainMastery(attemptsByDomain.get(d.code) ?? []) ?? 0;
    return sum + mastery * d.weight;
  }, 0);
  return { overall: Math.round(overall), perDomain };
}
