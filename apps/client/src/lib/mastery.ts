/**
 * One mastery scale for the whole app, so a colour means the same thing on a
 * gauge, a bar, and a badge. Bands are anchored on the real pass mark (75%):
 * "strong" is comfortably clear of it, "developing" is around it, "weak" is
 * not close yet.
 */
export type MasteryBand = "weak" | "developing" | "strong";

export function masteryBand(percent: number): MasteryBand {
  if (percent >= 80) return "strong";
  if (percent >= 60) return "developing";
  return "weak";
}

/** CSS colour for a band, as a `var()` so it tracks the active theme. */
export function bandColor(band: MasteryBand): string {
  return `var(--${band})`;
}

/** Tailwind text class, for labels that should echo the gauge colour. */
export function bandTextClass(band: MasteryBand): string {
  switch (band) {
    case "strong":
      return "text-strong";
    case "developing":
      return "text-developing";
    case "weak":
      return "text-weak";
  }
}

export const BAND_LABEL: Record<MasteryBand, string> = {
  weak: "needs work",
  developing: "developing",
  strong: "strong",
};
