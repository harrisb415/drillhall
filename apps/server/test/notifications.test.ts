import request from "supertest";
import { describe, expect, it } from "vitest";
import { pino } from "pino";
import { eq } from "drizzle-orm";
import type { ExamPlanDto, NotificationPrefsDto } from "@comptia/shared-types";
import { notificationLog, quizAttempts, quizSessions } from "../src/db/schema";
import {
  checkExamReminders,
  checkInactivityNudges,
  checkWeeklyDigest,
  runAllChecks,
  type SchedulerDeps,
} from "../src/modules/notifications/scheduler";
import { createNotificationService } from "../src/modules/notifications/service";
import { utcDateKey, utcDaysUntil, utcLongDate } from "../src/lib/dates";
import { createTestStack, signUp, type TestStack } from "./helpers";

const DAY = 24 * 60 * 60 * 1000;
const silent = pino({ level: "silent" });

function schedulerFor(stack: TestStack, inactivityDays = 7): SchedulerDeps {
  return {
    db: stack.db,
    content: stack.content,
    notifications: createNotificationService({
      db: stack.db,
      sendEmail: async (msg) => {
        stack.emails.push(msg);
      },
      logger: silent,
    }),
    logger: silent,
    baseURL: "http://localhost:3001",
    inactivityDays,
  };
}

async function setPlan(stack: TestStack, cookie: string, certId: number, examDate: string) {
  const res = await request(stack.app)
    .put("/api/exam-plans")
    .set("Cookie", cookie)
    .send({ certId, examDate });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as ExamPlanDto;
}

/** A YYYY-MM-DD that is exactly `days` UTC calendar days from today. */
function isoDaysFromNow(days: number): string {
  const now = new Date();
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(base + days * DAY).toISOString().slice(0, 10);
}

describe("exam date arithmetic stays in UTC", () => {
  it("counts calendar days from the stored UTC date regardless of host timezone", () => {
    // A date picked as the 25th must read as the 25th, not the 24th, even
    // when the host clock sits at a negative UTC offset.
    const exam = new Date("2026-08-25T00:00:00.000Z");
    expect(utcDaysUntil(exam, new Date("2026-08-15T08:00:00.000Z"))).toBe(10);
    // late evening in Los Angeles is already the next day in UTC
    expect(utcDaysUntil(exam, new Date("2026-08-15T06:59:00.000Z"))).toBe(10);
    expect(utcDaysUntil(exam, new Date("2026-08-25T23:59:00.000Z"))).toBe(0);
    expect(utcDaysUntil(exam, new Date("2026-08-26T00:01:00.000Z"))).toBe(-1);
  });

  it("keys the dedupe window off the UTC date", () => {
    expect(utcDateKey(new Date("2026-08-25T00:00:00.000Z"))).toBe("2026-08-25");
    expect(utcLongDate(new Date("2026-08-25T00:00:00.000Z"))).toMatch(/Tuesday.*25 August 2026/);
  });
});

describe("exam planner", () => {
  it("stores a date per cert and reports calendar days remaining", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);

    const plan = await setPlan(stack, cookie, stack.certId, isoDaysFromNow(10));
    expect(plan.certId).toBe(stack.certId);
    expect(plan.daysRemaining).toBe(10);

    const list = await request(stack.app).get("/api/exam-plans").set("Cookie", cookie);
    expect(list.body).toHaveLength(1);
  });

  it("replaces the date rather than accumulating plans for one cert", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    await setPlan(stack, cookie, stack.certId, isoDaysFromNow(30));
    await setPlan(stack, cookie, stack.certId, isoDaysFromNow(14));

    const list = await request(stack.app).get("/api/exam-plans").set("Cookie", cookie);
    expect(list.body).toHaveLength(1);
    expect((list.body as ExamPlanDto[])[0]!.daysRemaining).toBe(14);
  });

  it("keeps separate plans per cert and deletes only the one asked for", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const core2 = stack.content.certIdByCode.get("aplus-core2")!;
    await setPlan(stack, cookie, stack.certId, isoDaysFromNow(20));
    await setPlan(stack, cookie, core2, isoDaysFromNow(40));

    await request(stack.app).delete(`/api/exam-plans/${stack.certId}`).set("Cookie", cookie);
    const list = await request(stack.app).get("/api/exam-plans").set("Cookie", cookie);
    expect(list.body).toHaveLength(1);
    expect((list.body as ExamPlanDto[])[0]!.certId).toBe(core2);
  });

  it("rejects a malformed date and an unknown cert", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const bad = await request(stack.app)
      .put("/api/exam-plans")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, examDate: "next tuesday" });
    expect(bad.status).toBe(400);

    const unknown = await request(stack.app)
      .put("/api/exam-plans")
      .set("Cookie", cookie)
      .send({ certId: 9999, examDate: isoDaysFromNow(5) });
    expect(unknown.status).toBe(404);
  });

  it("does not expose one user's plan to another", async () => {
    const stack = createTestStack();
    const alice = await signUp(stack.app, { email: "a@example.com" });
    const bob = await signUp(stack.app, { email: "b@example.com" });
    await setPlan(stack, alice.cookie, stack.certId, isoDaysFromNow(9));

    const list = await request(stack.app).get("/api/exam-plans").set("Cookie", bob.cookie);
    expect(list.body).toEqual([]);
  });
});

