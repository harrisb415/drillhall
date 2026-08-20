import request from "supertest";
import { describe, expect, it } from "vitest";
import type { McQuestion } from "@comptia/content";
import type {
  ExamOptionsDto,
  ExamResultDto,
  ExamSessionDto,
} from "@comptia/shared-types";
import { quizSessions } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { apportion, selectExamQuestions } from "../src/modules/exam/select";
import { didPass, toScaledScore } from "../src/modules/exam/score";
import { createTestStack, signUp, type TestStack } from "./helpers";

async function startExam(
  stack: TestStack,
  cookie: string,
  body: Record<string, unknown>,
): Promise<ExamSessionDto> {
  const res = await request(stack.app).post("/api/exam/sessions").set("Cookie", cookie).send(body);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as ExamSessionDto;
}

describe("apportion (blueprint weighting)", () => {
  it("splits exactly, never drifting on rounding", () => {
    // A+ Core 1 blueprint at a 36-question exam
    expect(apportion([15, 20, 25, 11, 29], 36)).toEqual([5, 7, 9, 4, 11]);
    expect(apportion([15, 20, 25, 11, 29], 90)).toEqual([14, 18, 22, 10, 26]);
    // Core 2 blueprint
    expect(apportion([31, 25, 22, 22], 30)).toEqual([9, 7, 7, 7]);
    for (const total of [1, 7, 13, 45, 90]) {
      expect(apportion([15, 20, 25, 11, 29], total).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it("gives the heaviest domain the most questions", () => {
    const parts = apportion([15, 20, 25, 11, 29], 90);
    expect(Math.max(...parts)).toBe(parts[4]); // 29% domain
    expect(Math.min(...parts)).toBe(parts[3]); // 11% domain
  });
});

describe("scaled scoring", () => {
  const exam = {
    questionCount: 90,
    minutes: 90,
    passingScaledScore: 675,
    passingRawPercent: 75,
    scaledMin: 100,
    scaledMax: 900,
  };

  it("anchors the curve on the official pass mark", () => {
    expect(toScaledScore(0, exam)).toBe(100);
    expect(toScaledScore(75, exam)).toBe(675);
    expect(toScaledScore(100, exam)).toBe(900);
  });

  it("is monotonic and brackets the threshold correctly", () => {
    expect(toScaledScore(74, exam)).toBeLessThan(675);
    expect(toScaledScore(76, exam)).toBeGreaterThan(675);
    expect(didPass(74.9, exam)).toBe(false);
    expect(didPass(75, exam)).toBe(true);
  });

  it("uses Core 2's higher pass mark when the pack says so", () => {
    const core2 = { ...exam, passingScaledScore: 700 };
    expect(toScaledScore(75, core2)).toBe(700);
  });
});

describe("exam options", () => {
  it("offers every exam type and reports what the pool can fill", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const res = await request(stack.app)
      .get(`/api/exam/options?certId=${stack.certId}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);

    const options = res.body as ExamOptionsDto;
    expect(options.modes.map((m) => m.id)).toEqual(["full", "half", "domain", "pbq", "weak"]);
    expect(options.officialQuestionCount).toBe(90);
    expect(options.passingScaledScore).toBe(675);

    // the bank now covers a full-length sitting, so no shortening is applied
    const full = options.modes.find((m) => m.id === "full")!;
    expect(full.questionCount).toBe(90);
    expect(full.availableQuestions).toBe(90);
  });

  it("reports Core 2's own pass mark", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const core2 = stack.content.certIdByCode.get("aplus-core2")!;
    const res = await request(stack.app)
      .get(`/api/exam/options?certId=${core2}`)
      .set("Cookie", cookie);
    expect(res.body.passingScaledScore).toBe(700);
  });
});

describe("exam session lifecycle", () => {
  it("withholds all grading until submit", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const session = await startExam(stack, cookie, {
      certId: stack.certId,
      examMode: "half",
    });

    // nothing in the delivered questions gives an answer away
    const serialized = JSON.stringify(session.questions);
    expect(serialized).not.toMatch(/answerIndex|explanation|"expected"|"pairs"/);

    const mc = session.questions.find((q) => q.type === "mc")!;
    const attempt = await request(stack.app)
      .post("/api/exam/attempts")
      .set("Cookie", cookie)
      .send({
        sessionId: session.sessionId,
        questionId: mc.id,
        answer: { type: "mc", choiceIndex: 0 },
      });
    expect(attempt.status).toBe(200);
    // the exam stays dark: no correct flag, no solution, no explanation
    expect(attempt.body).toEqual({ recorded: true });
  });

  it("puts performance-based questions first, like the real exam", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const core2 = stack.content.certIdByCode.get("aplus-core2")!;
    const session = await startExam(stack, cookie, { certId: core2, examMode: "full" });

    // "Performance-based" means the three interactive types specifically.
    // Multiple-response ("Select TWO") is not performance-based — it sits
    // with standard multiple choice, exactly as on the real exam.
    const PBQ = new Set(["order", "match", "terminal"]);
    const types = session.questions.map((q) => q.type);
    const lastPbq = types.map((t) => PBQ.has(t)).lastIndexOf(true);
    const firstNonPbq = types.findIndex((t) => !PBQ.has(t));
    if (lastPbq >= 0 && firstNonPbq >= 0) expect(lastPbq).toBeLessThan(firstNonPbq);
  });

  it("lets answers be changed and cleared before submit", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const session = await startExam(stack, cookie, { certId: stack.certId, examMode: "half" });
    const mc = session.questions.find((q) => q.type === "mc")!;

    for (const choiceIndex of [0, 1, 2]) {
      const res = await request(stack.app)
        .post("/api/exam/attempts")
        .set("Cookie", cookie)
        .send({ sessionId: session.sessionId, questionId: mc.id, answer: { type: "mc", choiceIndex } });
      expect(res.status, "revising an answer must be allowed in exam mode").toBe(200);
    }

    const resumedAfterEdits = await request(stack.app)
      .get(`/api/exam/sessions/${session.sessionId}`)
      .set("Cookie", cookie);
    expect(Object.keys(resumedAfterEdits.body.answers)).toHaveLength(1);

    const cleared = await request(stack.app)
      .post("/api/exam/attempts")
      .set("Cookie", cookie)
      .send({ sessionId: session.sessionId, questionId: mc.id, answer: null });
    expect(cleared.body).toEqual({ recorded: false });

    const resumed = await request(stack.app)
      .get(`/api/exam/sessions/${session.sessionId}`)
      .set("Cookie", cookie);
    expect(resumed.body.answers).toEqual({});
  });

  it("resumes with the clock and answers intact", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const session = await startExam(stack, cookie, { certId: stack.certId, examMode: "domain", domainCodes: ["3.0"] });
    const q = session.questions.find((x) => x.type === "mc")!;
    const recorded = await request(stack.app)
      .post("/api/exam/attempts")
      .set("Cookie", cookie)
      .send({ sessionId: session.sessionId, questionId: q.id, answer: { type: "mc", choiceIndex: 1 } });
    expect(recorded.status).toBe(200);

    const resumed = await request(stack.app)
      .get(`/api/exam/sessions/${session.sessionId}`)
      .set("Cookie", cookie);
    expect(resumed.status).toBe(200);
    const dto = resumed.body as ExamSessionDto;
    expect(dto.questions).toHaveLength(session.questions.length);
    expect(dto.answers[q.id]).toBeDefined();
    expect(dto.secondsRemaining).toBeGreaterThan(0);
    expect(dto.secondsRemaining).toBeLessThanOrEqual(session.timeLimitSeconds);
    // domain drill honored the filter
    for (const question of dto.questions) expect(question.domainCode).toBe("3.0");
  });

  it("tracks flags for review", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const session = await startExam(stack, cookie, { certId: stack.certId, examMode: "half" });
    const id = session.questions[0]!.id;

    const on = await request(stack.app)
      .post(`/api/exam/sessions/${session.sessionId}/flag`)
      .set("Cookie", cookie)
      .send({ questionId: id, flagged: true });
    expect(on.body.flagged).toEqual([id]);

    const off = await request(stack.app)
      .post(`/api/exam/sessions/${session.sessionId}/flag`)
      .set("Cookie", cookie)
      .send({ questionId: id, flagged: false });
    expect(off.body.flagged).toEqual([]);
  });
});

describe("exam timer is server-authoritative", () => {
  it("refuses answers once the deadline passes and still scores the submission", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const session = await startExam(stack, cookie, { certId: stack.certId, examMode: "half" });

    // Force expiry in the DB — a tampered client clock must not matter.
    stack.db
      .update(quizSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(quizSessions.id, session.sessionId))
      .run();

    const late = await request(stack.app)
      .post("/api/exam/attempts")
      .set("Cookie", cookie)
      .send({
        sessionId: session.sessionId,
        questionId: session.questions.find((q) => q.type === "mc")!.id,
        answer: { type: "mc", choiceIndex: 0 },
      });
    expect(late.status).toBe(410);

    const submitted = await request(stack.app)
      .post(`/api/exam/sessions/${session.sessionId}/submit`)
      .set("Cookie", cookie);
    expect(submitted.status).toBe(200);
    const result = submitted.body as ExamResultDto;
    expect(result.expired).toBe(true);
    // unanswered counts against you, exactly as on the real exam
    expect(result.answered).toBe(0);
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });
});

describe("scoring and review", () => {
  it("scores a perfect exam, passes it, and returns a full review", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const session = await startExam(stack, cookie, {
      certId: stack.certId,
      examMode: "domain",
      domainCodes: ["4.0"],
    });
    const byId = stack.content.questionsByCertId.get(stack.certId)!;

    for (const q of session.questions) {
      const source = byId.get(q.id)!;
      let answer;
      switch (source.type) {
        case "mc": {
          // The displayed order is shuffled, so find where the right answer landed.
          const shown = (q as Extract<typeof q, { type: "mc" }>).choices;
          const correctText = source.choices[source.answerIndex]!;
          answer = { type: "mc", choiceIndex: shown.indexOf(correctText) };
          break;
        }
        case "multi": {
          // Same shuffle problem as mc, but for the whole correct set.
          const shown = (q as Extract<typeof q, { type: "multi" }>).choices;
          answer = {
            type: "multi",
            choiceIndices: source.answerIndices.map((i) => shown.indexOf(source.choices[i]!)),
          };
          break;
        }
        case "order":
          answer = { type: "order", order: source.items };
          break;
        case "match":
          answer = {
            type: "match",
            pairs: Object.fromEntries(source.pairs.map((p) => [p.left, p.right])),
          };
          break;
        case "terminal":
          answer = { type: "terminal", command: source.expected[0]! };
          break;
      }
      const res = await request(stack.app)
        .post("/api/exam/attempts")
        .set("Cookie", cookie)
        .send({ sessionId: session.sessionId, questionId: q.id, answer });
      expect(res.status).toBe(200);
    }

    const submitted = await request(stack.app)
      .post(`/api/exam/sessions/${session.sessionId}/submit`)
      .set("Cookie", cookie);
    const result = submitted.body as ExamResultDto;

    expect(result.score).toBe(100);
    expect(result.scaledScore).toBe(900);
    expect(result.passed).toBe(true);
    expect(result.passingScaledScore).toBe(675);
    expect(result.review).toHaveLength(session.questions.length);
    for (const item of result.review) {
      expect(item.correct).toBe(true);
      expect(item.answered).toBe(true);
      expect(item.explanation.length).toBeGreaterThan(0);
      expect(item.solution).toBeDefined();
    }
  });

  it("records the exam in history and feeds the dashboard", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const session = await startExam(stack, cookie, { certId: stack.certId, examMode: "half" });
    const mc = session.questions.find((q) => q.type === "mc")!;
    const recorded = await request(stack.app)
      .post("/api/exam/attempts")
      .set("Cookie", cookie)
      .send({
        sessionId: session.sessionId,
        questionId: mc.id,
        answer: { type: "mc", choiceIndex: 0 },
      });
    expect(recorded.status).toBe(200);
    await request(stack.app)
      .post(`/api/exam/sessions/${session.sessionId}/submit`)
      .set("Cookie", cookie);

    const history = await request(stack.app)
      .get(`/api/exam/history?certId=${stack.certId}`)
      .set("Cookie", cookie);
    expect(history.body).toHaveLength(1);
    expect(history.body[0].examMode).toBe("half");
    expect(history.body[0].scaledScore).toBeGreaterThanOrEqual(100);

    const dash = await request(stack.app)
      .get(`/api/dashboard?certId=${stack.certId}`)
      .set("Cookie", cookie);
    expect(dash.body.exams.attempts).toBe(1);
    expect(dash.body.exams.passingScaledScore).toBe(675);
    expect(dash.body.exams.lastScaledScore).toBeGreaterThanOrEqual(100);
    // exam answers still count toward the readiness engine
    expect(dash.body.quiz.attempts).toBe(1);
    // ...but the exam does not appear in the practice session list
    expect(dash.body.recentSessions).toHaveLength(0);
  });
});

describe("randomization", () => {
  it("draws a different question set on a repeat attempt", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const core2 = stack.content.certIdByCode.get("aplus-core2")!;

    const first = await startExam(stack, cookie, { certId: core2, examMode: "domain", domainCodes: ["1.0", "2.0"] });
    const second = await startExam(stack, cookie, { certId: core2, examMode: "domain", domainCodes: ["1.0", "2.0"] });

    const a = first.questions.map((q) => q.id);
    const b = second.questions.map((q) => q.id);
    // With anti-repeat the second draw should not be the same ordered list.
    expect(b).not.toEqual(a);
  });

  it("two consecutive full mock exams share only a minority of questions", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);

    const first = await startExam(stack, cookie, { certId: stack.certId, examMode: "full" });
    const second = await startExam(stack, cookie, { certId: stack.certId, examMode: "full" });
    expect(first.questions).toHaveLength(90);
    expect(second.questions).toHaveLength(90);

    const a = new Set(first.questions.map((q) => q.id));
    const shared = second.questions.filter((q) => a.has(q.id)).length;
    // This is the property the question bank exists to provide: a second
    // sitting must be mostly new material, not the same exam reshuffled.
    expect(shared / 90, `${shared}/90 questions repeated`).toBeLessThan(0.5);
  });

  it("keeps blueprint weighting at full length", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const session = await startExam(stack, cookie, { certId: stack.certId, examMode: "full" });

    const pack = stack.content.byCertId.get(stack.certId)!;
    for (const domain of pack.domains) {
      const drawn = session.questions.filter((q) => q.domainCode === domain.code).length;
      const expected = (domain.weight / 100) * 90;
      // largest-remainder apportionment lands within a question of the ideal
      expect(Math.abs(drawn - expected), `${domain.code} drew ${drawn}, expected ~${expected}`).toBeLessThanOrEqual(1);
    }
  });

  it("shuffles multiple-choice option order between sessions", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const byId = stack.content.questionsByCertId.get(stack.certId)!;

    // Look across several sessions for any mc question served out of pack order.
    let sawShuffle = false;
    for (let i = 0; i < 5 && !sawShuffle; i++) {
      const session = await startExam(stack, cookie, { certId: stack.certId, examMode: "half" });
      for (const q of session.questions) {
        if (q.type !== "mc") continue;
        const source = byId.get(q.id) as McQuestion;
        if (JSON.stringify(q.choices) !== JSON.stringify(source.choices)) {
          sawShuffle = true;
          // same options, different order — nothing invented or dropped
          expect([...q.choices].sort()).toEqual([...source.choices].sort());
          break;
        }
      }
    }
    expect(sawShuffle, "mc choices were never shuffled across 5 sessions").toBe(true);
  });

  it("grades a shuffled choice against the right original answer", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const byId = stack.content.questionsByCertId.get(stack.certId)!;
    const session = await startExam(stack, cookie, { certId: stack.certId, examMode: "half" });

    // Answer every mc by matching the correct option's *text*, not its index.
    const mcQuestions = session.questions.filter((q) => q.type === "mc");
    for (const q of mcQuestions) {
      const source = byId.get(q.id) as McQuestion;
      const shown = (q as Extract<typeof q, { type: "mc" }>).choices;
      const idx = shown.indexOf(source.choices[source.answerIndex]!);
      await request(stack.app)
        .post("/api/exam/attempts")
        .set("Cookie", cookie)
        .send({ sessionId: session.sessionId, questionId: q.id, answer: { type: "mc", choiceIndex: idx } });
    }

    const submitted = await request(stack.app)
      .post(`/api/exam/sessions/${session.sessionId}/submit`)
      .set("Cookie", cookie);
    const result = submitted.body as ExamResultDto;
    const mcReview = result.review.filter((r) => r.type === "mc");
    expect(mcReview.length).toBe(mcQuestions.length);
    for (const item of mcReview) {
      expect(item.correct, `mc ${item.questionId} graded wrong through the shuffle`).toBe(true);
    }
  });
});

describe("weak-areas selection", () => {
  it("pulls hardest from the domain with the worst mastery", () => {
    const domains = [
      { code: "A", name: "A", weight: 25 },
      { code: "B", name: "B", weight: 25 },
      { code: "C", name: "C", weight: 50 },
    ];
    const pool = domains.flatMap((d) =>
      Array.from({ length: 20 }, (_, i) => ({
        id: `${d.code}-${i}`,
        domainCode: d.code,
        type: "mc" as const,
        prompt: "p",
        explanation: "e",
        choices: ["a", "b"],
        answerIndex: 0,
      })),
    );
    const picked = selectExamQuestions({
      pool,
      domains,
      count: 20,
      selection: "weak",
      masteryByDomain: new Map([
        ["A", 20],
        ["B", 95],
        ["C", 90],
      ]),
    });
    const counts = new Map<string, number>();
    for (const q of picked) counts.set(q.domainCode, (counts.get(q.domainCode) ?? 0) + 1);
    // A is weakest despite C carrying twice the exam weight
    expect(counts.get("A")!).toBeGreaterThan(counts.get("B")!);
    expect(counts.get("A")!).toBeGreaterThan(counts.get("C")!);
  });

  it("treats a never-studied domain as the weakest of all", () => {
    const domains = [
      { code: "A", name: "A", weight: 50 },
      { code: "B", name: "B", weight: 50 },
    ];
    const pool = domains.flatMap((d) =>
      Array.from({ length: 20 }, (_, i) => ({
        id: `${d.code}-${i}`,
        domainCode: d.code,
        type: "mc" as const,
        prompt: "p",
        explanation: "e",
        choices: ["a", "b"],
        answerIndex: 0,
      })),
    );
    const picked = selectExamQuestions({
      pool,
      domains,
      count: 20,
      selection: "weak",
      masteryByDomain: new Map([
        ["A", 80],
        ["B", null],
      ]),
    });
    const bCount = picked.filter((q) => q.domainCode === "B").length;
    expect(bCount).toBeGreaterThan(picked.length / 2);
  });
});

describe("exam isolation", () => {
  it("keeps one user out of another's exam", async () => {
    const stack = createTestStack();
    const alice = await signUp(stack.app, { email: "a@example.com" });
    const bob = await signUp(stack.app, { email: "b@example.com" });
    const session = await startExam(stack, alice.cookie, {
      certId: stack.certId,
      examMode: "half",
    });

    for (const call of [
      request(stack.app).get(`/api/exam/sessions/${session.sessionId}`).set("Cookie", bob.cookie),
      request(stack.app)
        .post(`/api/exam/sessions/${session.sessionId}/submit`)
        .set("Cookie", bob.cookie),
    ]) {
      expect((await call).status).toBe(404);
    }
  });

  it("rejects practice-mode grading calls against an exam session", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const session = await startExam(stack, cookie, { certId: stack.certId, examMode: "half" });

    // /api/quiz/attempts returns correctness — it must not accept an exam session
    const res = await request(stack.app)
      .post("/api/quiz/attempts")
      .set("Cookie", cookie)
      .send({
        sessionId: session.sessionId,
        questionId: session.questions.find((q) => q.type === "mc")!.id,
        answer: { type: "mc", choiceIndex: 0 },
      });
    expect(res.status).toBe(404);
  });
});
