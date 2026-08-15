import request from "supertest";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { MatchQuestion, OrderQuestion } from "@comptia/content";
import type { ExamResultDto, ExamSessionDto } from "@comptia/shared-types";
import { quizAttempts } from "../src/db/schema";
import { createTestStack, signUp, type TestStack } from "./helpers";

/**
 * "What you see is what gets recorded."
 *
 * Ordering and matching answers travel as literal strings in display order,
 * never as indices, so there is no shuffle to invert on the way back. These
 * tests pin that: the row stored in the database must equal, element for
 * element, the arrangement that was on screen when Save was pressed.
 */

async function startPbqExam(stack: TestStack, cookie: string): Promise<ExamSessionDto> {
  const certId = stack.content.certIdByCode.get("aplus-core2")!;
  const res = await request(stack.app)
    .post("/api/exam/sessions")
    .set("Cookie", cookie)
    .send({ certId, examMode: "pbq" });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as ExamSessionDto;
}

function storedAnswer(stack: TestStack, sessionId: number, questionId: string) {
  const row = stack.db
    .select()
    .from(quizAttempts)
    .where(eq(quizAttempts.sessionId, sessionId))
    .all()
    .find((a) => a.questionId === questionId);
  return row ? { correct: row.correct, answer: JSON.parse(row.answer!) } : null;
}

describe("ordering answers record exactly what was on screen", () => {
  it("stores the dragged arrangement verbatim and grades it correct", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const certId = stack.content.certIdByCode.get("aplus-core2")!;
    const source = stack.content
      .questionsByCertId.get(certId)!
      .get("core2-order-001") as OrderQuestion;

    const session = await startPbqExam(stack, cookie);
    const served = session.questions.find((q) => q.id === "core2-order-001");
    if (served?.type !== "order") throw new Error("expected the ordering question");

    // Sanity: it arrived shuffled, so a drag is genuinely required.
    expect(served.items).not.toEqual(source.items);
    expect([...served.items].sort()).toEqual([...source.items].sort());

    // Simulate the user dragging the served list into the correct order.
    const onScreen = [...source.items];
    const res = await request(stack.app)
      .post("/api/exam/attempts")
      .set("Cookie", cookie)
      .send({
        sessionId: session.sessionId,
        questionId: "core2-order-001",
        answer: { type: "order", order: onScreen },
      });
    expect(res.status).toBe(200);

    const stored = storedAnswer(stack, session.sessionId, "core2-order-001")!;
    // byte-for-byte: no reordering, no index translation, nothing lost
    expect(stored.answer.order).toEqual(onScreen);
    expect(stored.correct).toBe(true);
  });

  it("stores a wrong arrangement verbatim too, and marks it wrong", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const certId = stack.content.certIdByCode.get("aplus-core2")!;
    const source = stack.content
      .questionsByCertId.get(certId)!
      .get("core2-order-001") as OrderQuestion;

    const session = await startPbqExam(stack, cookie);
    // swap the first two steps — visually one drag away from correct
    const onScreen = [...source.items];
    [onScreen[0], onScreen[1]] = [onScreen[1]!, onScreen[0]!];

    await request(stack.app)
      .post("/api/exam/attempts")
      .set("Cookie", cookie)
      .send({
        sessionId: session.sessionId,
        questionId: "core2-order-001",
        answer: { type: "order", order: onScreen },
      });

    const stored = storedAnswer(stack, session.sessionId, "core2-order-001")!;
    expect(stored.answer.order).toEqual(onScreen);
    expect(stored.correct).toBe(false);

    // and the review echoes back what was submitted, not some re-derived order
    const result = await request(stack.app)
      .post(`/api/exam/sessions/${session.sessionId}/submit`)
      .set("Cookie", cookie);
    const item = (result.body as ExamResultDto).review.find(
      (r) => r.questionId === "core2-order-001",
    )!;
    expect(item.given).toEqual({ type: "order", order: onScreen });
    expect(item.solution).toEqual({ type: "order", order: source.items });
  });

  it("re-saving after another drag overwrites with the newest arrangement", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const certId = stack.content.certIdByCode.get("aplus-core2")!;
    const source = stack.content
      .questionsByCertId.get(certId)!
      .get("core2-order-001") as OrderQuestion;
    const session = await startPbqExam(stack, cookie);

    const wrong = [...source.items].reverse();
    await request(stack.app)
      .post("/api/exam/attempts")
      .set("Cookie", cookie)
      .send({
        sessionId: session.sessionId,
        questionId: "core2-order-001",
        answer: { type: "order", order: wrong },
      });
    expect(storedAnswer(stack, session.sessionId, "core2-order-001")!.answer.order).toEqual(wrong);

    await request(stack.app)
      .post("/api/exam/attempts")
      .set("Cookie", cookie)
      .send({
        sessionId: session.sessionId,
        questionId: "core2-order-001",
        answer: { type: "order", order: source.items },
      });
    const stored = storedAnswer(stack, session.sessionId, "core2-order-001")!;
    expect(stored.answer.order).toEqual(source.items);
    expect(stored.correct).toBe(true);
  });
});

