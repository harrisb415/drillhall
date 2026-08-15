import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestStack, signUp } from "./helpers";

/**
 * Regression for a bug found during Phase 2 browser testing: the client's
 * session hook polls get-session several times a minute, so a single strict
 * budget across all of /api/auth/* returned 429 to a normal studying user.
 */
describe("auth rate limiting", () => {
  it("lets a studying user poll get-session far past the credential budget", async () => {
    const stack = createTestStack({ rateLimit: true });
    const { cookie } = await signUp(stack.app, { email: "poller@example.com" });

    for (let i = 0; i < 120; i++) {
      const res = await request(stack.app).get("/api/auth/get-session").set("Cookie", cookie);
      expect(res.status, `get-session call ${i + 1} was rate limited`).toBe(200);
    }
  }, 30_000);

  it("throttles the email-sending endpoints too", async () => {
    // request-password-reset and send-verification-email each cost an outbound
    // email to a caller-supplied address, so they belong on the tight budget.
    for (const path of ["/api/auth/request-password-reset", "/api/auth/send-verification-email"]) {
      const stack = createTestStack({ rateLimit: true });
      await signUp(stack.app, { email: "mailbomb@example.com" });

      let sawLimit = false;
      for (let i = 0; i < 40; i++) {
        const res = await request(stack.app)
          .post(path)
          .send({ email: "mailbomb@example.com", redirectTo: "http://localhost:3001/x" });
        if (res.status === 429) {
          sawLimit = true;
          break;
        }
      }
      expect(sawLimit, `${path} was never rate limited`).toBe(true);
    }
  }, 30_000);

  it("still throttles repeated failed sign-in attempts", async () => {
    const stack = createTestStack({ rateLimit: true });
    await signUp(stack.app, { email: "target@example.com", password: "correcthorse1" });

    let sawLimit = false;
    for (let i = 0; i < 40; i++) {
      const res = await request(stack.app)
        .post("/api/auth/sign-in/email")
        .send({ email: "target@example.com", password: `guess-${i}` });
      if (res.status === 429) {
        sawLimit = true;
        break;
      }
    }
    expect(sawLimit, "credential endpoint never rate limited").toBe(true);
  }, 30_000);
});
