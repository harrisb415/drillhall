import request from "supertest";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DashboardStats } from "@comptia/shared-types";
import { gamificationStats } from "../src/db/schema";
import { computeLevel, xpForLevel, xpIntoCurrentLevel } from "../src/modules/gamification/levels";
import { XP_VALUES, getStats, recordActivity } from "../src/modules/gamification/service";
import { createTestStack, signUp, type TestStack } from "./helpers";

const DAY = 24 * 60 * 60 * 1000;

async function userIdFor(stack: TestStack, cookie: string): Promise<string> {
  const res = await request(stack.app).get("/api/auth/get-session").set("Cookie", cookie);
  return res.body.user.id as string;
}

describe("level curve", () => {
  it("starts at level 1 and rises monotonically", () => {
    expect(computeLevel(0)).toBe(1);
    expect(xpForLevel(1)).toBe(0);
    let last = 0;
    for (let level = 2; level <= 25; level++) {
      const needed = xpForLevel(level);
      expect(needed).toBeGreaterThan(last);
      last = needed;
    }
  });

  it("requires progressively more XP for each level", () => {
    // the gap between levels must widen, so later levels mean sustained work
    const gaps = [2, 3, 4, 5, 6].map((l) => xpForLevel(l) - xpForLevel(l - 1));
    for (let i = 1; i < gaps.length; i++) {
      expect(gaps[i]!).toBeGreaterThan(gaps[i - 1]!);
    }
  });

  it("reports progress within the current level", () => {
    const xp = xpForLevel(3) + 10;
    const { current, needed } = xpIntoCurrentLevel(xp);
    expect(computeLevel(xp)).toBe(3);
    expect(current).toBe(10);
    expect(needed).toBe(xpForLevel(4) - xpForLevel(3));
  });
});

describe("recordActivity", () => {
  it("awards the XP the action is worth and starts a streak", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const userId = await userIdFor(stack, cookie);

    const result = recordActivity(stack.db, userId, "question_answered");
    expect(result.xp).toBe(XP_VALUES.question_answered);
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(1);
    expect(result.streakExtended).toBe(true);
  });

  it("accrues XP every time but moves the streak only once a day", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const userId = await userIdFor(stack, cookie);
    const today = new Date("2026-08-20T09:00:00.000Z");

    // 50 questions in one sitting: XP 50x, streak once.
    let result = recordActivity(stack.db, userId, "question_answered", today);
    for (let i = 1; i < 50; i++) {
      result = recordActivity(stack.db, userId, "question_answered", new Date(today.getTime() + i * 1000));
    }
    expect(result.xp).toBe(50 * XP_VALUES.question_answered);
    expect(result.currentStreak).toBe(1);
  });

  it("extends the streak on consecutive days", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const userId = await userIdFor(stack, cookie);
    const day1 = new Date("2026-08-20T09:00:00.000Z");

    recordActivity(stack.db, userId, "question_answered", day1);
    const day2 = recordActivity(stack.db, userId, "question_answered", new Date(day1.getTime() + DAY));
    expect(day2.currentStreak).toBe(2);
    const day3 = recordActivity(stack.db, userId, "question_answered", new Date(day1.getTime() + 2 * DAY));
    expect(day3.currentStreak).toBe(3);
    expect(day3.longestStreak).toBe(3);
  });

  it("resets to 1 after a missed day but remembers the longest run", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const userId = await userIdFor(stack, cookie);
    const day1 = new Date("2026-08-20T09:00:00.000Z");

    recordActivity(stack.db, userId, "question_answered", day1);
    recordActivity(stack.db, userId, "question_answered", new Date(day1.getTime() + DAY));
    recordActivity(stack.db, userId, "question_answered", new Date(day1.getTime() + 2 * DAY));
    // skip a day
    const afterGap = recordActivity(
      stack.db,
      userId,
      "question_answered",
      new Date(day1.getTime() + 4 * DAY),
    );
    expect(afterGap.currentStreak).toBe(1);
    expect(afterGap.longestStreak).toBe(3);
  });

  it("uses UTC day boundaries, not the host's local ones", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const userId = await userIdFor(stack, cookie);

    // Both instants are the same UTC day (20 Aug) but straddle midnight in
    // Los Angeles — a local-time comparison would call this a 2-day streak.
    recordActivity(stack.db, userId, "question_answered", new Date("2026-08-20T06:00:00.000Z"));
    const second = recordActivity(
      stack.db,
      userId,
      "question_answered",
      new Date("2026-08-20T22:00:00.000Z"),
    );
    expect(second.currentStreak).toBe(1);
  });

  it("flags a level-up when the threshold is crossed", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const userId = await userIdFor(stack, cookie);

    let sawLevelUp = false;
    for (let i = 0; i < 40 && !sawLevelUp; i++) {
      const r = recordActivity(stack.db, userId, "question_answered");
      if (r.leveledUp) {
        sawLevelUp = true;
        expect(r.level).toBeGreaterThan(1);
      }
    }
    expect(sawLevelUp).toBe(true);
  });
});

/**
 * The regression test for the bug the transaction closes (spec §9): a
 * read-modify-write without one lets two near-simultaneous requests read the
 * same starting XP, so one write clobbers the other.
 */
