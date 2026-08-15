import request from "supertest";
import { describe, expect, it } from "vitest";
import type { MatchQuestion, OrderQuestion, TerminalQuestion } from "@comptia/content";
import type { StartSessionResponse } from "@comptia/shared-types";
import { createTestStack, signUp, type TestStack } from "./helpers";

function core2Id(stack: TestStack): number {
  return stack.content.certIdByCode.get("aplus-core2")!;
}

function packQuestion<T>(stack: TestStack, certId: number, questionId: string): T {
  return stack.content.questionsByCertId.get(certId)!.get(questionId)! as T;
}

async function startSession(
  stack: TestStack,
  cookie: string,
  body: Record<string, unknown>,
): Promise<StartSessionResponse> {
  const res = await request(stack.app).post("/api/quiz/sessions").set("Cookie", cookie).send(body);
  expect(res.status).toBe(200);
  return res.body as StartSessionResponse;
}

describe("order PBQ", () => {
  it("ships shuffled items without the solution, grades exact order", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const certId = core2Id(stack);
    const source = packQuestion<OrderQuestion>(stack, certId, "core2-order-001");

    const s1 = await startSession(stack, cookie, { certId, types: ["order"], count: 10 });
    const q = s1.questions.find((x) => x.id === "core2-order-001");
    expect(q).toBeDefined();
    if (q?.type !== "order") throw new Error("expected order question");
    // same members, never delivered in the solved order, no giveaway fields
    expect([...q.items].sort()).toEqual([...source.items].sort());
    expect(q.items).not.toEqual(source.items);
    expect(q).not.toHaveProperty("explanation");

    // wrong order → incorrect, solution reveals the true order
    const rotated = [...source.items.slice(1), source.items[0]!];
    const wrong = await request(stack.app)
      .post("/api/quiz/attempts")
      .set("Cookie", cookie)
      .send({
        sessionId: s1.sessionId,
        questionId: "core2-order-001",
        answer: { type: "order", order: rotated },
      });
    expect(wrong.status).toBe(200);
    expect(wrong.body.correct).toBe(false);
    expect(wrong.body.solution).toEqual({ type: "order", order: source.items });

    // correct order in a fresh session → correct
    const s2 = await startSession(stack, cookie, { certId, types: ["order"], count: 10 });
    const right = await request(stack.app)
      .post("/api/quiz/attempts")
      .set("Cookie", cookie)
      .send({
        sessionId: s2.sessionId,
        questionId: "core2-order-001",
        answer: { type: "order", order: source.items },
      });
    expect(right.body.correct).toBe(true);
  });
});

describe("match PBQ", () => {
  it("ships lefts and shuffled rights without pairs, grades the full mapping", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const certId = core2Id(stack);
    const source = packQuestion<MatchQuestion>(stack, certId, "core2-match-001");

    const s1 = await startSession(stack, cookie, {
      certId,
      types: ["match"],
      domainCodes: ["1.0"],
      count: 10,
    });
    const q = s1.questions.find((x) => x.id === "core2-match-001");
    if (q?.type !== "match") throw new Error("expected match question");
    expect(q.lefts).toEqual(source.pairs.map((p) => p.left));
    expect([...q.rights].sort()).toEqual([...source.pairs.map((p) => p.right)].sort());
    expect(q).not.toHaveProperty("pairs");

    const correctPairs = Object.fromEntries(source.pairs.map((p) => [p.left, p.right]));
    const right = await request(stack.app)
      .post("/api/quiz/attempts")
      .set("Cookie", cookie)
      .send({
        sessionId: s1.sessionId,
        questionId: "core2-match-001",
        answer: { type: "match", pairs: correctPairs },
      });
    expect(right.body.correct).toBe(true);

    // one swapped pair → incorrect
    const swapped = { ...correctPairs };
    const [l1, l2] = source.pairs.map((p) => p.left);
    [swapped[l1!], swapped[l2!]] = [swapped[l2!]!, swapped[l1!]!];
    const s2 = await startSession(stack, cookie, {
      certId,
      types: ["match"],
      domainCodes: ["1.0"],
      count: 10,
    });
    const wrong = await request(stack.app)
      .post("/api/quiz/attempts")
      .set("Cookie", cookie)
      .send({
        sessionId: s2.sessionId,
        questionId: "core2-match-001",
        answer: { type: "match", pairs: swapped },
      });
    expect(wrong.body.correct).toBe(false);
    expect(wrong.body.solution.pairs).toEqual(source.pairs);
  });
});

describe("terminal PBQ", () => {
  it("normalizes whitespace and case, accepts any expected variant", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const certId = core2Id(stack);
    const source = packQuestion<TerminalQuestion>(stack, certId, "core2-term-001");

    const s1 = await startSession(stack, cookie, {
      certId,
      types: ["terminal"],
      domainCodes: ["3.0"],
      count: 10,
    });
    const q = s1.questions.find((x) => x.id === "core2-term-001");
    if (q?.type !== "terminal") throw new Error("expected terminal question");
    expect(q).not.toHaveProperty("expected");

    const right = await request(stack.app)
      .post("/api/quiz/attempts")
      .set("Cookie", cookie)
      .send({
        sessionId: s1.sessionId,
        questionId: "core2-term-001",
        answer: { type: "terminal", command: "  IPCONFIG   /FLUSHDNS  " },
      });
    expect(right.body.correct).toBe(true);

    const s2 = await startSession(stack, cookie, {
      certId,
      types: ["terminal"],
      domainCodes: ["3.0"],
      count: 10,
    });
    const wrong = await request(stack.app)
      .post("/api/quiz/attempts")
      .set("Cookie", cookie)
      .send({
        sessionId: s2.sessionId,
        questionId: "core2-term-001",
        answer: { type: "terminal", command: "ipconfig /renew" },
      });
    expect(wrong.body.correct).toBe(false);
    expect(wrong.body.solution.expected).toEqual(source.expected);
  });
});

describe("answer/question type mismatch", () => {
  it("rejects an mc answer aimed at an order question", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const certId = core2Id(stack);
    const session = await startSession(stack, cookie, { certId, types: ["order"], count: 10 });
    const res = await request(stack.app)
      .post("/api/quiz/attempts")
      .set("Cookie", cookie)
      .send({
        sessionId: session.sessionId,
        questionId: session.questions[0]!.id,
        answer: { type: "mc", choiceIndex: 0 },
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not match/);
  });
});
