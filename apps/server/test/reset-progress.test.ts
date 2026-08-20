import request from "supertest";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  courseFlags,
  courseProgress,
  examPlans,
  flashcardProgress,
  flashcardState,
  gamificationStats,
  notificationPreferences,
  quizAttempts,
  quizSessions,
} from "../src/db/schema";
import { getStats } from "../src/modules/gamification/service";
import { createTestStack, signUp } from "./helpers";

async function userIdFor(stack: ReturnType<typeof createTestStack>, cookie: string): Promise<string> {
  const res = await request(stack.app).get("/api/auth/get-session").set("Cookie", cookie);
  return res.body.user.id as string;
}

describe("POST /api/settings/reset-progress", () => {
  it("requires a signed-in session", async () => {
    const stack = createTestStack();
    const res = await request(stack.app).post("/api/settings/reset-progress");
    expect(res.status).toBe(401);
  });

  it("wipes XP/level/streak, quiz/exam history, flashcard state, and course state, but leaves the booked exam date and notification prefs alone", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const userId = await userIdFor(stack, cookie);

    // Rack up progress across every area the feature is supposed to touch.
    const start = await request(stack.app)
      .post("/api/quiz/sessions")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, count: 2, types: ["mc"] });
    for (const q of start.body.questions) {
      await request(stack.app)
        .post("/api/quiz/attempts")
        .set("Cookie", cookie)
        .send({ sessionId: start.body.sessionId, questionId: q.id, answer: { type: "mc", choiceIndex: 0 } });
    }
    await request(stack.app)
      .post(`/api/quiz/sessions/${start.body.sessionId}/complete`)
      .set("Cookie", cookie);

    const cards = await request(stack.app)
      .get(`/api/certs/${stack.certId}/flashcards`)
      .set("Cookie", cookie);
    const cardId = cards.body.cards[0].id as string;
    await request(stack.app)
      .post("/api/flashcards/progress")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, cardId, status: "known" });
    await request(stack.app)
      .post("/api/flashcards/state")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, domainCode: null, hideKnown: false, seed: 0, cardIndex: 1 });

    const course = await request(stack.app)
      .get(`/api/certs/${stack.certId}/course`)
      .set("Cookie", cookie);
    const lessonId = course.body.lessons[0].id as string;
    await request(stack.app)
      .post("/api/course/progress")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, lessonId, read: true });
    await request(stack.app)
      .post("/api/course/flag")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, lessonId, flagged: true });

    // Things the reset must NOT touch.
    await request(stack.app)
      .put("/api/exam-plans")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, examDate: "2027-01-15" });
    await request(stack.app)
      .put("/api/settings/notifications")
      .set("Cookie", cookie)
      .send({ emailEnabled: false });

    // Sanity: everything actually landed before we wipe it.
    expect(getStats(stack.db, userId).xp).toBeGreaterThan(0);
    expect(
      stack.db.select().from(quizAttempts).where(eq(quizAttempts.userId, userId)).all().length,
    ).toBeGreaterThan(0);
    expect(
      stack.db.select().from(flashcardProgress).where(eq(flashcardProgress.userId, userId)).all()
        .length,
    ).toBeGreaterThan(0);
    expect(
      stack.db.select().from(courseProgress).where(eq(courseProgress.userId, userId)).all().length,
    ).toBeGreaterThan(0);

    const res = await request(stack.app).post("/api/settings/reset-progress").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    // Progress tables: empty.
    const stats = getStats(stack.db, userId);
    expect(stats.xp).toBe(0);
    expect(stats.level).toBe(1);
    expect(stats.currentStreak).toBe(0);
    expect(stats.hasActivity).toBe(false);
    for (const table of [quizAttempts, quizSessions, flashcardProgress, flashcardState, courseProgress, courseFlags]) {
      const rows = stack.db.select().from(table).where(eq(table.userId, userId)).all();
      expect(rows).toEqual([]);
    }
    expect(
      stack.db.select().from(gamificationStats).where(eq(gamificationStats.userId, userId)).get(),
    ).toBeUndefined();

    // Untouched.
    const plan = stack.db.select().from(examPlans).where(eq(examPlans.userId, userId)).get();
    expect(plan?.certId).toBe(stack.certId);
    const prefs = stack.db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .get();
    expect(prefs?.emailEnabled).toBe(false);
  });
});

describe("POST /api/settings/reset-progress/:certId", () => {
  it("requires a signed-in session", async () => {
    const stack = createTestStack();
    const res = await request(stack.app).post(`/api/settings/reset-progress/${stack.certId}`);
    expect(res.status).toBe(401);
  });

  it("404s on a cert id that doesn't exist", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const res = await request(stack.app)
      .post("/api/settings/reset-progress/999999")
      .set("Cookie", cookie);
    expect(res.status).toBe(404);
  });

  it("wipes progress for the given cert only, leaving other certs and XP/level/streak untouched", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const userId = await userIdFor(stack, cookie);
    const core2 = stack.content.certIdByCode.get("aplus-core2")!;

    // Progress on the cert we're about to reset.
    const start = await request(stack.app)
      .post("/api/quiz/sessions")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, count: 2, types: ["mc"] });
    for (const q of start.body.questions) {
      await request(stack.app)
        .post("/api/quiz/attempts")
        .set("Cookie", cookie)
        .send({ sessionId: start.body.sessionId, questionId: q.id, answer: { type: "mc", choiceIndex: 0 } });
    }
    const cards = await request(stack.app)
      .get(`/api/certs/${stack.certId}/flashcards`)
      .set("Cookie", cookie);
    await request(stack.app)
      .post("/api/flashcards/progress")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, cardId: cards.body.cards[0].id, status: "known" });

    // Same shape of progress on a second cert, which must survive.
    const core2Start = await request(stack.app)
      .post("/api/quiz/sessions")
      .set("Cookie", cookie)
      .send({ certId: core2, count: 2, types: ["mc"] });
    for (const q of core2Start.body.questions) {
      await request(stack.app)
        .post("/api/quiz/attempts")
        .set("Cookie", cookie)
        .send({ sessionId: core2Start.body.sessionId, questionId: q.id, answer: { type: "mc", choiceIndex: 0 } });
    }
    const core2Cards = await request(stack.app)
      .get(`/api/certs/${core2}/flashcards`)
      .set("Cookie", cookie);
    await request(stack.app)
      .post("/api/flashcards/progress")
      .set("Cookie", cookie)
      .send({ certId: core2, cardId: core2Cards.body.cards[0].id, status: "known" });

    const xpBefore = getStats(stack.db, userId).xp;
    expect(xpBefore).toBeGreaterThan(0);

    const res = await request(stack.app)
      .post(`/api/settings/reset-progress/${stack.certId}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    // The reset cert: empty.
    for (const table of [quizAttempts, quizSessions, flashcardProgress]) {
      const rows = stack.db
        .select()
        .from(table)
        .where(eq(table.userId, userId))
        .all()
        .filter((r) => r.certId === stack.certId);
      expect(rows).toEqual([]);
    }

    // The other cert: untouched.
    for (const table of [quizAttempts, flashcardProgress]) {
      const rows = stack.db
        .select()
        .from(table)
        .where(eq(table.userId, userId))
        .all()
        .filter((r) => r.certId === core2);
      expect(rows.length).toBeGreaterThan(0);
    }

    // XP/level/streak are cross-cert by design — a single-cert reset never touches them.
    expect(getStats(stack.db, userId).xp).toBe(xpBefore);
  });
});