describe("matching answers record exactly what was on screen", () => {
  it("pairs each left with the right that sat beside it", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const certId = stack.content.certIdByCode.get("aplus-core2")!;
    const source = stack.content
      .questionsByCertId.get(certId)!
      .get("core2-match-001") as MatchQuestion;

    const session = await startPbqExam(stack, cookie);
    const served = session.questions.find((q) => q.id === "core2-match-001");
    if (served?.type !== "match") throw new Error("expected the matching question");
    expect(served.lefts).toEqual(source.pairs.map((p) => p.left));

    // Arrange the right column so row i holds the correct partner for left i.
    const rightsOnScreen = served.lefts.map(
      (left) => source.pairs.find((p) => p.left === left)!.right,
    );
    const submitted = Object.fromEntries(served.lefts.map((l, i) => [l, rightsOnScreen[i]!]));

    await request(stack.app)
      .post("/api/exam/attempts")
      .set("Cookie", cookie)
      .send({
        sessionId: session.sessionId,
        questionId: "core2-match-001",
        answer: { type: "match", pairs: submitted },
      });

    const stored = storedAnswer(stack, session.sessionId, "core2-match-001")!;
    expect(stored.answer.pairs).toEqual(submitted);
    expect(stored.correct).toBe(true);
  });

  it("a single swapped row records as swapped and grades wrong", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const certId = stack.content.certIdByCode.get("aplus-core2")!;
    const source = stack.content
      .questionsByCertId.get(certId)!
      .get("core2-match-001") as MatchQuestion;
    const session = await startPbqExam(stack, cookie);

    const correctPairs = Object.fromEntries(source.pairs.map((p) => [p.left, p.right]));
    const swapped = { ...correctPairs };
    const [l1, l2] = source.pairs.map((p) => p.left);
    [swapped[l1!], swapped[l2!]] = [swapped[l2!]!, swapped[l1!]!];

    await request(stack.app)
      .post("/api/exam/attempts")
      .set("Cookie", cookie)
      .send({
        sessionId: session.sessionId,
        questionId: "core2-match-001",
        answer: { type: "match", pairs: swapped },
      });

    const stored = storedAnswer(stack, session.sessionId, "core2-match-001")!;
    expect(stored.answer.pairs).toEqual(swapped);
    expect(stored.correct).toBe(false);
  });
});

describe("resuming an exam keeps the arrangement stable", () => {
  it("serves the same ordering and matching layout it served at the start", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const session = await startPbqExam(stack, cookie);

    const resumed = await request(stack.app)
      .get(`/api/exam/sessions/${session.sessionId}`)
      .set("Cookie", cookie);
    expect(resumed.status).toBe(200);
    const after = resumed.body as ExamSessionDto;

    for (const original of session.questions) {
      const again = after.questions.find((q) => q.id === original.id)!;
      if (original.type === "order" && again.type === "order") {
        // A reload must not rescramble a question you were partway through.
        expect(again.items, `ordering question ${original.id} was rescrambled`).toEqual(
          original.items,
        );
      }
      if (original.type === "match" && again.type === "match") {
        expect(again.rights, `matching question ${original.id} was rescrambled`).toEqual(
          original.rights,
        );
      }
      if (original.type === "mc" && again.type === "mc") {
        expect(again.choices).toEqual(original.choices);
      }
    }
  });
});
