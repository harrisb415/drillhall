import request from "supertest";
import { describe, expect, it } from "vitest";
import { XP_VALUES, getStats } from "../src/modules/gamification/service";
import { createTestStack, signUp, type TestStack } from "./helpers";

async function userIdFor(stack: TestStack, cookie: string): Promise<string> {
  const res = await request(stack.app).get("/api/auth/get-session").set("Cookie", cookie);
  return res.body.user.id;
}

describe("course", () => {
  it("returns lessons and an empty progress map for a fresh user", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);

    const res = await request(stack.app)
      .get(`/api/certs/${stack.certId}/course`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.lessons)).toBe(true);
    expect(res.body.progress).toEqual({});
    expect(res.body.flagged).toEqual([]);
  });

  it("404s completing a lesson that doesn't exist in the pack", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);

    const res = await request(stack.app)
      .post("/api/course/progress")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, lessonId: "no-such-lesson" });
    expect(res.status).toBe(404);
  });

  it("404s for an unknown cert", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);

    const res = await request(stack.app)
      .get("/api/certs/999999/course")
      .set("Cookie", cookie);
    expect(res.status).toBe(404);
  });

  it("requires auth", async () => {
    const stack = createTestStack();
    const res = await request(stack.app).get(`/api/certs/${stack.certId}/course`);
    expect(res.status).toBe(401);
  });
});

describe("course: mark, unmark, remark", () => {
  it("marks a lesson read, awards XP once, and lets it be unmarked and remarked without paying again", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const userId = await userIdFor(stack, cookie);

    const before = await request(stack.app)
      .get(`/api/certs/${stack.certId}/course`)
      .set("Cookie", cookie);
    const lessonId = before.body.lessons[0].id as string;

    // Mark read: appears in progress, XP awarded once.
    const mark1 = await request(stack.app)
      .post("/api/course/progress")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, lessonId });
    expect(mark1.status).toBe(200);
    let course = await request(stack.app)
      .get(`/api/certs/${stack.certId}/course`)
      .set("Cookie", cookie);
    expect(course.body.progress[lessonId]).toBeTypeOf("number");
    expect(getStats(stack.db, userId).xp).toBe(XP_VALUES.lesson_completed);

    // Re-marking read (default) again is idempotent for XP.
    await request(stack.app)
      .post("/api/course/progress")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, lessonId });
    expect(getStats(stack.db, userId).xp).toBe(XP_VALUES.lesson_completed);

    // Unmark: disappears from progress. XP is NOT clawed back.
    const unmark = await request(stack.app)
      .post("/api/course/progress")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, lessonId, read: false });
    expect(unmark.status).toBe(200);
    course = await request(stack.app)
      .get(`/api/certs/${stack.certId}/course`)
      .set("Cookie", cookie);
    expect(course.body.progress[lessonId]).toBeUndefined();
    expect(getStats(stack.db, userId).xp).toBe(XP_VALUES.lesson_completed);

    // Remark: reappears in progress. XP is NOT paid a second time -- the
    // whole point of guarding by row existence rather than the read flag.
    const remark = await request(stack.app)
      .post("/api/course/progress")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, lessonId });
    expect(remark.status).toBe(200);
    course = await request(stack.app)
      .get(`/api/certs/${stack.certId}/course`)
      .set("Cookie", cookie);
    expect(course.body.progress[lessonId]).toBeTypeOf("number");
    expect(getStats(stack.db, userId).xp).toBe(XP_VALUES.lesson_completed);
  });

  it("keeps each user's read state separate", async () => {
    const stack = createTestStack();
    const alice = await signUp(stack.app, { email: "alice-course@example.com" });
    const bob = await signUp(stack.app, { email: "bob-course@example.com" });

    const listing = await request(stack.app)
      .get(`/api/certs/${stack.certId}/course`)
      .set("Cookie", alice.cookie);
    const lessonId = listing.body.lessons[0].id as string;

    await request(stack.app)
      .post("/api/course/progress")
      .set("Cookie", alice.cookie)
      .send({ certId: stack.certId, lessonId });

    const bobsView = await request(stack.app)
      .get(`/api/certs/${stack.certId}/course`)
      .set("Cookie", bob.cookie);
    expect(bobsView.body.progress[lessonId]).toBeUndefined();
  });
});

describe("course: flag for review", () => {
  it("flags and clears a flag, independent of read state", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);

    const before = await request(stack.app)
      .get(`/api/certs/${stack.certId}/course`)
      .set("Cookie", cookie);
    const lessonId = before.body.lessons[0].id as string;

    const flag = await request(stack.app)
      .post("/api/course/flag")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, lessonId });
    expect(flag.status).toBe(200);

    let course = await request(stack.app)
      .get(`/api/certs/${stack.certId}/course`)
      .set("Cookie", cookie);
    expect(course.body.flagged).toEqual([lessonId]);
    expect(course.body.progress[lessonId]).toBeUndefined();

    // Flagging again is idempotent (no duplicate/error on the composite PK).
    const reflag = await request(stack.app)
      .post("/api/course/flag")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, lessonId });
    expect(reflag.status).toBe(200);
    course = await request(stack.app)
      .get(`/api/certs/${stack.certId}/course`)
      .set("Cookie", cookie);
    expect(course.body.flagged).toEqual([lessonId]);

    const clear = await request(stack.app)
      .post("/api/course/flag")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, lessonId, flagged: false });
    expect(clear.status).toBe(200);
    course = await request(stack.app)
      .get(`/api/certs/${stack.certId}/course`)
      .set("Cookie", cookie);
    expect(course.body.flagged).toEqual([]);
  });

  it("flagging an unread lesson doesn't block XP when it's later marked read", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const userId = await userIdFor(stack, cookie);

    const before = await request(stack.app)
      .get(`/api/certs/${stack.certId}/course`)
      .set("Cookie", cookie);
    const lessonId = before.body.lessons[0].id as string;

    await request(stack.app)
      .post("/api/course/flag")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, lessonId });

    await request(stack.app)
      .post("/api/course/progress")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, lessonId });

    expect(getStats(stack.db, userId).xp).toBe(XP_VALUES.lesson_completed);
  });

  it("404s flagging a lesson that doesn't exist in the pack", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);

    const res = await request(stack.app)
      .post("/api/course/flag")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, lessonId: "no-such-lesson" });
    expect(res.status).toBe(404);
  });

  it("keeps each user's flags separate", async () => {
    const stack = createTestStack();
    const alice = await signUp(stack.app, { email: "alice-flag@example.com" });
    const bob = await signUp(stack.app, { email: "bob-flag@example.com" });

    const listing = await request(stack.app)
      .get(`/api/certs/${stack.certId}/course`)
      .set("Cookie", alice.cookie);
    const lessonId = listing.body.lessons[0].id as string;

    await request(stack.app)
      .post("/api/course/flag")
      .set("Cookie", alice.cookie)
      .send({ certId: stack.certId, lessonId });

    const bobsView = await request(stack.app)
      .get(`/api/certs/${stack.certId}/course`)
      .set("Cookie", bob.cookie);
    expect(bobsView.body.flagged).toEqual([]);
  });
});
