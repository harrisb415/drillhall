import { describe, expect, it } from "vitest";
import type { MultiQuestion } from "@comptia/content";
import {
  applyChoiceOrder,
  applySolutionOrder,
  buildChoiceOrders,
  displayToOriginalIndex,
  grade,
  solutionFor,
  toPublicQuestion,
} from "../src/modules/quiz/grade";

const Q: MultiQuestion = {
  id: "m1",
  domainCode: "1.0",
  type: "multi",
  prompt: "Select TWO secure protocols.",
  choices: ["Telnet", "SSH", "HTTP", "HTTPS"],
  explanation: "SSH and HTTPS are the encrypted ones.",
  answerIndices: [1, 3],
};

describe("multi grading (all-or-nothing)", () => {
  it("marks the exact correct set correct, in any order", () => {
    expect(grade(Q, { type: "multi", choiceIndices: [1, 3] })).toBe(true);
    expect(grade(Q, { type: "multi", choiceIndices: [3, 1] })).toBe(true);
  });

  it("marks a partial selection wrong", () => {
    expect(grade(Q, { type: "multi", choiceIndices: [1] })).toBe(false);
  });

  it("marks an over-selection wrong even when it contains both correct choices", () => {
    expect(grade(Q, { type: "multi", choiceIndices: [1, 2, 3] })).toBe(false);
  });

  it("marks the wrong pair wrong", () => {
    expect(grade(Q, { type: "multi", choiceIndices: [0, 2] })).toBe(false);
  });

  it("throws on an answer-type mismatch", () => {
    expect(() => grade(Q, { type: "mc", choiceIndex: 1 })).toThrow();
  });
});

describe("multi public shape", () => {
  it("exposes selectCount and choices, never the answer", () => {
    const pub = toPublicQuestion(Q);
    if (pub.type !== "multi") throw new Error("expected multi");
    expect(pub.selectCount).toBe(2);
    expect(pub.choices).toEqual(Q.choices);
    expect(pub).not.toHaveProperty("answerIndices");
    expect(pub).not.toHaveProperty("explanation");
  });
});

describe("multi choice-order round trip", () => {
  it("grades correctly after the display shuffle is applied and reversed", () => {
    const orders = buildChoiceOrders([Q]);
    const order = orders[Q.id]!;
    const shuffled = applyChoiceOrder(toPublicQuestion(Q), orders);
    if (shuffled.type !== "multi") throw new Error("expected multi");

    // The candidate picks the two correct labels as they appear on screen.
    const displayIndices = shuffled.choices
      .map((c, i) => (Q.answerIndices.includes(Q.choices.indexOf(c)) ? i : -1))
      .filter((i) => i !== -1);

    // Server maps each display index back to the original before grading.
    const originals = displayIndices.map((d) => displayToOriginalIndex(order, d)!);
    expect(grade(Q, { type: "multi", choiceIndices: originals })).toBe(true);
    expect([...originals].sort()).toEqual([...Q.answerIndices].sort());
  });

  it("expresses the solution in display order so the client can highlight by index", () => {
    const orders = buildChoiceOrders([Q]);
    const order = orders[Q.id]!;
    const solution = applySolutionOrder(solutionFor(Q), orders, Q.id);
    if (solution.type !== "multi") throw new Error("expected multi solution");
    // Each remapped index must point at a genuinely-correct label in the shuffled view.
    for (const displayIdx of solution.answerIndices) {
      const originalIdx = order[displayIdx]!;
      expect(Q.answerIndices).toContain(originalIdx);
    }
    expect(solution.answerIndices.length).toBe(Q.answerIndices.length);
  });
});