describe("concurrent activity", () => {
  it("counts every concurrent award rather than losing one to a clobber", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const userId = await userIdFor(stack, cookie);

    const calls = 20;
    await Promise.all(
      Array.from({ length: calls }, () =>
        Promise.resolve().then(() => recordActivity(stack.db, userId, "question_answered")),
      ),
    );

    const stats = getStats(stack.db, userId);
    expect(stats.xp).toBe(calls * XP_VALUES.question_answered);
    // and the streak counted the day exactly once despite the pile-up
    expect(stats.currentStreak).toBe(1);
  });

  it("does not double-count the streak under concurrency", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const userId = await userIdFor(stack, cookie);
    const at = new Date("2026-08-20T09:00:00.000Z");

    await Promise.all(
      Array.from({ length: 10 }, () =>
        Promise.resolve().then(() => recordActivity(stack.db, userId, "flashcard_known", at)),
      ),
    );
    const row = stack.db
      .select()
      .from(gamificationStats)
      .where(eq(gamificationStats.userId, userId))
      .get()!;
    expect(row.currentStreak).toBe(1);
    expect(row.longestStreak).toBe(1);
    expect(row.xp).toBe(10 * XP_VALUES.flashcard_known);
  });
});

describe("XP is awarded from the real endpoints", () => {
  it("gives XP per answered question and again for completing the session", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const userId = await userIdFor(stack, cookie);

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
    expect(getStats(stack.db, userId).xp).toBe(3 * XP_VALUES.question_answered);

    await request(stack.app)
      .post(`/api/quiz/sessions/${start.body.sessionId}/complete`)
      .set("Cookie", cookie);
    expect(getStats(stack.db, userId).xp).toBe(
      3 * XP_VALUES.question_answered + XP_VALUES.session_completed,
    );
  });

  it("does not pay twice for re-posting a completion", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const userId = await userIdFor(stack, cookie);

    const start = await request(stack.app)
      .post("/api/quiz/sessions")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, count: 1, types: ["mc"] });
    await request(stack.app)
      .post(`/api/quiz/sessions/${start.body.sessionId}/complete`)
      .set("Cookie", cookie);
    const afterFirst = getStats(stack.db, userId).xp;

    for (let i = 0; i < 3; i++) {
      await request(stack.app)
        .post(`/api/quiz/sessions/${start.body.sessionId}/complete`)
        .set("Cookie", cookie);
    }
    expect(getStats(stack.db, userId).xp).toBe(afterFirst);
  });

  it("pays the exam bonus once per exam", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const userId = await userIdFor(stack, cookie);

    const start = await request(stack.app)
      .post("/api/exam/sessions")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, examMode: "domain", domainCodes: ["4.0"] });
    const before = getStats(stack.db, userId).xp;

    await request(stack.app)
      .post(`/api/exam/sessions/${start.body.sessionId}/submit`)
      .set("Cookie", cookie);
    expect(getStats(stack.db, userId).xp).toBe(before + XP_VALUES.exam_completed);

    await request(stack.app)
      .post(`/api/exam/sessions/${start.body.sessionId}/submit`)
      .set("Cookie", cookie);
    expect(getStats(stack.db, userId).xp).toBe(before + XP_VALUES.exam_completed);
  });

  it("pays for a flashcard only on the transition into known", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const userId = await userIdFor(stack, cookie);
    const cards = await request(stack.app)
      .get(`/api/certs/${stack.certId}/flashcards`)
      .set("Cookie", cookie);
    const cardId = cards.body.cards[0].id as string;

    const mark = (status: string) =>
      request(stack.app)
        .post("/api/flashcards/progress")
        .set("Cookie", cookie)
        .send({ certId: stack.certId, cardId, status });

    await mark("known");
    expect(getStats(stack.db, userId).xp).toBe(XP_VALUES.flashcard_known);

    // re-saving known, or toggling back and forth, must not farm XP
    await mark("known");
    await mark("learning");
    expect(getStats(stack.db, userId).xp).toBe(XP_VALUES.flashcard_known);

    // but genuinely re-learning it and marking known again does count
    await mark("known");
    expect(getStats(stack.db, userId).xp).toBe(2 * XP_VALUES.flashcard_known);
  });

  it("surfaces stats on the dashboard, unscoped by cert", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const core2 = stack.content.certIdByCode.get("aplus-core2")!;

    const start = await request(stack.app)
      .post("/api/quiz/sessions")
      .set("Cookie", cookie)
      .send({ certId: core2, count: 2, types: ["mc"] });
    for (const q of start.body.questions) {
      await request(stack.app)
        .post("/api/quiz/attempts")
        .set("Cookie", cookie)
        .send({ sessionId: start.body.sessionId, questionId: q.id, answer: { type: "mc", choiceIndex: 0 } });
    }

    // XP earned on Core 2 shows on the Core 1 dashboard too — it measures
    // study habit, not progress against one exam.
    const dash = await request(stack.app)
      .get(`/api/dashboard?certId=${stack.certId}`)
      .set("Cookie", cookie);
    const g = (dash.body as DashboardStats).gamification;
    expect(g.xp).toBe(2 * XP_VALUES.question_answered);
    expect(g.currentStreak).toBe(1);
    expect(g.activeToday).toBe(true);
    expect(g.level).toBeGreaterThanOrEqual(1);
  });
});
