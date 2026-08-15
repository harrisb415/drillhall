import { describe, expect, it } from "vitest";
import {
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
    expect(result.perDomain).toEqual([
      { code: "A", mastery: null },
      { code: "B", mastery: null },
    ]);
  });

  it("weights domain mastery by official exam weight; untouched domains count as zero", () => {
    const byDomain = new Map([["A", attempts([{ correct: true, daysAgo: 0 }])]]);
    const result = computeReadiness(domains, byDomain);
    expect(result.overall).toBe(60); // 100% of a 60-weight domain, nothing in B
    expect(result.perDomain).toEqual([
      { code: "A", mastery: 100 },
      { code: "B", mastery: null },
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
