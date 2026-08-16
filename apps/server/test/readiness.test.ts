import { describe, expect, it } from "vitest";
import {
  CONFIDENT_ATTEMPTS,
  computeReadiness,
  domainMastery,
  type AttemptLite,
} from "../src/modules/analytics/readiness";

function attempts(spec: { correct: boolean; daysAgo: number }[]): AttemptLite[] {
  const now = Date.now();
  return spec.map((s) => ({
    correct: s.correct,
    answeredAt: new Date(now - s.daysAgo * 24 * 60 * 60 * 1000),
  }));
}

describe("domainMastery (recency weighting, spec §7 concept 1)", () => {
  it("is null with no attempts", () => {
    expect(domainMastery([])).toBeNull();
  });

  it("is 1 when everything is correct and 0 when nothing is", () => {
    expect(domainMastery(attempts([{ correct: true, daysAgo: 0 }, { correct: true, daysAgo: 5 }]))).toBe(1);
    expect(domainMastery(attempts([{ correct: false, daysAgo: 0 }, { correct: false, daysAgo: 5 }]))).toBe(0);
  });

  it("weights yesterday's results more than three-weeks-ago results", () => {
    const oldRightRecentWrong = attempts([
      ...Array.from({ length: 5 }, (_, i) => ({ correct: false, daysAgo: i })),
      ...Array.from({ length: 5 }, (_, i) => ({ correct: true, daysAgo: 21 + i })),
    ]);
    const oldWrongRecentRight = attempts([
      ...Array.from({ length: 5 }, (_, i) => ({ correct: true, daysAgo: i })),
      ...Array.from({ length: 5 }, (_, i) => ({ correct: false, daysAgo: 21 + i })),
    ]);
    const declining = domainMastery(oldRightRecentWrong)!;
    const improving = domainMastery(oldWrongRecentRight)!;
    // both are 5/10 raw — recency weighting must split them around it, asymmetrically
    expect(declining).toBeLessThan(0.4);
    expect(improving).toBeGreaterThan(0.6);
    expect(declining + improving).toBeCloseTo(1, 5);
  });
});

describe("computeReadiness (exam weighting, spec §7 concept 2)", () => {
  const domains = [
    { code: "A", weight: 60 },
    { code: "B", weight: 40 },
  ];

  it("is null overall when no domain has attempts", () => {
    const result = computeReadiness(domains, new Map());
    expect(result.overall).toBeNull();
    expect(result.confident).toBe(false);
    expect(result.perDomain).toEqual([
      { code: "A", mastery: null, confident: false },
      { code: "B", mastery: null, confident: false },
    ]);
  });

  it("weights domain mastery by official exam weight; untouched domains count as zero", () => {
    const byDomain = new Map([["A", attempts([{ correct: true, daysAgo: 0 }])]]);
    const result = computeReadiness(domains, byDomain);
    expect(result.overall).toBe(60); // 100% of a 60-weight domain, nothing in B
    // one attempt is nowhere near enough to trust, so neither domain is confident
    expect(result.confident).toBe(false);
    expect(result.perDomain).toEqual([
      { code: "A", mastery: 100, confident: false },
      { code: "B", mastery: null, confident: false },
    ]);
  });

  it("a heavy domain moves the needle more than a light one", () => {
    const perfect = attempts([{ correct: true, daysAgo: 0 }]);
    const onlyHeavy = computeReadiness(domains, new Map([["A", perfect]]));
    const onlyLight = computeReadiness(domains, new Map([["B", perfect]]));
    expect(onlyHeavy.overall!).toBeGreaterThan(onlyLight.overall!);
    expect(onlyLight.overall).toBe(40);
  });
});

describe("confidence (spec follow-up: don't present noise as precision)", () => {
  const domains = [
    { code: "A", weight: 60 },
    { code: "B", weight: 40 },
  ];

  it("marks a domain confident only once it clears the threshold", () => {
    const justUnder = attempts(
      Array.from({ length: CONFIDENT_ATTEMPTS - 1 }, (_, i) => ({ correct: true, daysAgo: i })),
    );
    const atThreshold = attempts(
      Array.from({ length: CONFIDENT_ATTEMPTS }, (_, i) => ({ correct: true, daysAgo: i })),
    );
    const under = computeReadiness(domains, new Map([["A", justUnder]]));
    const at = computeReadiness(domains, new Map([["A", atThreshold]]));
    expect(under.perDomain.find((d) => d.code === "A")!.confident).toBe(false);
    expect(at.perDomain.find((d) => d.code === "A")!.confident).toBe(true);
  });

  it("overall confidence requires every weighted domain to individually clear it", () => {
    const plenty = attempts(
      Array.from({ length: CONFIDENT_ATTEMPTS }, (_, i) => ({ correct: true, daysAgo: i })),
    );
    const thin = attempts([{ correct: true, daysAgo: 0 }]);
    const result = computeReadiness(domains, new Map([["A", plenty], ["B", thin]]));
    expect(result.perDomain.find((d) => d.code === "A")!.confident).toBe(true);
    expect(result.perDomain.find((d) => d.code === "B")!.confident).toBe(false);
    // one thin domain is enough to make the overall figure untrustworthy
    expect(result.confident).toBe(false);
  });

  it("reports how many more answers would earn confidence", () => {
    const half = attempts(
      Array.from({ length: Math.floor(CONFIDENT_ATTEMPTS / 2) }, (_, i) => ({
        correct: true,
        daysAgo: i,
      })),
    );
    const result = computeReadiness(domains, new Map([["A", half]]));
    const shortA = CONFIDENT_ATTEMPTS - half.length;
    const shortB = CONFIDENT_ATTEMPTS; // untouched
    expect(result.attemptsForConfidence).toBe(shortA + shortB);
  });
});