describe("exam reminders", () => {
  it("sends only on the configured lead days", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app, { email: "planner@example.com" });
    await setPlan(stack, cookie, stack.certId, isoDaysFromNow(7));
    stack.emails.length = 0;

    const deps = schedulerFor(stack);
    expect(await checkExamReminders(deps)).toBe(1);
    expect(stack.emails[0]!.subject).toMatch(/in 7 days/);

    // 6 days out is not a configured window
    stack.emails.length = 0;
    expect(await checkExamReminders(deps, new Date(Date.now() + 1 * DAY))).toBe(0);

    // ...but 3 days out is
    expect(await checkExamReminders(deps, new Date(Date.now() + 4 * DAY))).toBe(1);
  });

  it("never sends the same window twice, however often the job runs", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app, { email: "dedupe@example.com" });
    await setPlan(stack, cookie, stack.certId, isoDaysFromNow(1));
    stack.emails.length = 0;

    const deps = schedulerFor(stack);
    expect(await checkExamReminders(deps)).toBe(1);
    // simulate the cron firing repeatedly across the same day
    for (let i = 0; i < 5; i++) expect(await checkExamReminders(deps)).toBe(0);
    expect(stack.emails).toHaveLength(1);

    const rows = stack.db.select().from(notificationLog).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe("exam_reminder");
  });

  it("respects the user turning exam reminders off", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app, { email: "off@example.com" });
    await setPlan(stack, cookie, stack.certId, isoDaysFromNow(3));
    await request(stack.app)
      .put("/api/settings/notifications")
      .set("Cookie", cookie)
      .send({ examReminders: false });
    stack.emails.length = 0;

    expect(await checkExamReminders(schedulerFor(stack))).toBe(0);
    expect(stack.emails).toHaveLength(0);
  });

  it("honours a custom lead-time selection", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app, { email: "custom@example.com" });
    await setPlan(stack, cookie, stack.certId, isoDaysFromNow(14));
    await request(stack.app)
      .put("/api/settings/notifications")
      .set("Cookie", cookie)
      .send({ examReminderDays: [14] });
    stack.emails.length = 0;

    expect(await checkExamReminders(schedulerFor(stack))).toBe(1);
    expect(stack.emails[0]!.subject).toMatch(/in 14 days/);
  });

  it("ignores exams that have already passed", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app, { email: "past@example.com" });
    await setPlan(stack, cookie, stack.certId, isoDaysFromNow(-3));
    stack.emails.length = 0;

    expect(await checkExamReminders(schedulerFor(stack))).toBe(0);
  });

  it("switching email off silences every type", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app, { email: "quiet@example.com" });
    await setPlan(stack, cookie, stack.certId, isoDaysFromNow(1));
    await request(stack.app)
      .put("/api/settings/notifications")
      .set("Cookie", cookie)
      .send({ emailEnabled: false });
    stack.emails.length = 0;

    await runAllChecks(schedulerFor(stack));
    expect(stack.emails).toHaveLength(0);
  });
});

describe("inactivity nudges", () => {
  it("nudges a user who has gone quiet, once per day", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app, { email: "idle@example.com" });

    // give them a single attempt, dated well in the past
    const start = await request(stack.app)
      .post("/api/quiz/sessions")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, count: 1, types: ["mc"] });
    await request(stack.app)
      .post("/api/quiz/attempts")
      .set("Cookie", cookie)
      .send({
        sessionId: start.body.sessionId,
        questionId: start.body.questions[0].id,
        answer: { type: "mc", choiceIndex: 0 },
      });
    const longAgo = new Date(Date.now() - 30 * DAY);
    stack.db.update(quizAttempts).set({ answeredAt: longAgo }).run();
    // the session row counts as activity too, so age it as well
    stack.db.update(quizSessions).set({ startedAt: longAgo }).run();
    stack.emails.length = 0;

    const deps = schedulerFor(stack);
    expect(await checkInactivityNudges(deps)).toBe(1);
    expect(await checkInactivityNudges(deps)).toBe(0);
    expect(stack.emails).toHaveLength(1);
    expect(stack.emails[0]!.subject).toMatch(/still studying/i);
  });

  it("leaves alone a user who has never studied at all", async () => {
    const stack = createTestStack();
    await signUp(stack.app, { email: "never@example.com" });
    stack.emails.length = 0;

    expect(await checkInactivityNudges(schedulerFor(stack))).toBe(0);
  });

  it("leaves alone a user who studied today", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app, { email: "active@example.com" });
    await request(stack.app)
      .post("/api/quiz/sessions")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, count: 1, types: ["mc"] });
    stack.emails.length = 0;

    expect(await checkInactivityNudges(schedulerFor(stack))).toBe(0);
  });
});

