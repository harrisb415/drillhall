import request from "supertest";
import { describe, expect, it } from "vitest";
import type { DashboardStats } from "@comptia/shared-types";
import {
  HIGH_COVERAGE_PERCENT,
  bankCoverage,
  firstEncounterReadiness,
  firstEncounters,
} from "../src/modules/analytics/coverage";
import { createTestStack, signUp } from "./helpers";

const at = (iso: string) => new Date(iso);

describe("bankCoverage", () => {
  it("counts distinct questions, not attempts", () => {
    const c = bankCoverage(100, [
      { questionId: "a" },
      { questionId: "a" },
      { questionId: "a" },
      { questionId: "b" },
    ]);
    expect(c.seen).toBe(2);
    expect(c.unseen).toBe(98);
    expect(c.coverage).toBe(2);
  });

  it("reports zero coverage for an untouched bank", () => {
    const c = bankCoverage(250, []);
    expect(c).toMatchObject({ seen: 0, unseen: 250, coverage: 0, highCoverage: false });
  });

  it("flags high coverage at the threshold, not before", () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ questionId: `q${i}` }));
    expect(bankCoverage(100, ids(HIGH_COVERAGE_PERCENT - 1)).highCoverage).toBe(false);
    expect(bankCoverage(100, ids(HIGH_COVERAGE_PERCENT)).highCoverage).toBe(true);
  });

  it("clamps when attempts reference questions the pack no longer has", () => {
    // Content is edited between releases, so an old attempt can outlive its
    // question. Coverage must never exceed the bank it is measured against.
    const c = bankCoverage(2, [
      { questionId: "a" },
      { questionId: "b" },
      { questionId: "retired-1" },
      { questionId: "retired-2" },
    ]);
    expect(c.seen).toBe(2);
    expect(c.unseen).toBe(0);
    expect(c.coverage).toBe(100);
  });

  it("does not divide by zero on an empty pack", () => {
    expect(bankCoverage(0, []).coverage).toBe(0);
  });
});

describe("firstEncounters", () => {
  it("keeps the earliest attempt per question regardless of input order", () => {
    const rows = [
      { questionId: "a", answeredAt: at("2026-03-01T00:00:00Z"), correct: true },
      { questionId: "a", answeredAt: at("2026-01-01T00:00:00Z"), correct: false },
      { questionId: "b", answeredAt: at("2026-02-01T00:00:00Z"), correct: true },
    ];
    const firsts = firstEncounters(rows);
    expect(firsts).toHaveLength(2);
    // the January attempt on "a" is the first encounter, and it was wrong
    expect(firsts.find((r) => r.questionId === "a")!.correct).toBe(false);
  });
});

describe("firstEncounterReadiness", () => {
  const domains = [
    { code: "1.0", weight: 50 },
    { code: "2.0", weight: 50 },
  ];

  it("is null when nothing has been attempted", () => {
    expect(firstEncounterReadiness(domains, []).readiness).toBeNull();
  });

  it("scores the first encounter, ignoring later corrections of the same question", () => {
    // Answered wrong on first sight, then right four more times — the pattern
    // produced by drilling a small bank until the answers are memorised.
    const attempts = [
      { questionId: "q1", domainCode: "1.0", correct: false, answeredAt: at("2026-01-01T00:00:00Z") },
      { questionId: "q1", domainCode: "1.0", correct: true, answeredAt: at("2026-01-02T00:00:00Z") },
      { questionId: "q1", domainCode: "1.0", correct: true, answeredAt: at("2026-01-03T00:00:00Z") },
      { questionId: "q2", domainCode: "2.0", correct: false, answeredAt: at("2026-01-01T00:00:00Z") },
      { questionId: "q2", domainCode: "2.0", correct: true, answeredAt: at("2026-01-02T00:00:00Z") },
    ];
    const r = firstEncounterReadiness(domains, attempts);
    // both first encounters were wrong, so first-seen readiness is 0
    expect(r.readiness).toBe(0);
    expect(r.attempts).toBe(2);
  });

  it("rests on distinct questions, not raw attempt count", () => {
    const attempts = Array.from({ length: 10 }, (_, i) => ({
      questionId: "q1",
      domainCode: "1.0",
      correct: true,
      answeredAt: at(`2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`),
    }));
    expect(firstEncounterReadiness(domains, attempts).attempts).toBe(1);
  });
});

