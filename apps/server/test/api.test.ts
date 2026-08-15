import Database from "better-sqlite3";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { DashboardStats, StartSessionResponse } from "@comptia/shared-types";
import { pendingMigrations } from "../src/db/migration-check";
import { createTestStack, signUp } from "./helpers";

describe("migration fail-fast check", () => {
  it("reports all migrations pending on an empty database, none after migrating", () => {
    const empty = new Database(":memory:");
    expect(pendingMigrations(empty).length).toBeGreaterThan(0);
    empty.close();

    const stack = createTestStack(); // helper runs the committed migrations
    expect(pendingMigrations(stack.sqlite)).toEqual([]);
  });
});

describe("API auth guard", () => {
  it("rejects unauthenticated requests", async () => {
    const stack = createTestStack();
    for (const path of ["/api/certs", "/api/dashboard?certId=1"]) {
      const res = await request(stack.app).get(path);
      expect(res.status, path).toBe(401);
    }
  });

  it("health and meta are public", async () => {
    const stack = createTestStack();
    expect((await request(stack.app).get("/health")).status).toBe(200);
    expect((await request(stack.app).get("/api/meta")).status).toBe(200);
  });
});

describe("study flow: certs → flashcards → quiz → dashboard", () => {
  it("walks the whole Phase 1 loop", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);

    // certs
    const certsRes = await request(stack.app).get("/api/certs").set("Cookie", cookie);
    expect(certsRes.status).toBe(200);
    expect(certsRes.body).toHaveLength(1);
    const cert = certsRes.body[0];
    expect(cert.code).toBe("aplus");
    expect(cert.domains).toHaveLength(5);
    expect(cert.domains.reduce((s: number, d: { weight: number }) => s + d.weight, 0)).toBe(100);

    // flashcards
    const cardsRes = await request(stack.app)
      .get(`/api/certs/${cert.id}/flashcards`)
      .set("Cookie", cookie);
    expect(cardsRes.status).toBe(200);
    expect(cardsRes.body.cards.length).toBeGreaterThanOrEqual(30);
    expect(cardsRes.body.progress).toEqual({});

    const firstCard = cardsRes.body.cards[0];
    const progressRes = await request(stack.app)
      .post("/api/flashcards/progress")
      .set("Cookie", cookie)
      .send({ certId: cert.id, cardId: firstCard.id, status: "known" });
    expect(progressRes.status).toBe(200);

    const cardsRes2 = await request(stack.app)
      .get(`/api/certs/${cert.id}/flashcards`)
      .set("Cookie", cookie);
    expect(cardsRes2.body.progress[firstCard.id]).toBe("known");

    // reference
    const refRes = await request(stack.app)
      .get(`/api/certs/${cert.id}/reference`)
      .set("Cookie", cookie);
    expect(refRes.status).toBe(200);
    expect(refRes.body.groups.length).toBeGreaterThanOrEqual(5);

    // quiz session
    const startRes = await request(stack.app)
      .post("/api/quiz/sessions")
      .set("Cookie", cookie)
      .send({ certId: cert.id, count: 5 });
    expect(startRes.status).toBe(200);
    const session = startRes.body as StartSessionResponse;
    expect(session.questions).toHaveLength(5);
    for (const q of session.questions) {
      expect(q.type).toBe("mc");
      expect(q).not.toHaveProperty("answerIndex");
      expect(q).not.toHaveProperty("explanation");
    }

    // answer every question with choice 0
    let correctCount = 0;
    for (const q of session.questions) {
      const attempt = await request(stack.app)
        .post("/api/quiz/attempts")
        .set("Cookie", cookie)
        .send({ sessionId: session.sessionId, questionId: q.id, choiceIndex: 0 });
      expect(attempt.status).toBe(200);
      expect(typeof attempt.body.correct).toBe("boolean");
      expect(typeof attempt.body.answerIndex).toBe("number");
      expect(attempt.body.explanation.length).toBeGreaterThan(0);
      if (attempt.body.correct) correctCount++;
    }

    // duplicate answer rejected
    const dupe = await request(stack.app)
      .post("/api/quiz/attempts")
      .set("Cookie", cookie)
      .send({ sessionId: session.sessionId, questionId: session.questions[0]!.id, choiceIndex: 1 });
    expect(dupe.status).toBe(409);

    // complete
    const completeRes = await request(stack.app)
      .post(`/api/quiz/sessions/${session.sessionId}/complete`)
      .set("Cookie", cookie);
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.correct).toBe(correctCount);
    expect(completeRes.body.score).toBe(Math.round((correctCount / 5) * 100));
    expect(completeRes.body.answered).toBe(5);

    // attempts against a finished session are rejected
    const late = await request(stack.app)
      .post("/api/quiz/attempts")
      .set("Cookie", cookie)
      .send({ sessionId: session.sessionId, questionId: session.questions[1]!.id, choiceIndex: 0 });
    expect(late.status).toBe(400);

    // dashboard reflects everything
    const dashRes = await request(stack.app)
      .get(`/api/dashboard?certId=${cert.id}`)
      .set("Cookie", cookie);
    expect(dashRes.status).toBe(200);
    const dash = dashRes.body as DashboardStats;
    expect(dash.flashcards.known).toBe(1);
    expect(dash.quiz.attempts).toBe(5);
    expect(dash.quiz.correct).toBe(correctCount);
    expect(dash.recentSessions).toHaveLength(1);
    expect(dash.quiz.perDomain).toHaveLength(5);
  });

  it("keeps users' data separate", async () => {
    const stack = createTestStack();
    const alice = await signUp(stack.app, { email: "a@example.com" });
    const bob = await signUp(stack.app, { email: "b@example.com" });

    const start = await request(stack.app)
      .post("/api/quiz/sessions")
      .set("Cookie", alice.cookie)
      .send({ certId: stack.certId, count: 3 });
    expect(start.status).toBe(200);

    // bob cannot answer into alice's session
    const res = await request(stack.app)
      .post("/api/quiz/attempts")
      .set("Cookie", bob.cookie)
      .send({
        sessionId: start.body.sessionId,
        questionId: start.body.questions[0].id,
        choiceIndex: 0,
      });
    expect(res.status).toBe(404);
  });

  it("filters quiz sessions by domain", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);
    const res = await request(stack.app)
      .post("/api/quiz/sessions")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, count: 10, domainCodes: ["5.0"] });
    expect(res.status).toBe(200);
    for (const q of res.body.questions) {
      expect(q.domainCode).toBe("5.0");
    }
  });
});