describe("weekly digest", () => {
  it("summarises the week once and only for users who studied", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app, { email: "digest@example.com" });
    await signUp(stack.app, { email: "lurker@example.com" });

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
    stack.emails.length = 0;

    const deps = schedulerFor(stack);
    expect(await checkWeeklyDigest(deps)).toBe(1);
    expect(await checkWeeklyDigest(deps)).toBe(0); // same ISO week
    expect(stack.emails).toHaveLength(1);
    expect(stack.emails[0]!.to).toBe("digest@example.com");
    expect(stack.emails[0]!.text).toMatch(/answered 3 questions/);
  });

  it("is skipped entirely when set to never", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app, { email: "nodigest@example.com" });
    const start = await request(stack.app)
      .post("/api/quiz/sessions")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, count: 1, types: ["mc"] });
    await request(stack.app)
      .post("/api/quiz/attempts")
      .set("Cookie", cookie)
      .send({
        sessionId: start.body.sessionId,
        questionId: start.body.questions[0].id,
        answer: { type: "mc", choiceIndex: 0 },
      });
    await request(stack.app)
      .put("/api/settings/notifications")
      .set("Cookie", cookie)
      .send({ digestFrequency: "never" });
    stack.emails.length = 0;

    expect(await checkWeeklyDigest(schedulerFor(stack))).toBe(0);
  });
});

describe("notification preferences API", () => {
  it("returns sensible defaults before anything is saved", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const res = await request(stack.app).get("/api/settings/notifications").set("Cookie", cookie);
    expect(res.status).toBe(200);

    const prefs = res.body as NotificationPrefsDto;
    expect(prefs.emailEnabled).toBe(true);
    expect(prefs.examReminderDays).toEqual([7, 3, 1]);
    expect(prefs.digestFrequency).toBe("weekly");
  });

  it("saves a partial update without clobbering the other fields", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    await request(stack.app)
      .put("/api/settings/notifications")
      .set("Cookie", cookie)
      .send({ examReminderDays: [30, 7] });

    const after = await request(stack.app)
      .put("/api/settings/notifications")
      .set("Cookie", cookie)
      .send({ inactivityReminders: false });

    const prefs = after.body as NotificationPrefsDto;
    expect(prefs.examReminderDays).toEqual([30, 7]);
    expect(prefs.inactivityReminders).toBe(false);
    expect(prefs.emailEnabled).toBe(true);
  });

  it("does not clobber a captured timezone when saving other preferences", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    await request(stack.app)
      .post("/api/settings/timezone")
      .set("Cookie", cookie)
      .send({ timezone: "America/Los_Angeles" });

    const after = await request(stack.app)
      .put("/api/settings/notifications")
      .set("Cookie", cookie)
      .send({ emailEnabled: false });
    expect((after.body as NotificationPrefsDto).timezone).toBe("America/Los_Angeles");
  });

  it("requires a session", async () => {
    const stack = createTestStack();
    expect((await request(stack.app).get("/api/settings/notifications")).status).toBe(401);
    expect((await request(stack.app).get("/api/exam-plans")).status).toBe(401);
  });
});

describe("scheduler resilience", () => {
  it("keeps running the other checks when one throws", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app, { email: "resilient@example.com" });

    // An exam reminder is due (checked first) *and* the user has gone quiet,
    // so if a thrown reminder aborted the sweep the nudge would never send.
    await setPlan(stack, cookie, stack.certId, isoDaysFromNow(1));
    const start = await request(stack.app)
      .post("/api/quiz/sessions")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, count: 1, types: ["mc"] });
    await request(stack.app)
      .post("/api/quiz/attempts")
      .set("Cookie", cookie)
      .send({
        sessionId: start.body.sessionId,
        questionId: start.body.questions[0].id,
        answer: { type: "mc", choiceIndex: 0 },
      });
    const longAgo = new Date(Date.now() - 30 * DAY);
    stack.db.update(quizAttempts).set({ answeredAt: longAgo }).run();
    stack.db.update(quizSessions).set({ startedAt: longAgo }).run();
    stack.emails.length = 0;

    const deps = schedulerFor(stack);
    const failing: SchedulerDeps = {
      ...deps,
      notifications: {
        async send(input) {
          if (input.type === "exam_reminder") throw new Error("transient");
          return deps.notifications.send(input);
        },
      },
    };

    await expect(runAllChecks(failing)).resolves.toBeUndefined();
    // the reminder blew up, but the inactivity nudge still went out
    expect(stack.emails.map((e) => e.subject)).toContain("Still studying?");
  });

  it("a claimed send is not retried even if the email itself fails", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app, { email: "bounce@example.com" });
    await setPlan(stack, cookie, stack.certId, isoDaysFromNow(1));

    const service = createNotificationService({
      db: stack.db,
      sendEmail: async () => {
        throw new Error("smtp exploded");
      },
      logger: silent,
    });
    const deps: SchedulerDeps = { ...schedulerFor(stack), notifications: service };

    expect(await checkExamReminders(deps)).toBe(0); // send failed
    // but the window is claimed, so a retry storm can't spam the user
    const rows = stack.db
      .select()
      .from(notificationLog)
      .where(eq(notificationLog.type, "exam_reminder"))
      .all();
    expect(rows).toHaveLength(1);
  });
});
