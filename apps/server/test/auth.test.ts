import { eq } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import * as schema from "../src/db/schema";
import { createTestStack, signUp } from "./helpers";

describe("email/password auth (against committed migrations)", () => {
  it("signs up, creates a session, and sends a verification email", async () => {
    const stack = createTestStack();
    const { status, cookie } = await signUp(stack.app, { email: "alice@example.com", name: "Alice" });
    expect(status).toBe(200);
    expect(cookie).toContain("better-auth");

    const users = stack.db.select().from(schema.user).all();
    expect(users).toHaveLength(1);
    expect(users[0]!.email).toBe("alice@example.com");
    expect(users[0]!.emailVerified).toBe(false);

    // verification email went through the injected provider
    expect(stack.emails).toHaveLength(1);
    expect(stack.emails[0]!.to).toBe("alice@example.com");
    expect(stack.emails[0]!.text).toMatch(/https?:\/\/\S+/);

    // session cookie works
    const session = await request(stack.app).get("/api/auth/get-session").set("Cookie", cookie);
    expect(session.status).toBe(200);
    expect(session.body?.user?.email).toBe("alice@example.com");
  });

  it("verifies the email via the link from the verification email", async () => {
    const stack = createTestStack();
    await signUp(stack.app, { email: "bob@example.com", name: "Bob" });

    const url = stack.emails[0]!.text.match(/https?:\/\/\S+/)![0]!;
    const parsed = new URL(url);
    const res = await request(stack.app).get(parsed.pathname + parsed.search);
    expect([200, 302]).toContain(res.status);

    const user = stack.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, "bob@example.com"))
      .get();
    expect(user?.emailVerified).toBe(true);
  });

  it("rejects wrong passwords and duplicate signups", async () => {
    const stack = createTestStack();
    await signUp(stack.app, { email: "carol@example.com", password: "correcthorse1" });

    const bad = await request(stack.app)
      .post("/api/auth/sign-in/email")
      .send({ email: "carol@example.com", password: "wrong-password" });
    expect(bad.status).toBeGreaterThanOrEqual(400);

    const dupe = await signUp(stack.app, { email: "carol@example.com", password: "correcthorse1" });
    expect(dupe.status).toBeGreaterThanOrEqual(400);

    const good = await request(stack.app)
      .post("/api/auth/sign-in/email")
      .send({ email: "carol@example.com", password: "correcthorse1" });
    expect(good.status).toBe(200);
  });
});

describe("google oauth wiring (provider mocked with fake credentials)", () => {
  it("sign-in/social returns a Google authorization redirect", async () => {
    const stack = createTestStack({
      google: { clientId: "fake-client-id", clientSecret: "fake-secret" },
    });
    const res = await request(stack.app)
      .post("/api/auth/sign-in/social")
      .send({ provider: "google", callbackURL: "/" });
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^https:\/\/accounts\.google\.com\//);
    expect(res.body.url).toContain("fake-client-id");
  });

  it("social sign-in is rejected when Google is not configured", async () => {
    const stack = createTestStack();
    const res = await request(stack.app)
      .post("/api/auth/sign-in/social")
      .send({ provider: "google", callbackURL: "/" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
