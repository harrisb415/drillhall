import type { ExamConfig } from "@comptia/content";

/**
 * CompTIA reports a scaled score on a 100–900 range and does not publish the
 * raw→scaled curve. This is a transparent two-segment linear map anchored so
 * the pass mark lands exactly on the official threshold (675 Core 1, 700 Core
 * 2): 0% → scaledMin, passingRawPercent → passingScaledScore, 100% → scaledMax.
 *
 * It is an approximation and the UI says so. The pass/fail verdict it produces
 * is exact with respect to the configured raw threshold; only the number
 * shown alongside it is modelled.
 */
export function toScaledScore(rawPercent: number, exam: ExamConfig): number {
  const { passingRawPercent, passingScaledScore, scaledMin, scaledMax } = exam;
  const clamped = Math.max(0, Math.min(100, rawPercent));

  if (clamped <= passingRawPercent) {
    const t = passingRawPercent === 0 ? 1 : clamped / passingRawPercent;
    return Math.round(scaledMin + t * (passingScaledScore - scaledMin));
  }
  const t = (clamped - passingRawPercent) / (100 - passingRawPercent);
  return Math.round(passingScaledScore + t * (scaledMax - passingScaledScore));
}

export function didPass(rawPercent: number, exam: ExamConfig): boolean {
  return rawPercent >= exam.passingRawPercent;
}