describe("dashboard exposes bank coverage", () => {
  it("starts at zero coverage and rises as questions are met", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);

    const before = await request(stack.app)
      .get(`/api/dashboard?certId=${stack.certId}`)
      .set("Cookie", cookie);
    const b0 = (before.body as DashboardStats).bank;
    expect(b0.seen).toBe(0);
    expect(b0.coverage).toBe(0);
    expect(b0.total).toBeGreaterThan(0);
    expect(b0.firstSeenReadiness).toBeNull();

    const start = await request(stack.app)
      .post("/api/quiz/sessions")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, count: 3, types: ["mc"] });
    for (const q of start.body.questions) {
      await request(stack.app)
        .post("/api/quiz/attempts")
        .set("Cookie", cookie)
        .send({ sessionId: start.body.sessionId, questionId: q.id, answer: { type: "mc", choiceIndex: 0 } });
    }

    const after = await request(stack.app)
      .get(`/api/dashboard?certId=${stack.certId}`)
      .set("Cookie", cookie);
    const b1 = (after.body as DashboardStats).bank;
    expect(b1.seen).toBe(3);
    expect(b1.unseen).toBe(b1.total - 3);
    expect(b1.firstSeenAttempts).toBe(3);
  });

  it("does not double-count a question answered repeatedly", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const start = await request(stack.app)
      .post("/api/quiz/sessions")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, count: 1, types: ["mc"] });
    const q = start.body.questions[0];

    for (const choiceIndex of [0, 1, 2]) {
      await request(stack.app)
        .post("/api/quiz/attempts")
        .set("Cookie", cookie)
        .send({ sessionId: start.body.sessionId, questionId: q.id, answer: { type: "mc", choiceIndex } });
    }

    const dash = await request(stack.app)
      .get(`/api/dashboard?certId=${stack.certId}`)
      .set("Cookie", cookie);
    expect((dash.body as DashboardStats).bank.seen).toBe(1);
  });
});

describe("unseen-only mode", () => {
  it("never serves a question the user has already attempted", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);

    const first = await request(stack.app)
      .post("/api/quiz/sessions")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, count: 5, types: ["mc"] });
    const seen = new Set<string>();
    for (const q of first.body.questions) {
      seen.add(q.id);
      await request(stack.app)
        .post("/api/quiz/attempts")
        .set("Cookie", cookie)
        .send({ sessionId: first.body.sessionId, questionId: q.id, answer: { type: "mc", choiceIndex: 0 } });
    }

    const fresh = await request(stack.app)
      .post("/api/quiz/sessions")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, count: 20, types: ["mc"], unseenOnly: true });
    expect(fresh.status).toBe(200);
    for (const q of fresh.body.questions) {
      expect(seen.has(q.id)).toBe(false);
    }
  });

  it("refuses rather than quietly serving repeats once the filtered pool is exhausted", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);

    // Terminal questions are a small slice, so this exhausts quickly.
    const start = await request(stack.app)
      .post("/api/quiz/sessions")
      .set("Cookie", cookie)
      .send({ certId: stack.content.certIdByCode.get("aplus-core2"), count: 50, types: ["terminal"] });
    for (const q of start.body.questions) {
      await request(stack.app)
        .post("/api/quiz/attempts")
        .set("Cookie", cookie)
        .send({
          sessionId: start.body.sessionId,
          questionId: q.id,
          answer: { type: "terminal", command: "x" },
        });
    }

    const again = await request(stack.app)
      .post("/api/quiz/sessions")
      .set("Cookie", cookie)
      .send({
        certId: stack.content.certIdByCode.get("aplus-core2"),
        count: 5,
        types: ["terminal"],
        unseenOnly: true,
      });
    expect(again.status).toBe(400);
    expect(again.body.error).toMatch(/already seen/i);
  });

  it("applies to exams too, so a mock can be drawn entirely from fresh questions", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);

    const drill = await request(stack.app)
      .post("/api/quiz/sessions")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, count: 10, types: ["mc"] });
    const seen = new Set<string>();
    for (const q of drill.body.questions) {
      seen.add(q.id);
      await request(stack.app)
        .post("/api/quiz/attempts")
        .set("Cookie", cookie)
        .send({ sessionId: drill.body.sessionId, questionId: q.id, answer: { type: "mc", choiceIndex: 0 } });
    }

    const exam = await request(stack.app)
      .post("/api/exam/sessions")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, examMode: "half", unseenOnly: true });
    expect(exam.status).toBe(200);
    for (const q of exam.body.questions) {
      expect(seen.has(q.id)).toBe(false);
    }
  });
});
